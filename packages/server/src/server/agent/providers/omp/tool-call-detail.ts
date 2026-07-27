import { z } from "zod";

import type { ToolCallDetail } from "../../agent-sdk-types.js";

interface BashToolInput {
  command: string;
  timeout?: number;
}

interface ReadToolInput {
  path: string;
  offset?: number;
  limit?: number;
}

interface EditToolInput {
  path: string;
  edits: Array<{
    oldText: string;
    newText: string;
  }>;
}

interface WriteToolInput {
  path: string;
  content: string;
}

interface GrepToolInput {
  pattern: string;
  path?: string;
  glob?: string;
  ignoreCase?: boolean;
  literal?: boolean;
  context?: number;
  limit?: number;
}

interface LsToolInput {
  path?: string;
  limit?: number;
}
interface GlobToolInput {
  path?: string;
  gitignore?: boolean;
  hidden?: boolean;
  limit?: number;
}

interface WebSearchToolInput {
  query?: string;
}

interface EvalToolInput {
  language?: string;
  code?: string;
  title?: string;
}

interface YieldToolInput {}

interface OmpToolResultObject {
  output?: string;
  stdout?: string;
  text?: string;
  content?: OmpToolResultContent[];
  exitCode?: number;
  code?: number;
  details?: OmpToolResultDetails;
}

interface OmpToolResultDetails {
  diff?: string;
  mode?: string;
  xdev?: unknown;
}

interface OmpToolResultTextContent {
  type: "text";
  text: string;
}

interface OmpToolResultUnknownContent {
  type: string;
}

type OmpToolResultContent = OmpToolResultTextContent | OmpToolResultUnknownContent;
export type OmpToolResult = string | OmpToolResultObject | null;

interface OmpBashToolCall {
  kind: "bash";
  toolName: "bash";
  args: BashToolInput;
}

interface OmpReadToolCall {
  kind: "read";
  toolName: "read";
  args: ReadToolInput;
}

interface OmpEditToolCall {
  kind: "edit";
  toolName: "edit";
  args: EditToolInput;
}

interface OmpWriteToolCall {
  kind: "write";
  toolName: "write";
  args: WriteToolInput;
}

interface OmpGrepToolCall {
  kind: "grep";
  toolName: "grep";
  args: GrepToolInput;
}

interface OmpLsToolCall {
  kind: "ls";
  toolName: "ls";
  args: LsToolInput;
}
interface OmpGlobToolCall {
  kind: "glob";
  toolName: "glob";
  args: GlobToolInput;
}

interface OmpWebSearchToolCall {
  kind: "web_search";
  toolName: "web_search";
  args: WebSearchToolInput;
}

interface OmpYieldToolCall {
  kind: "yield";
  toolName: "yield";
  args: YieldToolInput;
}

interface OmpEvalToolCall {
  kind: "eval";
  toolName: "eval";
  args: EvalToolInput;
}

interface OmpUnknownToolCall {
  kind: "unknown";
  toolName: string;
  args: unknown;
}

export type OmpTrackedToolCall =
  | OmpBashToolCall
  | OmpReadToolCall
  | OmpEditToolCall
  | OmpWriteToolCall
  | OmpGrepToolCall
  | OmpLsToolCall
  | OmpGlobToolCall
  | OmpWebSearchToolCall
  | OmpYieldToolCall
  | OmpEvalToolCall
  | OmpUnknownToolCall;

interface ToolCallOutputSummary {
  output?: string;
  exitCode?: number | null;
}

const OmpToolResultTextContentSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

const OmpToolResultUnknownContentSchema = z
  .object({
    type: z.string(),
  })
  .passthrough();

const OmpToolResultContentSchema = z.union([
  OmpToolResultTextContentSchema,
  OmpToolResultUnknownContentSchema,
]);

const OmpToolResultDetailsSchema = z
  .object({
    diff: z.string().optional(),
  })
  .passthrough();

const XdevExecuteDetailsSchema = z.object({
  tool: z.string().trim().min(1),
  mode: z.literal("execute"),
  args: z.unknown().optional(),
  inner: z.unknown().optional(),
});

const OmpToolResultObjectSchema = z
  .object({
    output: z.string().optional(),
    stdout: z.string().optional(),
    text: z.string().optional(),
    content: z.array(OmpToolResultContentSchema).optional(),
    exitCode: z.number().optional(),
    code: z.number().optional(),
    details: OmpToolResultDetailsSchema.optional(),
  })
  .passthrough();

const OmpToolResultSchema = z.union([z.string(), OmpToolResultObjectSchema, z.null()]);

const BashToolInputSchema: z.ZodType<BashToolInput> = z.object({
  command: z.string(),
  timeout: z.number().optional(),
});

const ReadToolInputSchema: z.ZodType<ReadToolInput> = z.object({
  path: z.string(),
  offset: z.number().optional(),
  limit: z.number().optional(),
});

const EditToolInputSchema: z.ZodType<EditToolInput> = z.object({
  path: z.string(),
  edits: z.array(
    z.object({
      oldText: z.string(),
      newText: z.string(),
    }),
  ),
});

const LegacyEditToolInputSchema = z.object({
  path: z.string(),
  old_string: z.string().optional(),
  oldString: z.string().optional(),
  new_string: z.string().optional(),
  newString: z.string().optional(),
});

const WriteToolInputSchema: z.ZodType<WriteToolInput> = z.object({
  path: z.string(),
  content: z.string(),
});

const GrepToolInputSchema: z.ZodType<GrepToolInput> = z.object({
  pattern: z.string(),
  path: z.string().optional(),
  glob: z.string().optional(),
  ignoreCase: z.boolean().optional(),
  literal: z.boolean().optional(),
  context: z.number().optional(),
  limit: z.number().optional(),
});

const LsToolInputSchema: z.ZodType<LsToolInput> = z.object({
  path: z.string().optional(),
  limit: z.number().optional(),
});
const GlobToolInputSchema: z.ZodType<GlobToolInput> = z.object({
  path: z.string().optional(),
  gitignore: z.boolean().optional(),
  hidden: z.boolean().optional(),
  limit: z.number().optional(),
});

const WebSearchToolInputSchema: z.ZodType<WebSearchToolInput> = z.object({
  query: z.string().optional(),
});

const EvalToolInputSchema: z.ZodType<EvalToolInput> = z.object({
  language: z.string().optional(),
  code: z.string().optional(),
  title: z.string().optional(),
});

const YieldToolInputSchema: z.ZodType<YieldToolInput> = z.object({});

const GlobToolDetailsSchema = z.object({
  scopePath: z.string().optional(),
  fileCount: z.number().optional(),
  files: z.array(z.string()).optional(),
  truncated: z.boolean().optional(),
});

const WebSearchToolDetailsSchema = z.object({
  response: z
    .object({
      answer: z.string().optional(),
    })
    .optional(),
});

const YieldToolDetailsSchema = z.object({
  data: z.unknown().optional(),
  status: z.string().optional(),
  type: z.string().optional(),
});

const EvalToolCellSchema = z.object({
  title: z.string().optional(),
  code: z.string().optional(),
  language: z.string().optional(),
  output: z.string().optional(),
  status: z.string().optional(),
});

const EvalToolDetailsSchema = z.object({
  language: z.string().optional(),
  cells: z.array(EvalToolCellSchema).optional(),
});

export function parseToolResult(rawResult: unknown): OmpToolResult {
  const parsed = OmpToolResultSchema.safeParse(rawResult);
  if (parsed.success) {
    return parsed.data;
  }
  return null;
}

export function extractTextFromToolResult(result: OmpToolResult): string | undefined {
  if (typeof result === "string") {
    return result;
  }
  if (!result) {
    return undefined;
  }

  const directText = result.output ?? result.stdout ?? result.text;
  if (directText) {
    return directText;
  }
  if (!result.content) {
    return undefined;
  }

  const textParts: string[] = [];
  for (const block of result.content) {
    if (block.type === "text" && "text" in block) {
      textParts.push(block.text);
    }
  }

  return textParts.length > 0 ? textParts.join("\n") : undefined;
}

export function parseToolArgs(toolName: string, rawArgs: unknown): OmpTrackedToolCall {
  if (toolName === "edit") {
    return parseEditToolArgs(rawArgs);
  }
  return (
    parseOmpKnownToolArgs(toolName, rawArgs) ?? {
      kind: "unknown",
      toolName,
      args: rawArgs ?? null,
    }
  );
}

export function resolveToolCallName(toolCall: OmpTrackedToolCall, result?: OmpToolResult): string {
  if (toolCall.kind === "write" && result && typeof result !== "string") {
    const xdev = XdevExecuteDetailsSchema.safeParse(result.details?.xdev);
    if (xdev.success) {
      return xdev.data.tool;
    }
  }

  return toolCall.toolName;
}

export function mapToolDetail(
  toolCall: OmpTrackedToolCall,
  result?: OmpToolResult,
): ToolCallDetail {
  const parsedResult = result ?? null;

  switch (toolCall.kind) {
    case "bash": {
      const summary = resolveToolCallOutput(parsedResult);
      return {
        type: "shell",
        command: toolCall.args.command,
        output: summary.output,
        exitCode: summary.exitCode,
      };
    }
    case "read":
      return {
        type: "read",
        filePath: toolCall.args.path,
        content: extractTextFromToolResult(parsedResult),
        offset: toolCall.args.offset,
        limit: toolCall.args.limit,
      };
    case "edit": {
      const firstEdit = toolCall.args.edits[0];
      const unifiedDiff =
        parsedResult && typeof parsedResult !== "string" ? parsedResult.details?.diff : undefined;

      return {
        type: "edit",
        filePath: toolCall.args.path,
        oldString: firstEdit?.oldText,
        newString: firstEdit?.newText,
        unifiedDiff,
      };
    }
    case "write":
      return mapWriteToolDetail(toolCall.args, parsedResult);
    case "glob":
      return mapGlobToolDetail(toolCall.args, parsedResult);
    case "web_search":
      return mapWebSearchToolDetail(toolCall.args, parsedResult);
    case "yield":
      return mapYieldToolDetail(parsedResult);
    case "eval":
      return mapEvalToolDetail(toolCall.args, parsedResult);
    case "grep":
      return mapGrepToolDetail(toolCall.args, parsedResult);
    case "ls":
      return mapLsToolDetail(toolCall.args, parsedResult);
    default:
      return {
        type: "unknown",
        input: toolCall.args,
        output: parsedResult,
      };
  }
}

function mapWriteToolDetail(args: WriteToolInput, result: OmpToolResult): ToolCallDetail {
  if (result && typeof result !== "string" && result.details && "xdev" in result.details) {
    const xdev = XdevExecuteDetailsSchema.safeParse(result.details.xdev);
    if (xdev.success) {
      return {
        type: "unknown",
        input: xdev.data.args ?? null,
        output: {
          ...result,
          details: xdev.data.inner ?? null,
        },
      };
    }

    return {
      type: "unknown",
      input: args,
      output: result,
    };
  }

  return {
    type: "write",
    filePath: args.path,
    content: args.content,
  };
}

function resolveToolCallOutput(result: OmpToolResult): ToolCallOutputSummary {
  if (typeof result === "string") {
    return { output: result };
  }
  if (!result) {
    return {};
  }

  const summary: ToolCallOutputSummary = {
    output: extractTextFromToolResult(result),
  };
  if (typeof result.exitCode === "number") {
    summary.exitCode = result.exitCode;
    return summary;
  }
  if (typeof result.code === "number") {
    summary.exitCode = result.code;
    return summary;
  }
  summary.exitCode = null;
  return summary;
}

function normalizeLegacyEditArgs(rawArgs: unknown): EditToolInput | null {
  const parsed = LegacyEditToolInputSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return null;
  }

  const oldText = parsed.data.old_string ?? parsed.data.oldString;
  const newText = parsed.data.new_string ?? parsed.data.newString;
  if (!oldText || newText === undefined) {
    return null;
  }

  return {
    path: parsed.data.path,
    edits: [{ oldText, newText }],
  };
}

function parseEditToolArgs(rawArgs: unknown): OmpTrackedToolCall {
  const parsed = EditToolInputSchema.safeParse(rawArgs);
  if (parsed.success) {
    return { kind: "edit", toolName: "edit", args: parsed.data };
  }
  const legacyArgs = normalizeLegacyEditArgs(rawArgs);
  if (legacyArgs) {
    return { kind: "edit", toolName: "edit", args: legacyArgs };
  }
  return { kind: "unknown", toolName: "edit", args: rawArgs ?? null };
}

type OmpKnownToolKind =
  | "bash"
  | "read"
  | "write"
  | "grep"
  | "ls"
  | "glob"
  | "web_search"
  | "yield"
  | "eval";

/**
 * Tool-name aliases for OMP's built-in tools. A rename upstream is absorbed by adding a key here
 * rather than by falling through to the raw-JSON `unknown` card, which is how `glob` went
 * unrendered while a schema for the superseded `find` name sat unused.
 */
const OMP_TOOL_KIND_BY_NAME: Record<string, OmpKnownToolKind> = {
  bash: "bash",
  read: "read",
  write: "write",
  grep: "grep",
  ls: "ls",
  glob: "glob",
  web_search: "web_search",
  yield: "yield",
  eval: "eval",
};

/**
 * One parser per kind. Each entry owns its own schema so the discriminated union is built
 * without a cast, and adding a tool stays a single-entry change.
 */
const OMP_TOOL_ARG_PARSERS: {
  [K in OmpKnownToolKind]: (rawArgs: unknown) => OmpTrackedToolCall | null;
} = {
  bash: (rawArgs) => {
    const parsed = BashToolInputSchema.safeParse(rawArgs);
    return parsed.success ? { kind: "bash", toolName: "bash", args: parsed.data } : null;
  },
  read: (rawArgs) => {
    const parsed = ReadToolInputSchema.safeParse(rawArgs);
    return parsed.success ? { kind: "read", toolName: "read", args: parsed.data } : null;
  },
  write: (rawArgs) => {
    const parsed = WriteToolInputSchema.safeParse(rawArgs);
    return parsed.success ? { kind: "write", toolName: "write", args: parsed.data } : null;
  },
  grep: (rawArgs) => {
    const parsed = GrepToolInputSchema.safeParse(rawArgs);
    return parsed.success ? { kind: "grep", toolName: "grep", args: parsed.data } : null;
  },
  ls: (rawArgs) => {
    const parsed = LsToolInputSchema.safeParse(rawArgs);
    return parsed.success ? { kind: "ls", toolName: "ls", args: parsed.data } : null;
  },
  glob: (rawArgs) => {
    const parsed = GlobToolInputSchema.safeParse(rawArgs);
    return parsed.success ? { kind: "glob", toolName: "glob", args: parsed.data } : null;
  },
  web_search: (rawArgs) => {
    const parsed = WebSearchToolInputSchema.safeParse(rawArgs);
    return parsed.success
      ? { kind: "web_search", toolName: "web_search", args: parsed.data }
      : null;
  },
  yield: (rawArgs) => {
    const parsed = YieldToolInputSchema.safeParse(rawArgs);
    return parsed.success ? { kind: "yield", toolName: "yield", args: parsed.data } : null;
  },
  eval: (rawArgs) => {
    const parsed = EvalToolInputSchema.safeParse(rawArgs);
    return parsed.success ? { kind: "eval", toolName: "eval", args: parsed.data } : null;
  },
};

function resolveOmpKnownToolKind(toolName: string): OmpKnownToolKind | null {
  return OMP_TOOL_KIND_BY_NAME[toolName.trim()] ?? null;
}

function parseOmpKnownToolArgs(toolName: string, rawArgs: unknown): OmpTrackedToolCall | null {
  const kind = resolveOmpKnownToolKind(toolName);
  // Tools whose arguments are entirely optional still parse from a call recorded without args.
  return kind ? OMP_TOOL_ARG_PARSERS[kind](rawArgs ?? {}) : null;
}

function mapGlobToolDetail(args: GlobToolInput, result: OmpToolResult): ToolCallDetail {
  const details = toolResultDetails(result);
  if (!details) {
    // OMP's structured `details` payload is absent, so retain legacy rendered glob output.
    const content = extractTextFromToolResult(result);
    return {
      type: "search",
      query: args.path ?? "glob",
      toolName: "glob",
      ...(content ? { content } : {}),
    };
  }

  const parsed = GlobToolDetailsSchema.safeParse(details);
  const facts = parsed.success ? parsed.data : {};
  return {
    type: "search",
    query: facts.scopePath ?? args.path ?? "glob",
    toolName: "glob",
    ...(facts.files ? { filePaths: facts.files } : {}),
    ...(typeof facts.fileCount === "number" ? { numFiles: facts.fileCount } : {}),
    ...(typeof facts.truncated === "boolean" ? { truncated: facts.truncated } : {}),
  };
}

function mapWebSearchToolDetail(args: WebSearchToolInput, result: OmpToolResult): ToolCallDetail {
  const details = toolResultDetails(result);
  if (!details) {
    // OMP's structured `details.response.answer` field is absent, so retain legacy rendered output.
    const content = extractTextFromToolResult(result);
    return {
      type: "search",
      query: args.query ?? "web search",
      toolName: "web_search",
      ...(content ? { content } : {}),
    };
  }

  const parsed = WebSearchToolDetailsSchema.safeParse(details);
  const answer = parsed.success ? readNonEmptyString(parsed.data.response?.answer) : undefined;
  return {
    type: "search",
    query: args.query ?? "web search",
    toolName: "web_search",
    ...(answer ? { content: answer } : {}),
  };
}

function mapYieldToolDetail(result: OmpToolResult): ToolCallDetail {
  const details = toolResultDetails(result);
  if (!details) {
    // OMP's structured `details` payload is absent, so retain legacy rendered yield output.
    const text = extractTextFromToolResult(result);
    return {
      type: "plain_text",
      label: "Yielded",
      ...(text ? { text } : {}),
    };
  }

  const parsed = YieldToolDetailsSchema.safeParse(details);
  const status = parsed.success ? readNonEmptyString(parsed.data.status) : undefined;
  const text = parsed.success ? summarizeYieldData(parsed.data.data) : undefined;
  return {
    type: "plain_text",
    label: status ? `Yielded ${status}` : "Yielded",
    ...(text ? { text } : {}),
  };
}

function mapEvalToolDetail(args: EvalToolInput, result: OmpToolResult): ToolCallDetail {
  const details = toolResultDetails(result);
  if (!details) {
    // OMP's structured `details` payload is absent, so retain legacy rendered eval output.
    const output = extractTextFromToolResult(result);
    return {
      type: "shell",
      command: readNonEmptyString(args.code) ?? "eval",
      ...(output ? { output } : {}),
    };
  }

  const parsed = EvalToolDetailsSchema.safeParse(details);
  const cell = parsed.success ? parsed.data.cells?.[0] : undefined;
  if (!cell) {
    return {
      type: "shell",
      command: readNonEmptyString(args.code) ?? "eval",
      output: "No evaluation cell was returned.",
    };
  }

  const output =
    readNonEmptyString(cell.output) ?? (cell.status === "error" ? "Evaluation failed." : undefined);
  return {
    type: "shell",
    command: readNonEmptyString(cell.code) ?? readNonEmptyString(args.code) ?? "eval",
    ...(output ? { output } : {}),
    ...(cell.status === "error" ? { exitCode: 1 } : {}),
  };
}

export function readOmpEvalToolFacts(
  args: unknown,
  details: unknown,
): { evalLanguage?: string; evalTitle?: string } {
  const parsedArgs = EvalToolInputSchema.safeParse(args ?? {});
  const parsedDetails = EvalToolDetailsSchema.safeParse(details);
  if (!parsedArgs.success || !parsedDetails.success) {
    return {};
  }

  const cell = parsedDetails.data.cells?.[0];
  if (!cell) {
    return {};
  }

  const language =
    readNonEmptyString(cell.language) ??
    readNonEmptyString(parsedDetails.data.language) ??
    readNonEmptyString(parsedArgs.data.language);
  const title = readNonEmptyString(cell.title);
  return {
    ...(language ? { evalLanguage: language } : {}),
    ...(title ? { evalTitle: title } : {}),
  };
}

function toolResultDetails(result: OmpToolResult): unknown {
  return result && typeof result !== "string" ? result.details : undefined;
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function summarizeYieldData(data: unknown): string | undefined {
  if (isRecord(data)) {
    const message = readNonEmptyString(data.message);
    if (message) {
      return message;
    }
  }
  if (typeof data === "string") {
    return readNonEmptyString(data);
  }
  if (typeof data === "number" || typeof data === "boolean" || data === null) {
    return String(data);
  }
  if (data === undefined) {
    return undefined;
  }
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mapGrepToolDetail(args: GrepToolInput, result: OmpToolResult): ToolCallDetail {
  return {
    type: "search",
    query: args.pattern,
    toolName: "grep",
    content: typeof result === "string" ? result : undefined,
  };
}

function mapLsToolDetail(args: LsToolInput, result: OmpToolResult): ToolCallDetail {
  return {
    type: "search",
    query: args.path ?? "ls",
    content: typeof result === "string" ? result : undefined,
  };
}
