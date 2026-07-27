import { describe, expect, test } from "vitest";

import { buildOmpHubToolDetail, buildOmpToolMetadata, readOmpHubToolFacts } from "./hub-tool.js";

// Result strings below are verbatim `hub` output captured from a live OMP session.
describe("OMP hub tool facts", () => {
  test("reads the operation, recipient, and delivery state of a send", () => {
    expect(
      readOmpHubToolFacts(
        { op: "send", to: "IrcPing", message: "Reply now." },
        "Delivered to 1 peer(s):\n- IrcPing: injected",
      ),
    ).toEqual({
      operation: "send",
      target: "IrcPing",
      deliveries: [{ agent: "IrcPing", state: "injected" }],
    });
  });

  test("keeps the failure cause but drops OMP's TUI-specific remediation hint", () => {
    expect(
      readOmpHubToolFacts(
        { op: "send", to: "GhostAgent", message: "Anyone there?" },
        'No recipients received the message.\n- GhostAgent: failed — Unknown agent "GhostAgent" — check `irc list` for live peers.',
      ).deliveries,
    ).toEqual([{ agent: "GhostAgent", state: "failed", reason: 'Unknown agent "GhostAgent"' }]);
  });

  test("treats a supervised process name as the operation's target", () => {
    expect(readOmpHubToolFacts({ op: "start", name: "irc-probe" })).toEqual({
      operation: "start",
      target: "irc-probe",
    });
  });

  test("renders a send as the message that was sent", () => {
    expect(buildOmpHubToolDetail({ op: "send", message: "Reply now." }, "Delivered")).toEqual({
      type: "unknown",
      input: "Reply now.",
      output: "Delivered",
    });
  });

  test("leaves non-send operations on the generic rendering", () => {
    expect(buildOmpHubToolDetail({ op: "wait" }, "[abc123] Main: hello")).toBeNull();
  });

  test("contributes metadata only for hub calls", () => {
    expect(buildOmpToolMetadata({ toolName: "read", args: { path: "README.md" } })).toEqual({});
    expect(buildOmpToolMetadata({ toolName: "hub", args: { op: "list" } })).toEqual({
      metadata: { hubOperation: "list" },
    });
  });
});
