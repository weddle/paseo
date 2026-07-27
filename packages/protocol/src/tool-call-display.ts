import type { ToolCallTimelineItem } from "./agent-types.js";
import { getPaseoToolLeafName, isPaseoToolName } from "./tool-name-normalization.js";
import { stripCwdPrefix } from "./path-utils.js";

export type ToolCallDisplayInput = Pick<
  ToolCallTimelineItem,
  "name" | "status" | "error" | "metadata" | "detail"
> & {
  cwd?: string;
};

export interface ToolCallDisplayModel {
  displayName: string;
  summary?: string;
  errorText?: string;
}

interface DetailDisplay {
  displayName?: string;
  summary?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function humanizeToolName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return name;
  }
  if (isPaseoToolName(trimmed)) {
    const leaf = getPaseoToolLeafName(trimmed);
    if (leaf) {
      return humanizeToolName(leaf);
    }
  }
  if (/[:./]/.test(trimmed) || trimmed.includes("__")) {
    return trimmed;
  }

  return trimmed
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter((segment) => segment.length > 0)
    .map((segment) => `${segment[0]?.toUpperCase() ?? ""}${segment.slice(1)}`)
    .join(" ");
}

function formatErrorText(error: unknown): string | undefined {
  if (error === null || error === undefined) {
    return undefined;
  }
  if (typeof error === "string") {
    return error;
  }
  if (isRecord(error) && typeof error.content === "string") {
    return error.content;
  }
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

function buildFilePathDisplay(
  displayName: string,
  filePath: string,
  cwd: string | undefined,
): DetailDisplay {
  return {
    displayName,
    summary: stripCwdPrefix(filePath, cwd),
  };
}

function buildCanonicalDetailDisplay(input: ToolCallDisplayInput): DetailDisplay {
  switch (input.detail.type) {
    case "shell":
      return {
        displayName: "Shell",
        summary: input.detail.command,
      };
    case "read":
      return buildFilePathDisplay("Read", input.detail.filePath, input.cwd);
    case "edit":
      return buildFilePathDisplay("Edit", input.detail.filePath, input.cwd);
    case "write":
      return buildFilePathDisplay("Write", input.detail.filePath, input.cwd);
    case "search":
      return {
        displayName: "Search",
        summary: input.detail.query,
      };
    case "fetch":
      return {
        displayName: "Fetch",
        summary: input.detail.url,
      };
    case "worktree_setup":
      return {
        displayName: "Worktree Setup",
        summary: input.detail.branchName,
      };
    case "sub_agent":
      return {
        displayName: readString(input.detail.subAgentType) ?? "Task",
        summary: readString(input.detail.description),
      };
    case "plain_text":
      return {
        summary: input.detail.label,
      };
    case "plan":
      return {
        displayName: "Plan",
      };
    case "unknown":
      return {};
    default:
      throw new Error("unreachable");
  }
}

interface HubOperationLabel {
  /** Phrase used when the call names no specific target. */
  active: string;
  settled: string;
  /**
   * Verb used when the call does name one. The target then renders as the row summary, matching
   * how Read/Shell/Search split the verb from its subject, and reproducing OMP's own phrasing —
   * `tools/hub/launch.ts` reports "Started <name>", never "Started process <name>".
   */
  activeWithTarget?: string;
  settledWithTarget?: string;
}

// Operation labels for OMP's `hub` agent-coordination tool. A row is a live indicator while the
// call runs and a record of what happened once it settles, so each label carries both tenses.
// An unrecognized operation falls back to a neutral label rather than inventing one.
const HUB_OPERATION_LABELS: Record<string, HubOperationLabel> = {
  send: { active: "Sending agent message", settled: "Sent agent message" },
  wait: { active: "Waiting for agent activity", settled: "Waited for agent activity" },
  inbox: { active: "Reading agent inbox", settled: "Read agent inbox" },
  list: { active: "Listing agents", settled: "Listed agents" },
  jobs: { active: "Checking agent jobs", settled: "Checked agent jobs" },
  cancel: { active: "Canceling agent work", settled: "Canceled agent work" },
  ps: { active: "Listing processes", settled: "Listed processes" },
  start: {
    active: "Starting process",
    settled: "Started process",
    activeWithTarget: "Starting",
    settledWithTarget: "Started",
  },
  stop: {
    active: "Stopping process",
    settled: "Stopped process",
    activeWithTarget: "Stopping",
    settledWithTarget: "Stopped",
  },
  restart: {
    active: "Restarting process",
    settled: "Restarted process",
    activeWithTarget: "Restarting",
    settledWithTarget: "Restarted",
  },
  logs: {
    active: "Reading process logs",
    settled: "Read process logs",
    activeWithTarget: "Reading logs",
    settledWithTarget: "Read logs",
  },
  describe: {
    active: "Describing process",
    settled: "Described process",
    activeWithTarget: "Describing",
    settledWithTarget: "Described",
  },
};
// A `hub` send names each recipient and how it landed, so the row can state the outcome instead
// of leaving it inside collapsed output.
const HUB_FAILED_DELIVERY_STATE = "failed";

interface HubDelivery {
  agent: string;
  state: string;
  reason?: string;
}

function readHubDeliveries(metadata: unknown): HubDelivery[] {
  const raw = isRecord(metadata) ? metadata.hubDeliveries : undefined;
  if (!Array.isArray(raw)) {
    return [];
  }
  const deliveries: HubDelivery[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) {
      continue;
    }
    const agent = readString(entry.agent);
    const state = readString(entry.state);
    if (agent && state) {
      deliveries.push({
        agent,
        state,
        ...(readString(entry.reason) ? { reason: String(entry.reason) } : {}),
      });
    }
  }
  return deliveries;
}

function hubDeliverySummary(deliveries: HubDelivery[]): string | undefined {
  if (deliveries.length === 0) {
    return undefined;
  }
  const failed = deliveries.filter((delivery) => delivery.state === HUB_FAILED_DELIVERY_STATE);
  if (failed.length > 0) {
    const reason = failed[0]?.reason;
    return reason ? `Failed — ${reason}` : "Failed";
  }
  return deliveries.length === 1 ? "Delivered" : `Delivered to ${deliveries.length} agents`;
}

// `jobs`, `wait`, and `cancel` report a job table. The row states what it found, because the
// rendered result is a prose block that collapses out of view.
interface HubJob {
  id: string;
  status: string;
  label?: string;
}

function readHubJobs(metadata: unknown): HubJob[] {
  const raw = isRecord(metadata) ? metadata.hubJobs : undefined;
  if (!Array.isArray(raw)) {
    return [];
  }
  const jobs: HubJob[] = [];
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
    jobs.push({ id, status, ...(label ? { label } : {}) });
  }
  return jobs;
}

function hubJobSummary(jobs: HubJob[]): string | undefined {
  const only = jobs.length === 1 ? jobs[0] : undefined;
  if (only) {
    return `${only.label ?? only.id} — ${only.status}`;
  }
  if (jobs.length === 0) {
    return undefined;
  }
  const counts = new Map<string, number>();
  for (const job of jobs) {
    counts.set(job.status, (counts.get(job.status) ?? 0) + 1);
  }
  return Array.from(counts, ([status, count]) => `${count} ${status}`).join(", ");
}

function hubDisplay(input: ToolCallDisplayInput): DetailDisplay {
  const metadata = isRecord(input.metadata) ? input.metadata : {};
  const operation = readString(metadata.hubOperation);
  const target = readString(metadata.hubTarget);
  const isActive = input.status === "running";
  const labels = operation ? HUB_OPERATION_LABELS[operation] : undefined;
  // Deliveries and jobs never co-occur: an operation either addresses agents or reports jobs.
  const summary =
    hubDeliverySummary(readHubDeliveries(input.metadata)) ??
    hubJobSummary(readHubJobs(input.metadata));

  if (!labels) {
    return { displayName: "Agent coordination", ...(operation ? { summary: operation } : {}) };
  }
  // A send reads better naming its recipient inline, because its summary states the outcome.
  if (operation === "send" && target) {
    return {
      displayName: isActive ? `Sending message to ${target}` : `Sent message to ${target}`,
      ...(summary ? { summary } : {}),
    };
  }
  const targetedVerb = isActive ? labels.activeWithTarget : labels.settledWithTarget;
  if (target && targetedVerb) {
    return { displayName: targetedVerb, summary: target };
  }
  const phrase = isActive ? labels.active : labels.settled;
  return {
    displayName: target ? `${phrase} ${target}` : phrase,
    ...(summary ? { summary } : {}),
  };
}

function evalDisplay(input: ToolCallDisplayInput): DetailDisplay {
  const metadata = isRecord(input.metadata) ? input.metadata : {};
  const title = readString(metadata.evalTitle);
  const language = readString(metadata.evalLanguage);
  if (!title && !language) {
    return {};
  }
  return {
    displayName: title ?? "Evaluate",
    ...(language ? { summary: language } : {}),
  };
}

function buildUnknownDetailOverride(input: ToolCallDisplayInput): DetailDisplay {
  const lowerName = input.name.trim().toLowerCase();
  if (input.detail.type === "unknown" && lowerName === "task") {
    return {
      displayName: "Task",
      summary: isRecord(input.metadata) ? readString(input.metadata.subAgentActivity) : undefined,
    };
  }
  if (input.detail.type === "unknown" && lowerName === "thinking") {
    return {
      displayName: "Thinking",
    };
  }
  if (lowerName === "terminal") {
    return {
      displayName: "Terminal",
      summary: input.detail.type === "plain_text" ? readString(input.detail.label) : undefined,
    };
  }
  if (lowerName === "eval") {
    return evalDisplay(input);
  }
  if (lowerName === "hub") {
    return hubDisplay(input);
  }
  return {};
}

export function buildToolCallDisplayModel(input: ToolCallDisplayInput): ToolCallDisplayModel {
  const canonicalDisplay = buildCanonicalDetailDisplay(input);
  const unknownDetailOverride = buildUnknownDetailOverride(input);
  const displayName =
    unknownDetailOverride.displayName ??
    canonicalDisplay.displayName ??
    humanizeToolName(input.name);
  const summary = unknownDetailOverride.summary ?? canonicalDisplay.summary;
  const errorText = input.status === "failed" ? formatErrorText(input.error) : undefined;

  return {
    displayName,
    ...(summary ? { summary } : {}),
    ...(errorText ? { errorText } : {}),
  };
}
