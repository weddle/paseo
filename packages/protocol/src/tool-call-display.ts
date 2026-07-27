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

// Operation labels for OMP's `hub` agent-coordination tool. An unrecognized operation falls back
// to a neutral label rather than inventing one, so new operations degrade instead of misreporting.
const HUB_OPERATION_LABELS: Record<string, string> = {
  send: "Send agent message",
  wait: "Wait for agent activity",
  inbox: "Read agent inbox",
  list: "List agents",
  jobs: "Check agent jobs",
  cancel: "Cancel agent work",
  start: "Start process",
  stop: "Stop process",
  restart: "Restart process",
  logs: "Read process logs",
  ps: "List processes",
  describe: "Describe process",
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

function hubDisplay(input: ToolCallDisplayInput): DetailDisplay {
  const operation = isRecord(input.metadata) ? readString(input.metadata.hubOperation) : undefined;
  const target = isRecord(input.metadata) ? readString(input.metadata.hubTarget) : undefined;
  const label = operation ? HUB_OPERATION_LABELS[operation] : undefined;
  const displayName =
    label && target && operation === "send"
      ? `Send message to ${target}`
      : (label ?? "Agent coordination");
  const summary =
    hubDeliverySummary(readHubDeliveries(input.metadata)) ?? (label ? undefined : operation);
  return {
    displayName: target && operation !== "send" && label ? `${label} ${target}` : displayName,
    ...(summary ? { summary } : {}),
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
