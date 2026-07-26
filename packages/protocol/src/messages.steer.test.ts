import { describe, expect, test } from "vitest";
import {
  AgentSnapshotPayloadSchema,
  SessionInboundMessageSchema,
  SessionOutboundMessageSchema,
} from "./messages.js";

function agentSnapshot(
  capabilities: Record<string, boolean>,
  activeForegroundTurnId?: string | null,
) {
  return {
    id: "agent-123",
    provider: "omp",
    cwd: "/tmp/project",
    model: null,
    thinkingOptionId: null,
    effectiveThinkingOptionId: null,
    createdAt: "2026-07-26T00:00:00.000Z",
    updatedAt: "2026-07-26T00:00:00.000Z",
    lastUserMessageAt: null,
    status: "running",
    capabilities,
    ...(activeForegroundTurnId === undefined ? {} : { activeForegroundTurnId }),
    currentModeId: null,
    availableModes: [],
    pendingPermissions: [],
    persistence: null,
    title: null,
    labels: {},
  };
}

describe("agent steering message schemas", () => {
  test("keeps steering capability optional on snapshots", () => {
    const legacy = AgentSnapshotPayloadSchema.parse(
      agentSnapshot({
        supportsStreaming: true,
        supportsSessionPersistence: true,
        supportsDynamicModes: true,
        supportsMcpServers: false,
        supportsReasoningStream: true,
        supportsToolInvocations: true,
      }),
    );
    const omp = AgentSnapshotPayloadSchema.parse(
      agentSnapshot(
        {
          supportsStreaming: true,
          supportsSessionPersistence: true,
          supportsDynamicModes: true,
          supportsMcpServers: false,
          supportsReasoningStream: true,
          supportsToolInvocations: true,
          supportsSteering: true,
        },
        "turn-current",
      ),
    );

    expect(legacy.capabilities.supportsSteering).toBeUndefined();
    expect(legacy.activeForegroundTurnId).toBeUndefined();
    expect(omp.capabilities.supportsSteering).toBe(true);
    expect(omp.activeForegroundTurnId).toBe("turn-current");
  });

  test("validates a text-only correlated steer request and response", () => {
    const request = SessionInboundMessageSchema.parse({
      type: "agent.message.steer.request",
      requestId: "steer-1",
      agentId: "agent-123",
      expectedTurnId: "turn-current",
      prompt: "Prioritize the failing test.",
    });
    const response = SessionOutboundMessageSchema.parse({
      type: "agent.message.steer.response",
      payload: {
        requestId: "steer-1",
        agentId: "agent-123",
        ok: true,
        error: null,
      },
    });

    expect(request).toMatchObject({
      type: "agent.message.steer.request",
      requestId: "steer-1",
      agentId: "agent-123",
      expectedTurnId: "turn-current",
      prompt: "Prioritize the failing test.",
    });
    expect(response).toEqual({
      type: "agent.message.steer.response",
      payload: {
        requestId: "steer-1",
        agentId: "agent-123",
        ok: true,
        error: null,
      },
    });
  });

  test("rejects empty and structured steer prompts before session dispatch", () => {
    expect(
      SessionInboundMessageSchema.safeParse({
        type: "agent.message.steer.request",
        requestId: "steer-1",
        agentId: "agent-123",
        expectedTurnId: "turn-current",
        prompt: [{ type: "text", text: "Prioritize the failing test." }],
      }).success,
    ).toBe(false);
    expect(
      SessionInboundMessageSchema.safeParse({
        type: "agent.message.steer.request",
        requestId: "steer-1",
        agentId: "agent-123",
        expectedTurnId: "turn-current",
        prompt: "",
      }).success,
    ).toBe(false);
    expect(
      SessionInboundMessageSchema.safeParse({
        type: "agent.message.steer.request",
        requestId: "steer-1",
        agentId: "agent-123",
        prompt: "Prioritize the failing test.",
      }).success,
    ).toBe(false);
  });
});
