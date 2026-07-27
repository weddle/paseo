import { describe, expect, test } from "vitest";

import { buildOmpHubToolDetail, readOmpHubToolFacts } from "./hub-tool.js";

// Payloads below are verbatim `hub` output captured from live OMP sessions — both the structured
// `details` records and, for the fallback cases, the rendered text.
describe("OMP hub tool facts", () => {
  test("reads recipients and outcomes from the structured receipts", () => {
    expect(
      readOmpHubToolFacts({ op: "send", to: "IrcPing", message: "Reply now." }, undefined, {
        op: "send",
        from: "Main",
        to: "IrcPing",
        receipts: [{ to: "IrcPing", outcome: "injected" }],
      }),
    ).toEqual({
      operation: "send",
      target: "IrcPing",
      deliveries: [{ agent: "IrcPing", state: "injected" }],
    });
  });

  test("carries a receipt error as the delivery reason", () => {
    expect(
      readOmpHubToolFacts({ op: "send", to: "GhostAgent" }, undefined, {
        op: "send",
        receipts: [{ to: "GhostAgent", outcome: "failed", error: 'Unknown agent "GhostAgent"' }],
      }).deliveries,
    ).toEqual([{ agent: "GhostAgent", state: "failed", reason: 'Unknown agent "GhostAgent"' }]);
  });

  test("surfaces the job table a wait reports", () => {
    expect(
      readOmpHubToolFacts({ op: "wait" }, "## Still Running (1)", {
        op: "wait",
        jobs: [
          {
            id: "SteeringServer",
            type: "task",
            status: "running",
            label: "SteeringServer",
            durationMs: 6860,
            resolvedModel: "openai-codex/gpt-5.6-terra:max",
          },
        ],
      }).jobs,
    ).toEqual([
      {
        id: "SteeringServer",
        status: "running",
        label: "SteeringServer",
        kind: "task",
        durationMs: 6860,
      },
    ]);
  });

  test("reports a failed job's error text", () => {
    expect(
      readOmpHubToolFacts({ op: "jobs" }, undefined, {
        op: "jobs",
        jobs: [
          {
            id: "Probe",
            type: "task",
            status: "failed",
            label: "Probe",
            durationMs: 12,
            errorText: "spawn failed",
          },
        ],
      }).jobs,
    ).toEqual([
      {
        id: "Probe",
        status: "failed",
        label: "Probe",
        kind: "task",
        durationMs: 12,
        error: "spawn failed",
      },
    ]);
  });

  test("prefers the operation the result reports over the one the args asked for", () => {
    expect(
      readOmpHubToolFacts({ op: "wait" }, undefined, { op: "inbox", from: "Main", inbox: [] })
        .operation,
    ).toBe("inbox");
  });

  test("treats a supervised process name as the operation's target", () => {
    expect(readOmpHubToolFacts({ op: "start", name: "irc-probe" })).toEqual({
      operation: "start",
      target: "irc-probe",
    });
  });

  test("tolerates a result that carries no operation at all", () => {
    expect(readOmpHubToolFacts({}, undefined, {})).toEqual({});
  });

  describe("without structured details", () => {
    test("falls back to parsing delivery lines out of the rendered text", () => {
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

    test("ignores the text fallback once receipts are present", () => {
      expect(
        readOmpHubToolFacts({ op: "send" }, "- StaleName: injected", {
          op: "send",
          receipts: [{ to: "RealName", outcome: "delivered" }],
        }).deliveries,
      ).toEqual([{ agent: "RealName", state: "delivered" }]);
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
});
