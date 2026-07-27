import { describe, expect, test } from "vitest";

import { buildOmpToolMetadata, readOmpToolResultDetails } from "./tool-metadata.js";

describe("OMP tool metadata", () => {
  test("contributes nothing for a tool with no facts reader", () => {
    expect(buildOmpToolMetadata({ toolName: "read", args: { path: "README.md" } })).toEqual({});
  });

  test("carries hub facts through under their metadata keys", () => {
    expect(
      buildOmpToolMetadata({ toolName: "hub", args: { op: "send", to: "IrcPing" } }, undefined, {
        op: "send",
        to: "IrcPing",
        receipts: [{ to: "IrcPing", outcome: "injected" }],
      }),
    ).toEqual({
      metadata: {
        hubOperation: "send",
        hubTarget: "IrcPing",
        hubDeliveries: [{ agent: "IrcPing", state: "injected" }],
      },
    });
  });

  test("omits the metadata slice entirely when a hub call yields no facts", () => {
    expect(buildOmpToolMetadata({ toolName: "hub", args: {} })).toEqual({});
  });

  test("carries eval language and title through under their metadata keys", () => {
    expect(
      buildOmpToolMetadata({ toolName: "eval", args: { language: "py" } }, "37173", {
        language: "python",
        cells: [
          {
            index: 0,
            title: "Loading Codex research report",
            code: "print(len(report))",
            language: "python",
            output: "37173",
            status: "complete",
          },
        ],
      }),
    ).toEqual({
      metadata: { evalLanguage: "python", evalTitle: "Loading Codex research report" },
    });
  });

  test("contributes nothing for an eval call that produced no cells", () => {
    expect(
      buildOmpToolMetadata({ toolName: "eval", args: {} }, undefined, {
        language: "python",
        cells: [],
      }),
    ).toEqual({});
  });
});

describe("OMP tool result details", () => {
  test("reads the details payload off an object result", () => {
    expect(readOmpToolResultDetails({ content: [], details: { op: "list" } })).toEqual({
      op: "list",
    });
  });

  test.each([
    ["a string result", "plain output"],
    ["a null result", null],
    ["a result with no details", { content: [] }],
  ])("yields undefined for %s", (_label, result) => {
    expect(readOmpToolResultDetails(result)).toBeUndefined();
  });
});
