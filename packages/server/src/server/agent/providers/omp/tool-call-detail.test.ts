import { describe, expect, test } from "vitest";

import { parseToolArgs, parseToolResult, readOmpEvalToolFacts } from "./tool-call-detail.js";
import { mapOmpToolDetail } from "./tool-call-mapper.js";

describe("OMP structured tool details", () => {
  test("maps glob details to a search card with its listed files", () => {
    expect(
      mapOmpToolDetail(
        parseToolArgs("glob", { path: "src", gitignore: true, hidden: false, limit: 20 }),
        parseToolResult({
          content: [{ type: "text", text: "legacy output that must not become card content" }],
          details: {
            scopePath: ".",
            fileCount: 3,
            files: ["a/", "b/", "c.ts"],
            truncated: false,
            cwd: "/abs/path",
          },
        }),
      ),
    ).toEqual({
      type: "search",
      query: ".",
      toolName: "glob",
      filePaths: ["a/", "b/", "c.ts"],
      numFiles: 3,
      truncated: false,
    });
  });

  test("maps a single eval cell to shell detail and exposes its display facts", () => {
    const args = { language: "python", code: "print(report.total)" };
    const details = {
      language: "python",
      languages: ["python"],
      cells: [
        {
          index: 0,
          title: "Loading report",
          code: "print(report.total)",
          language: "python",
          output: "37173",
          status: "complete",
          statusEvents: [{ op: "read", path: "report.json" }],
        },
      ],
    };

    expect(mapOmpToolDetail(parseToolArgs("eval", args), parseToolResult({ details }))).toEqual({
      type: "shell",
      command: "print(report.total)",
      output: "37173",
    });
    expect(readOmpEvalToolFacts(args, details)).toEqual({
      evalLanguage: "python",
      evalTitle: "Loading report",
    });
  });

  test("keeps an eval card meaningful when OMP returns no cells", () => {
    const args = { language: "python" };
    const details = { language: "python", languages: ["python"], cells: [] };

    expect(() =>
      mapOmpToolDetail(parseToolArgs("eval", args), parseToolResult({ details })),
    ).not.toThrow();
    expect(mapOmpToolDetail(parseToolArgs("eval", args), parseToolResult({ details }))).toEqual({
      type: "shell",
      command: "eval",
      output: "No evaluation cell was returned.",
    });
    expect(readOmpEvalToolFacts(args, details)).toEqual({});
    expect(readOmpEvalToolFacts(args, undefined)).toEqual({});
  });

  test("marks an errored eval cell as a failed shell result", () => {
    expect(
      mapOmpToolDetail(
        parseToolArgs("eval", { language: "python" }),
        parseToolResult({
          details: {
            language: "python",
            cells: [
              {
                title: "Loading report",
                code: "raise RuntimeError('boom')",
                language: "python",
                output: "Traceback (most recent call last):\nRuntimeError: boom",
                status: "error",
              },
            ],
          },
        }),
      ),
    ).toEqual({
      type: "shell",
      command: "raise RuntimeError('boom')",
      output: "Traceback (most recent call last):\nRuntimeError: boom",
      exitCode: 1,
    });
  });

  test("maps a structured web search answer to a search card", () => {
    expect(
      mapOmpToolDetail(
        parseToolArgs("web_search", { query: "What is ZenMux?" }),
        parseToolResult({
          content: [{ type: "text", text: "legacy answer that must not become card content" }],
          details: {
            response: {
              provider: "codex",
              answer: "## What is ZenMux?\n\nZenMux is a multiplexing service.",
            },
          },
        }),
      ),
    ).toEqual({
      type: "search",
      query: "What is ZenMux?",
      toolName: "web_search",
      content: "## What is ZenMux?\n\nZenMux is a multiplexing service.",
    });
  });

  test("maps structured yield status and data to plain text", () => {
    expect(
      mapOmpToolDetail(
        parseToolArgs("yield", { type: "result" }),
        parseToolResult({
          content: [{ type: "text", text: "legacy yielded result" }],
          details: {
            data: { message: "I ran." },
            status: "success",
            type: "result",
          },
        }),
      ),
    ).toEqual({
      type: "plain_text",
      label: "Yielded success",
      text: "I ran.",
    });
  });
});
