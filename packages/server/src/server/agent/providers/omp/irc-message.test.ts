import { describe, expect, test } from "vitest";

import { mapOmpIrcEnvelopeToTimelineItem } from "./irc-message.js";

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

  test("leaves ordinary prose that merely mentions a parent agent alone", () => {
    expect(
      mapOmpIrcEnvelopeToTimelineItem("Please summarize what the parent agent `Main` asked for."),
    ).toBeNull();
  });
});
