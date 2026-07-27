import type { ToolCallDetail } from "../../agent-sdk-types.js";

/**
 * Per-recipient outcome line from a `hub` send, e.g. "- IrcPing: injected" or
 * "- Reviewer: failed — Unknown agent". The state vocabulary belongs to OMP and grows over
 * time, so it is carried through as a string rather than narrowed to an enum here.
 */
const HUB_DELIVERY_LINE_PATTERN = /^-\s+([\w.-]+):\s+([\w-]+)(?:\s*[—–-]\s*(.+))?$/;
// OMP appends its own remediation hint after a dash — "Unknown agent \"X\" — check `irc list`".
// That hint names TUI commands a Paseo user cannot run, so the row keeps only the first clause;
// the untouched result stays visible in the expanded output.
const HUB_DELIVERY_HINT_SEPARATOR = /\s+[—–]\s+/;

export interface OmpHubDelivery {
  agent: string;
  state: string;
  reason?: string;
}

export interface OmpHubToolFacts {
  operation?: string;
  target?: string;
  deliveries?: OmpHubDelivery[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readDeliveries(resultText: string | undefined): OmpHubDelivery[] {
  if (!resultText) {
    return [];
  }
  const deliveries: OmpHubDelivery[] = [];
  for (const line of resultText.split(/\r?\n/)) {
    const match = HUB_DELIVERY_LINE_PATTERN.exec(line.trim());
    const agent = match?.[1];
    const state = match?.[2];
    if (!agent || !state) {
      continue;
    }
    const reason = match[3]?.split(HUB_DELIVERY_HINT_SEPARATOR)[0]?.trim();
    deliveries.push({ agent, state, ...(reason ? { reason } : {}) });
  }
  return deliveries;
}

/**
 * Structured facts about a `hub` call, carried on the timeline item's optional `metadata` so
 * clients that do not know about them keep parsing the item normally.
 */
export function readOmpHubToolFacts(args: unknown, resultText?: string): OmpHubToolFacts {
  const record = isRecord(args) ? args : {};
  const operation = readString(record.op);
  // `to` addresses an agent; `name` addresses a supervised process. Both are the thing the
  // operation acts on, which is what a reader wants in the title.
  const target = readString(record.to) ?? readString(record.name);
  const deliveries = readDeliveries(resultText);
  return {
    ...(operation ? { operation } : {}),
    ...(target ? { target } : {}),
    ...(deliveries.length > 0 ? { deliveries } : {}),
  };
}

/**
 * Renders a `hub` send as the message that was actually sent, so expanding the row shows prose
 * instead of escaped JSON. Other operations keep the generic argument/result rendering.
 */
export function buildOmpHubToolDetail(args: unknown, resultText?: string): ToolCallDetail | null {
  const record = isRecord(args) ? args : {};
  if (readString(record.op) !== "send") {
    return null;
  }
  const message = readString(record.message);
  if (!message) {
    return null;
  }
  return { type: "unknown", input: message, output: resultText ?? null };
}
/**
 * Builds the optional `metadata` slice for an OMP tool call. Only `hub` contributes today; the
 * empty object spreads to nothing, so every other tool emits exactly the item it always did.
 */
export function buildOmpToolMetadata(
  toolCall: { toolName: string; args?: unknown },
  resultText?: string,
): { metadata?: Record<string, unknown> } {
  if (toolCall.toolName !== "hub") {
    return {};
  }
  const facts = readOmpHubToolFacts(toolCall.args, resultText);
  const metadata: Record<string, unknown> = {};
  if (facts.operation) metadata.hubOperation = facts.operation;
  if (facts.target) metadata.hubTarget = facts.target;
  if (facts.deliveries) metadata.hubDeliveries = facts.deliveries;
  return Object.keys(metadata).length > 0 ? { metadata } : {};
}
