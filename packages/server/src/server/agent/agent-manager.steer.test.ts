import { describe, expect, test, vi } from "vitest";

import { createTestLogger } from "../../test-utils/test-logger.js";
import { AgentManager } from "./agent-manager.js";
import type {
  AgentCapabilityFlags,
  AgentClient,
  AgentPersistenceHandle,
  AgentRunResult,
  AgentSession,
  AgentSessionConfig,
  AgentStreamEvent,
} from "./agent-sdk-types.js";

const AGENT_ID = "00000000-0000-4000-8000-000000000123";
const UNKNOWN_AGENT_ID = "00000000-0000-4000-8000-000000000999";
const TURN_ID = "turn-1";

class SteeringSession implements AgentSession {
  readonly provider = "omp";
  readonly id = "omp-session-1";
  readonly capabilities: AgentCapabilityFlags;
  readonly steeredPrompts: string[] = [];
  readonly subscribers = new Set<(event: AgentStreamEvent) => void>();
  startTurnCalls = 0;
  runCalls = 0;
  interruptBehavior: (() => Promise<void>) | null = null;

  constructor(supportsSteering: boolean) {
    this.capabilities = {
      supportsStreaming: true,
      supportsSessionPersistence: true,
      supportsDynamicModes: false,
      supportsMcpServers: false,
      supportsReasoningStream: true,
      supportsToolInvocations: true,
      ...(supportsSteering ? { supportsSteering: true } : {}),
    };
  }

  async run(): Promise<AgentRunResult> {
    this.runCalls += 1;
    return { sessionId: this.id, finalText: "", timeline: [] };
  }

  async startTurn(): Promise<{ turnId: string }> {
    this.startTurnCalls += 1;
    return { turnId: TURN_ID };
  }

  async steer(prompt: string): Promise<void> {
    this.steeredPrompts.push(prompt);
  }

  subscribe(callback: (event: AgentStreamEvent) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  emit(event: AgentStreamEvent): void {
    for (const callback of this.subscribers) {
      callback(event);
    }
  }

  async *streamHistory(): AsyncGenerator<AgentStreamEvent> {}

  async getRuntimeInfo() {
    return { provider: this.provider, sessionId: this.id };
  }

  async getAvailableModes() {
    return [];
  }

  async getCurrentMode() {
    return null;
  }

  async setMode(): Promise<void> {}

  getPendingPermissions() {
    return [];
  }

  async respondToPermission(): Promise<void> {}

  describePersistence(): AgentPersistenceHandle {
    return { provider: this.provider, sessionId: this.id };
  }

  async interrupt(): Promise<void> {
    await this.interruptBehavior?.();
  }

  async close(): Promise<void> {}
}

class SteeringClient implements AgentClient {
  readonly provider = "omp";
  readonly capabilities: AgentCapabilityFlags;

  constructor(readonly session: SteeringSession) {
    this.capabilities = session.capabilities;
  }

  async createSession(_config: AgentSessionConfig): Promise<AgentSession> {
    return this.session;
  }

  async resumeSession(): Promise<AgentSession> {
    return this.session;
  }

  async fetchCatalog() {
    return { models: [], modes: [] };
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

async function createManager(session: SteeringSession): Promise<AgentManager> {
  const manager = new AgentManager({
    clients: { omp: new SteeringClient(session) },
    idFactory: () => AGENT_ID,
    logger: createTestLogger(),
  });
  await manager.createAgent({ provider: "omp", cwd: process.cwd() }, AGENT_ID, {
    workspaceId: undefined,
  });
  return manager;
}

async function startForegroundRun(
  manager: AgentManager,
): Promise<AsyncGenerator<AgentStreamEvent>> {
  let unsubscribe = () => {};
  const running = new Promise<void>((resolve) => {
    unsubscribe = manager.subscribe(
      (event) => {
        if (event.type === "agent_state" && event.agent.lifecycle === "running") {
          unsubscribe();
          resolve();
        }
      },
      { agentId: AGENT_ID, replayState: false },
    );
  });
  const stream = manager.streamAgent(AGENT_ID, "Initial prompt");
  void stream.next();
  await running;
  return stream;
}

describe("AgentManager.steerAgent", () => {
  test("routes only an eligible foreground turn directly to session.steer", async () => {
    const session = new SteeringSession(true);
    const manager = await createManager(session);
    const stream = await startForegroundRun(manager);
    const streamAgent = vi.spyOn(manager, "streamAgent");
    const replaceAgentRun = vi.spyOn(manager, "replaceAgentRun");

    await manager.steerAgent(AGENT_ID, "Focus on the regression.", TURN_ID);

    expect(session.steeredPrompts).toEqual(["Focus on the regression."]);
    expect(session.startTurnCalls).toBe(1);
    expect(session.runCalls).toBe(0);
    expect(streamAgent).not.toHaveBeenCalled();
    expect(replaceAgentRun).not.toHaveBeenCalled();

    session.emit({ type: "turn_completed", provider: "omp", turnId: TURN_ID });
    await stream.next();
  });

  test("rejects steering while foreground cancellation is in progress", async () => {
    const session = new SteeringSession(true);
    const manager = await createManager(session);
    const stream = await startForegroundRun(manager);
    let signalInterruptStarted!: () => void;
    let releaseInterrupt!: () => void;
    const interruptStarted = new Promise<void>((resolve) => {
      signalInterruptStarted = resolve;
    });
    const interruptGate = new Promise<void>((resolve) => {
      releaseInterrupt = resolve;
    });
    session.interruptBehavior = async () => {
      signalInterruptStarted();
      await interruptGate;
    };

    const cancellation = manager.cancelAgentRun(AGENT_ID);
    await interruptStarted;

    await expect(
      manager.steerAgent(AGENT_ID, "Do not send while cancellation is pending.", TURN_ID),
    ).rejects.toThrow("retry Steer after it settles, or use Queue/Interrupt");
    expect(session.steeredPrompts).toEqual([]);

    releaseInterrupt();
    session.emit({
      type: "turn_canceled",
      provider: "omp",
      turnId: TURN_ID,
      reason: "interrupted",
    });
    await cancellation;
    await stream.next();
  });

  test("rejects unknown, unloaded, unsupported, idle, stale, and empty steering", async () => {
    const unknownManager = new AgentManager({ logger: createTestLogger() });
    await expect(
      unknownManager.steerAgent(UNKNOWN_AGENT_ID, "Focus the test.", TURN_ID),
    ).rejects.toThrow("Unknown agent");

    const unloadedSession = new SteeringSession(true);
    const unloadedManager = await createManager(unloadedSession);
    await unloadedManager.closeAgent(AGENT_ID);
    await expect(unloadedManager.steerAgent(AGENT_ID, "Focus the test.", TURN_ID)).rejects.toThrow(
      "Unknown agent",
    );

    const unsupportedSession = new SteeringSession(false);
    const unsupportedManager = await createManager(unsupportedSession);
    await expect(
      unsupportedManager.steerAgent(AGENT_ID, "Focus the test.", TURN_ID),
    ).rejects.toThrow("does not support steering");

    const idleSession = new SteeringSession(true);
    const idleManager = await createManager(idleSession);
    await expect(idleManager.steerAgent(AGENT_ID, "Focus the test.", TURN_ID)).rejects.toThrow(
      "no active foreground turn",
    );

    const activeSession = new SteeringSession(true);
    const activeManager = await createManager(activeSession);
    const stream = await startForegroundRun(activeManager);
    await expect(
      activeManager.steerAgent(AGENT_ID, "Focus the test.", "turn-stale"),
    ).rejects.toThrow("no longer running expected turn");
    await expect(activeManager.steerAgent(AGENT_ID, "   ", TURN_ID)).rejects.toThrow(
      "non-empty text prompt",
    );
    expect(activeSession.steeredPrompts).toEqual([]);

    activeSession.emit({ type: "turn_completed", provider: "omp", turnId: TURN_ID });
    await stream.next();
  });
});
