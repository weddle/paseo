import { readOmpHubToolFacts } from "./hub-tool.js";
import { readOmpEvalToolFacts } from "./tool-call-detail.js";

/**
 * Reads OMP's structured result payload off a parsed tool result. Every OMP tool may attach
 * `details`; it is the authoritative form of whatever the text output renders.
 */
export function readOmpToolResultDetails(result: unknown): unknown {
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    return undefined;
  }
  return "details" in result ? result.details : undefined;
}

/**
 * Builds the optional `metadata` slice for an OMP tool call.
 *
 * This is the single seam where per-tool structured facts reach the timeline. Tools contribute
 * their own pure facts reader; this module owns the metadata key names so no tool module needs
 * to know how its facts are transported. An empty result spreads to nothing, so a tool with no
 * contribution emits exactly the item it always did.
 *
 * `details` is OMP's structured result payload. Prefer it over parsing rendered text — see the
 * "reads details" rule in docs/omp-coordination.md.
 */
export function buildOmpToolMetadata(
  toolCall: { toolName: string; args?: unknown },
  resultText?: string,
  details?: unknown,
): { metadata?: Record<string, unknown> } {
  const metadata: Record<string, unknown> = {};

  if (toolCall.toolName === "hub") {
    const facts = readOmpHubToolFacts(toolCall.args, resultText, details);
    if (facts.operation) metadata.hubOperation = facts.operation;
    if (facts.target) metadata.hubTarget = facts.target;
    if (facts.deliveries) metadata.hubDeliveries = facts.deliveries;
    if (facts.jobs) metadata.hubJobs = facts.jobs;
  }

  if (toolCall.toolName === "eval") {
    const facts = readOmpEvalToolFacts(toolCall.args, details);
    if (facts.evalLanguage) metadata.evalLanguage = facts.evalLanguage;
    if (facts.evalTitle) metadata.evalTitle = facts.evalTitle;
  }

  return Object.keys(metadata).length > 0 ? { metadata } : {};
}
