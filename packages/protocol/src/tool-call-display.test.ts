import { describe, expect, it } from "vitest";

import { buildToolCallDisplayModel } from "./tool-call-display.js";

describe("shared tool-call display mapping", () => {
  it("builds summary from canonical detail", () => {
    const display = buildToolCallDisplayModel({
      name: "read_file",
      status: "running",
      error: null,
      detail: {
        type: "read",
        filePath: "/tmp/repo/src/index.ts",
      },
      cwd: "/tmp/repo",
    });

    expect(display).toEqual({
      displayName: "Read",
      summary: "src/index.ts",
    });
  });

  it("does not infer summaries from unknown raw detail", () => {
    const display = buildToolCallDisplayModel({
      name: "exec_command",
      status: "running",
      error: null,
      detail: {
        type: "unknown",
        input: { command: "npm test" },
        output: null,
      },
    });

    expect(display).toEqual({
      displayName: "Exec Command",
    });
  });

  it("names the recipient and reports delivery for a settled hub send", () => {
    const display = buildToolCallDisplayModel({
      name: "hub",
      status: "completed",
      error: null,
      metadata: {
        hubOperation: "send",
        hubTarget: "IrcPong",
        hubDeliveries: [{ agent: "IrcPong", state: "injected" }],
      },
      detail: { type: "unknown", input: "Please reply now.", output: null },
    });

    expect(display).toEqual({
      displayName: "Sent message to IrcPong",
      summary: "Delivered",
    });
  });

  it("reads as in-progress while the call is still running", () => {
    expect(
      buildToolCallDisplayModel({
        name: "hub",
        status: "running",
        error: null,
        metadata: { hubOperation: "wait" },
        detail: { type: "unknown", input: null, output: null },
      }),
    ).toEqual({ displayName: "Waiting for agent activity" });

    expect(
      buildToolCallDisplayModel({
        name: "hub",
        status: "running",
        error: null,
        metadata: { hubOperation: "send", hubTarget: "IrcPong" },
        detail: { type: "unknown", input: "Please reply now.", output: null },
      }),
    ).toMatchObject({ displayName: "Sending message to IrcPong" });
  });

  it("keeps a canceled call in the settled tense", () => {
    expect(
      buildToolCallDisplayModel({
        name: "hub",
        status: "canceled",
        error: null,
        metadata: { hubOperation: "wait" },
        detail: { type: "unknown", input: null, output: null },
      }),
    ).toEqual({ displayName: "Waited for agent activity" });
  });

  it("surfaces the failure reason when a hub send is not delivered", () => {
    expect(
      buildToolCallDisplayModel({
        name: "hub",
        status: "completed",
        error: null,
        metadata: {
          hubOperation: "send",
          hubTarget: "Ghost",
          hubDeliveries: [{ agent: "Ghost", state: "failed", reason: 'Unknown agent "Ghost"' }],
        },
        detail: { type: "unknown", input: "Anyone there?", output: null },
      }),
    ).toMatchObject({ summary: 'Failed — Unknown agent "Ghost"' });
  });

  it("counts recipients on a broadcast", () => {
    expect(
      buildToolCallDisplayModel({
        name: "hub",
        status: "completed",
        error: null,
        metadata: {
          hubOperation: "send",
          hubDeliveries: [
            { agent: "One", state: "injected" },
            { agent: "Two", state: "revived" },
          ],
        },
        detail: { type: "unknown", input: "Status?", output: null },
      }),
    ).toMatchObject({ displayName: "Sent agent message", summary: "Delivered to 2 agents" });
  });

  it("labels a non-send operation without the recipient phrasing", () => {
    expect(
      buildToolCallDisplayModel({
        name: "hub",
        status: "completed",
        error: null,
        metadata: { hubOperation: "wait" },
        detail: { type: "unknown", input: null, output: null },
      }),
    ).toEqual({ displayName: "Waited for agent activity" });
  });

  it("falls back to a neutral label for an operation it does not know", () => {
    expect(
      buildToolCallDisplayModel({
        name: "hub",
        status: "completed",
        error: null,
        metadata: { hubOperation: "teleport" },
        detail: { type: "unknown", input: null, output: null },
      }),
    ).toEqual({ displayName: "Agent coordination", summary: "teleport" });
  });

  it("uses sub-agent detail for task label and description", () => {
    const display = buildToolCallDisplayModel({
      name: "task",
      status: "running",
      error: null,
      detail: {
        type: "sub_agent",
        subAgentType: "Explore",
        description: "Inspect repository structure",
        log: "[Read] README.md",
      },
    });

    expect(display).toEqual({
      displayName: "Explore",
      summary: "Inspect repository structure",
    });
  });

  it("builds display model for worktree setup detail", () => {
    const display = buildToolCallDisplayModel({
      name: "paseo_worktree_setup",
      status: "running",
      error: null,
      detail: {
        type: "worktree_setup",
        worktreePath: "/tmp/repo/.paseo/worktrees/repo/branch",
        branchName: "feature-branch",
        log: "==> [1/1] Running: npm install\n",
        commands: [
          {
            index: 1,
            command: "npm install",
            cwd: "/tmp/repo/.paseo/worktrees/repo/branch",
            log: "==> [1/1] Running: npm install\n",
            status: "running",
            exitCode: null,
          },
        ],
      },
    });

    expect(display).toEqual({
      displayName: "Worktree Setup",
      summary: "feature-branch",
    });
  });

  it("provides errorText for failed calls", () => {
    const display = buildToolCallDisplayModel({
      name: "shell",
      status: "failed",
      error: { message: "boom" },
      detail: {
        type: "unknown",
        input: null,
        output: null,
      },
    });

    expect(display.errorText).toBe('{\n  "message": "boom"\n}');
  });

  it("labels terminal interaction rows without a summary when no command is available", () => {
    const display = buildToolCallDisplayModel({
      name: "terminal",
      status: "completed",
      error: null,
      detail: {
        type: "plain_text",
        icon: "square_terminal",
      },
    });

    expect(display).toEqual({
      displayName: "Terminal",
    });
  });

  it("uses the command as terminal interaction summary when available", () => {
    const display = buildToolCallDisplayModel({
      name: "terminal",
      status: "completed",
      error: null,
      detail: {
        type: "plain_text",
        label: "npm run test",
        icon: "square_terminal",
      },
    });

    expect(display).toEqual({
      displayName: "Terminal",
      summary: "npm run test",
    });
  });

  it("humanizes Paseo MCP tool names (Claude Code format)", () => {
    const display = buildToolCallDisplayModel({
      name: "mcp__paseo__create_agent",
      status: "running",
      error: null,
      detail: { type: "unknown", input: null, output: null },
    });
    expect(display.displayName).toBe("Create Agent");
  });

  it("humanizes Paseo MCP tool names (Codex format)", () => {
    const display = buildToolCallDisplayModel({
      name: "paseo.create_agent",
      status: "running",
      error: null,
      detail: { type: "unknown", input: null, output: null },
    });
    expect(display.displayName).toBe("Create Agent");
  });

  it("humanizes list_agents Paseo tool", () => {
    const display = buildToolCallDisplayModel({
      name: "mcp__paseo__list_agents",
      status: "running",
      error: null,
      detail: { type: "unknown", input: null, output: null },
    });
    expect(display.displayName).toBe("List Agents");
  });

  it("does not override speak tool display name", () => {
    const display = buildToolCallDisplayModel({
      name: "speak",
      status: "running",
      error: null,
      detail: { type: "unknown", input: null, output: null },
    });
    expect(display.displayName).toBe("Speak");
  });

  it("labels plan detail rows as Plan", () => {
    const display = buildToolCallDisplayModel({
      name: "plan",
      status: "completed",
      error: null,
      detail: {
        type: "plan",
        text: "### Login Screen\n- Build layout",
      },
    });

    expect(display).toEqual({
      displayName: "Plan",
    });
  });
});
