import { describe, expect, test } from "vitest";

import { OmpSubagentIndex } from "./subagent-index.js";

describe("OMP provider subagent mapper", () => {
  test("maps lifecycle and progress frames to stable provider_subagent descriptors", () => {
    const index = new OmpSubagentIndex();
    const parent = {};
    expect(
      index.handleLifecycle(parent, {
        id: "child-1",
        agent: "explore",
        description: "Inspect files",
        status: "started",
        parentToolCallId: "task-1",
        index: 0,
      }),
    ).toEqual([
      {
        type: "provider_subagent",
        provider: "omp",
        event: {
          type: "upsert",
          id: "child-1",
          title: "child-1 · explore",
          description: "Inspect files",
          status: "running",
          toolCallId: "task-1",
        },
      },
    ]);

    expect(
      index.handleProgress(parent, {
        index: 0,
        agent: "explore",
        task: "Inspect files",
        parentToolCallId: "task-1",
        progress: {
          id: "child-1",
          status: "running",
          resolvedModel: "openai-codex/gpt-5.5",
        },
      })[0],
    ).toMatchObject({
      event: {
        id: "child-1",
        status: "running",
        title: "child-1 · explore · gpt-5.5 (openai-codex)",
      },
    });

    expect(
      index.handleProgress(parent, {
        index: 0,
        agent: "explore",
        task: "Inspect files",
        parentToolCallId: "task-1",
        progress: {
          id: "child-1",
          status: "completed",
          resolvedModel: "anthropic/claude-sonnet-5",
        },
      })[0],
    ).toMatchObject({
      event: {
        id: "child-1",
        status: "completed",
        title: "child-1 · explore · claude-sonnet-5 (anthropic)",
      },
    });
  });

  test("maps child message events onto the descriptor timeline", () => {
    const index = new OmpSubagentIndex();
    const parent = {};
    expect(
      index.handleEvent(parent, {
        id: "child-1",
        event: {
          type: "message_end",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Child answer" }],
          },
        },
      }),
    ).toEqual([
      {
        type: "provider_subagent",
        provider: "omp",
        event: {
          type: "timeline",
          id: "child-1",
          item: {
            type: "assistant_message",
            text: "Child answer",
            messageId: "omp-history-assistant-1",
          },
        },
      },
    ]);
  });

  test("maps IRC envelopes from a child assistant message onto its timeline", () => {
    const index = new OmpSubagentIndex();
    const parent = {};

    expect(
      index.handleEvent(parent, {
        id: "child-1",
        event: {
          type: "message_end",
          message: {
            role: "assistant",
            content: [
              {
                type: "text",
                text: '<irc sender="reviewer" recipient="child-1">Check the reducer.</irc>',
              },
            ],
          },
        },
      }),
    ).toEqual([
      {
        type: "provider_subagent",
        provider: "omp",
        event: {
          type: "timeline",
          id: "child-1",
          item: {
            type: "irc_message",
            sender: "reviewer",
            recipient: "child-1",
            body: "Check the reducer.",
            deliveryState: "delivered",
          },
        },
      },
    ]);
  });

  // The observed failure: a parent's hub message lands in the child transcript as a plain
  // user message with no <irc> wrapper, so the child pane rendered it as ordinary prose.
  test("maps a parent steering message in a child transcript onto its timeline", () => {
    const index = new OmpSubagentIndex();
    const parent = {};

    expect(
      index.handleEvent(parent, {
        id: "child-1",
        event: {
          type: "message_end",
          message: {
            role: "user",
            content: [
              "Your current interruptible wait was interrupted because an IRC message arrived from your parent agent `Main`.",
              "",
              "Parent IRC message:",
              "",
              "IrcPing, message IrcPong once.",
            ].join("\n"),
          },
        },
      }),
    ).toEqual([
      {
        type: "provider_subagent",
        provider: "omp",
        event: {
          type: "timeline",
          id: "child-1",
          item: {
            type: "irc_message",
            sender: "Main",
            body: "IrcPing, message IrcPong once.",
            deliveryState: "delivered",
          },
        },
      },
    ]);
  });

  // When a child deliberately waits, its inbound message arrives as the `hub` tool result
  // rather than an injection, so the pane showed only an opaque tool row.
  test("cards messages a child received through a hub wait result", () => {
    const index = new OmpSubagentIndex();
    const parent = {};

    const events = index.handleEvent(parent, {
      id: "child-1",
      event: {
        type: "message_end",
        message: {
          role: "toolResult",
          toolCallId: "call-1",
          toolName: "hub",
          content: [{ type: "text", text: "[15403b1659347de5] Main: Reply once, then yield." }],
        },
      },
    });

    expect(events).toContainEqual({
      type: "provider_subagent",
      provider: "omp",
      event: {
        type: "timeline",
        id: "child-1",
        item: {
          type: "irc_message",
          sender: "Main",
          body: "Reply once, then yield.",
          deliveryState: "delivered",
        },
      },
    });
  });

  // "From IrcPing" on an IRC card is only useful if a pane is labelled IrcPing.
  test("leads the subagent title with the spawn name the parent assigned", () => {
    const index = new OmpSubagentIndex();

    expect(
      index.handleLifecycle({}, { id: "IrcPing", agent: "scout", status: "started", index: 0 })[0],
    ).toMatchObject({ event: { title: "IrcPing · scout" } });
  });

  test("omits a generated spawn id and a name that only repeats the agent type", () => {
    const index = new OmpSubagentIndex();

    expect(
      index.handleLifecycle(
        {},
        { id: "153f4e8c7035685e", agent: "scout", status: "started", index: 0 },
      )[0],
    ).toMatchObject({ event: { title: "scout" } });

    expect(
      index.handleLifecycle({}, { id: "scout", agent: "scout", status: "started", index: 0 })[0],
    ).toMatchObject({ event: { title: "scout" } });
  });

  test("maps aborted lifecycle status to canceled", () => {
    const index = new OmpSubagentIndex();
    const parent = {};
    expect(
      index.handleLifecycle(parent, {
        id: "child-1",
        agent: "task",
        status: "aborted",
        index: 0,
      })[0],
    ).toMatchObject({ event: { id: "child-1", status: "canceled" } });
  });
});
