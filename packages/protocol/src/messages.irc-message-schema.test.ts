import { describe, expect, test } from "vitest";

import { AgentTimelineItemPayloadSchema } from "./messages.js";

describe("IRC timeline payload schema", () => {
  test("preserves a delivery-aware inbound IRC message", () => {
    expect(
      AgentTimelineItemPayloadSchema.parse({
        type: "irc_message",
        sender: "CodexAppServerResearch",
        recipient: "OmpIrcTimeline",
        replyTo: "inbox-42",
        body: "Use a typed timeline card instead of assistant Markdown.",
        deliveryState: "delivered",
      }),
    ).toEqual({
      type: "irc_message",
      sender: "CodexAppServerResearch",
      recipient: "OmpIrcTimeline",
      replyTo: "inbox-42",
      body: "Use a typed timeline card instead of assistant Markdown.",
      deliveryState: "delivered",
    });
  });
});
