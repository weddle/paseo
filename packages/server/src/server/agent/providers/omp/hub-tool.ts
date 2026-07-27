import type { ToolCallDetail } from "../../agent-sdk-types.js";

/**
 * Per-recipient outcome line from a `hub` send, e.g. "- IrcPing: injected" or
 * "- Reviewer: failed — Unknown agent". The state vocabulary belongs to OMP and grows over
 * time, so it is carried through as a string rather than narrowed to an enum here.
 *
 * Only used when a result carries no structured `details`; see readDeliveries.
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

/** A background job as reported by `hub jobs`, `hub wait`, or `hub cancel`. */
export interface OmpHubJob {
  id: string;
  status: string;
  label?: string;
  kind?: string;
  durationMs?: number;
  error?: string;
}

export interface OmpHubToolFacts {
  operation?: string;
  target?: string;
  deliveries?: OmpHubDelivery[];
  jobs?: OmpHubJob[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Reads per-recipient outcomes from a `hub send`. OMP reports these as
 * `receipts: [{ to, outcome, error? }]`, which is authoritative — the text body is a rendering
 * of the same data.
 */
function readReceipts(details: Record<string, unknown>): OmpHubDelivery[] {
  const raw = details.receipts;
  if (!Array.isArray(raw)) {
    return [];
  }
  const deliveries: OmpHubDelivery[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) {
      continue;
    }
    const agent = readString(entry.to);
    const state = readString(entry.outcome);
    if (!agent || !state) {
      continue;
    }
    // The structured error carries the same TUI remediation hint the rendered text does.
    const reason = readString(entry.error)?.split(HUB_DELIVERY_HINT_SEPARATOR)[0]?.trim();
    deliveries.push({ agent, state, ...(reason ? { reason } : {}) });
  }
  return deliveries;
}

/**
 * Fallback for OMP builds that report deliveries only in the rendered text. `receipts` is the
 * structured form and is preferred whenever present.
 */
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
 * Reads the job table OMP attaches to `jobs`, `wait`, and `cancel`. There is no text fallback:
 * the rendered form is a prose summary that cannot be recovered into per-job rows.
 */
function readJobs(details: Record<string, unknown>): OmpHubJob[] {
  const raw = details.jobs;
  if (!Array.isArray(raw)) {
    return [];
  }
  const jobs: OmpHubJob[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) {
      continue;
    }
    const id = readString(entry.id);
    const status = readString(entry.status);
    if (!id || !status) {
      continue;
    }
    const label = readString(entry.label);
    const kind = readString(entry.type);
    const durationMs = readNumber(entry.durationMs);
    const error = readString(entry.errorText);
    jobs.push({
      id,
      status,
      ...(label ? { label } : {}),
      ...(kind ? { kind } : {}),
      ...(durationMs !== undefined ? { durationMs } : {}),
      ...(error ? { error } : {}),
    });
  }
  return jobs;
}

/**
 * Structured facts about a `hub` call, carried on the timeline item's optional `metadata` so
 * clients that do not know about them keep parsing the item normally.
 *
 * `details` is OMP's own structured result and is authoritative. Args and result text are only
 * consulted for facts it does not carry, or for OMP builds that omit it entirely.
 */
export function readOmpHubToolFacts(
  args: unknown,
  resultText?: string,
  details?: unknown,
): OmpHubToolFacts {
  const argRecord = isRecord(args) ? args : {};
  const detailRecord = isRecord(details) ? details : {};
  // The result reports the operation OMP actually ran; args report the one that was asked for.
  const operation = readString(detailRecord.op) ?? readString(argRecord.op);
  // `to` addresses an agent; `name` addresses a supervised process. Both are the thing the
  // operation acts on, which is what a reader wants in the title.
  const target =
    readString(detailRecord.to) ?? readString(argRecord.to) ?? readString(argRecord.name);
  const receipts = readReceipts(detailRecord);
  const deliveries = receipts.length > 0 ? receipts : readDeliveries(resultText);
  const jobs = readJobs(detailRecord);
  return {
    ...(operation ? { operation } : {}),
    ...(target ? { target } : {}),
    ...(deliveries.length > 0 ? { deliveries } : {}),
    ...(jobs.length > 0 ? { jobs } : {}),
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
