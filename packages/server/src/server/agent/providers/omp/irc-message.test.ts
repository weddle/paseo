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
});
