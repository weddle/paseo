import { describe, expect, test } from "vitest";

import { mapOmpHubDeliveredMessages, mapOmpIrcEnvelopeToTimelineItem } from "./irc-message.js";

describe("OMP IRC envelope mapper", () => {
  test("maps an inbound IRC envelope into its delivery-aware timeline item", () => {
    expect(
      mapOmpIrcEnvelopeToTimelineItem(
        [
          '<irc recipient="OmpIrcTimeline" reply-to="inbox-42" delivery-state="delivered">',
          "Incoming IRC message from agent `CodexAppServerResearch`:",
          "",
          "Use a typed timeline card instead of assistant Markdown.",
          "</irc>",
        ].join("\n"),
      ),
    ).toEqual({
      type: "irc_message",
      sender: "CodexAppServerResearch",
      recipient: "OmpIrcTimeline",
      replyTo: "inbox-42",
      body: "Use a typed timeline card instead of assistant Markdown.",
      deliveryState: "delivered",
    });
  });

  // Exactly what prompts/system/irc-incoming.md renders for an interrupting peer reply.
  test("keeps the parenthesized reply target out of the sender and drops harness trailers", () => {
    expect(
      mapOmpIrcEnvelopeToTimelineItem(
        [
          "<irc>",
          "Incoming IRC message from agent `IrcPing` (replying to 154034a88015b775):",
          "",
          "Acknowledged — ready for the sibling exchange.",
          "",
          "An agent sent this while you were waiting or working. Any active interruptible wait was stopped early so you can read it now.",
          "",
          'If a response is expected, reply with the `hub` tool (`op: "send"`, `to: "IrcPing"`) — you may finish your current step first. Nobody replies on your behalf.',
          "</irc>",
        ].join("\n"),
      ),
    ).toEqual({
      type: "irc_message",
      sender: "IrcPing",
      replyTo: "154034a88015b775",
      body: "Acknowledged — ready for the sibling exchange.",
      deliveryState: "delivered",
    });
  });

  test("drops the auto-reply trailer without swallowing a multi-paragraph message", () => {
    expect(
      mapOmpIrcEnvelopeToTimelineItem(
        [
          "<irc>",
          "Incoming IRC message from agent `Main`:",
          "",
          "First paragraph.",
          "",
          "Second paragraph.",
          "",
          "You are mid-task, so a side-channel auto-reply was generated from your context and delivered to `Main` on your behalf (recorded after this message).",
          "</irc>",
        ].join("\n"),
      ),
    ).toMatchObject({
      sender: "Main",
      body: "First paragraph.\n\nSecond paragraph.",
    });
  });

  // Exactly what prompts/steering/parent-irc.md renders into a subagent transcript. It carries
  // no <irc> wrapper, so before this the child pane fell through to plain user-message text.
  test("maps a parent's steering message to a subagent into a card", () => {
    expect(
      mapOmpIrcEnvelopeToTimelineItem(
        [
          "Your current interruptible wait was interrupted because an IRC message arrived from your parent agent `Main`.",
          "",
          "Parent IRC message:",
          "",
          "IrcPing, message IrcPong once; IrcPong, message IrcPing once.",
        ].join("\n"),
      ),
    ).toEqual({
      type: "irc_message",
      sender: "Main",
      body: "IrcPing, message IrcPong once; IrcPong, message IrcPing once.",
      deliveryState: "delivered",
    });
  });

  test("maps typed parent steering without relying on the prose label", () => {
    expect(
      mapOmpIrcEnvelopeToTimelineItem("Continue with the requested implementation.", {
        steering: true,
        attribution: "agent",
      }),
    ).toEqual({
      type: "irc_message",
      sender: "Parent agent",
      body: "Continue with the requested implementation.",
      deliveryState: "delivered",
    });
  });

  test("leaves ordinary prose that merely mentions a parent agent alone", () => {
    expect(
      mapOmpIrcEnvelopeToTimelineItem("Please summarize what the parent agent `Main` asked for."),
    ).toBeNull();
  });

  // Upstream owns this prose and may reword it. Only the label is load-bearing; a reworded
  // sentence must still card, and an unrecognized attribution must degrade, not drop.
  test("still cards a parent message when the sentence around the label is reworded", () => {
    expect(
      mapOmpIrcEnvelopeToTimelineItem(
        [
          "A message came in from your parent agent `Main` while you waited.",
          "",
          "Parent IRC message:",
          "",
          "Carry on.",
        ].join("\n"),
      ),
    ).toMatchObject({ sender: "Main", body: "Carry on." });

    expect(
      mapOmpIrcEnvelopeToTimelineItem(
        ["Something entirely new.", "", "Parent IRC message:", "", "Carry on."].join("\n"),
      ),
    ).toMatchObject({ sender: "Parent agent", body: "Carry on." });
  });
});

// Verbatim `custom_message` entry of type `irc:incoming` captured from a live OMP session.
describe("OMP peer interrupt, from structured details", () => {
  const content = [
    "<irc>",
    "Incoming IRC message from agent `IrcPing` (replying to 154065b77ac893ab):",
    "",
    "Acknowledged your instruction.",
    "",
    "My agent name is IrcPing.",
    "",
    "An agent sent this while you were waiting or working. Any active interruptible wait was stopped early so you can read it now.",
    "",
    'If a response is expected, reply with the `hub` tool (`op: "send"`, `to: "IrcPing"`) — you may finish your current step first. Nobody replies on your behalf.',
    "</irc>",
  ].join("\n");
  const details = {
    id: "154065ba918893af",
    from: "IrcPing",
    message: "Acknowledged your instruction.\n\nMy agent name is IrcPing.",
    replyTo: "154065b77ac893ab",
  };

  test("cards the interrupt from the parsed record, not the envelope", () => {
    expect(
      mapOmpIrcEnvelopeToTimelineItem(content, {
        customType: "irc:incoming",
        attribution: "agent",
        details,
      }),
    ).toEqual({
      type: "irc_message",
      sender: "IrcPing",
      replyTo: "154065b77ac893ab",
      body: "Acknowledged your instruction.\n\nMy agent name is IrcPing.",
      deliveryState: "delivered",
    });
  });

  test("falls back to the envelope when the record carries no details", () => {
    expect(
      mapOmpIrcEnvelopeToTimelineItem(content, {
        customType: "irc:incoming",
        attribution: "agent",
      }),
    ).toMatchObject({ sender: "IrcPing", body: details.message });
  });

  test("does not treat a peer interrupt as parent steering", () => {
    const item = mapOmpIrcEnvelopeToTimelineItem(content, {
      customType: "irc:incoming",
      attribution: "agent",
      details,
    });
    expect(item?.sender).not.toBe("Parent agent");
  });
});

// `details` payloads below are verbatim structured `hub` results captured from a live OMP session.
describe("OMP hub delivered-message mapper, from structured details", () => {
  test("maps a waited-for reply from the record rather than the rendered line", () => {
    expect(
      mapOmpHubDeliveredMessages("[153f4e8c7035685e] SteeringComposer: rendered form", {
        op: "wait",
        from: "Main",
        waited: {
          from: "SteeringComposer",
          to: "Main",
          body: "Are you handling client API integration?",
          id: "153f4e8c7035685e",
          ts: 1785096102336,
        },
      }),
    ).toEqual([
      {
        type: "irc_message",
        sender: "SteeringComposer",
        recipient: "Main",
        body: "Are you handling client API integration?",
        deliveryState: "delivered",
      },
    ]);
  });

  test("carries the reply target when the record has one", () => {
    expect(
      mapOmpHubDeliveredMessages("", {
        op: "wait",
        waited: {
          from: "IrcPong",
          to: "Main",
          replyTo: "15403b1659347de6",
          body: "Acknowledged.",
          id: "15403b188a347de7",
        },
      })[0],
    ).toMatchObject({ sender: "IrcPong", replyTo: "15403b1659347de6" });
  });

  test("maps every message an inbox result carries", () => {
    expect(
      mapOmpHubDeliveredMessages("", {
        op: "inbox",
        from: "Main",
        inbox: [
          { from: "IrcPong", to: "Main", body: "first", id: "a" },
          { from: "IrcPing", to: "Main", body: "second", id: "b" },
        ],
      }),
    ).toEqual([
      expect.objectContaining({ sender: "IrcPong", body: "first" }),
      expect.objectContaining({ sender: "IrcPing", body: "second" }),
    ]);
  });

  test.each([
    ["a wait that timed out", { op: "wait", from: "Main", waited: null }],
    ["an empty inbox", { op: "inbox", from: "Main", inbox: [] }],
    ["a job snapshot", { op: "wait", jobs: [{ id: "Probe", status: "running" }] }],
  ])("yields nothing for %s, without falling back to the text", (_label, details) => {
    expect(mapOmpHubDeliveredMessages("[abc123] Ghost: should not be read", details)).toEqual([]);
  });

  test("falls back to the rendered text when the result carries no details", () => {
    expect(
      mapOmpHubDeliveredMessages("[15403b0f67347de3] IrcPong: README title: Context", undefined),
    ).toEqual([expect.objectContaining({ sender: "IrcPong", body: "README title: Context" })]);
  });
});

// Strings below are verbatim `hub` tool results captured from a live OMP session.
describe("OMP hub delivered-message mapper", () => {
  test("maps a waited-for reply, keeping its reply target and multi-paragraph body", () => {
    expect(
      mapOmpHubDeliveredMessages(
        [
          "[15403b188a347de7] IrcPong (reply to 15403b1659347de6): Acknowledged your instruction and confirm I am the pong pane.",
          "",
          "IrcPong",
        ].join("\n"),
      ),
    ).toEqual([
      {
        type: "irc_message",
        sender: "IrcPong",
        replyTo: "15403b1659347de6",
        body: "Acknowledged your instruction and confirm I am the pong pane.\n\nIrcPong",
        deliveryState: "delivered",
      },
    ]);
  });

  test("maps every message in a batched inbox result", () => {
    expect(
      mapOmpHubDeliveredMessages(
        [
          "[15403b0f67347de3] IrcPong: README title: Context",
          "[15403b1193f47de4] IrcPing: README title: Context",
        ].join("\n"),
      ),
    ).toEqual([
      expect.objectContaining({ sender: "IrcPong", body: "README title: Context" }),
      expect.objectContaining({ sender: "IrcPing", body: "README title: Context" }),
    ]);
  });

  test.each([
    ["an elided wait", "[Uneventful result elided]"],
    ["a send receipt", "Delivered to 1 peer(s):\n- IrcPing: injected"],
    ["a job snapshot", "## Completed (1)\n\n### IrcPong [task] — completed\nLabel: IrcPong"],
    ["an empty result", ""],
  ])("yields nothing for %s", (_label, result) => {
    expect(mapOmpHubDeliveredMessages(result)).toEqual([]);
  });
});
