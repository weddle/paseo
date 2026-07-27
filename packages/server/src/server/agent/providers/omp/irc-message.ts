import type { AgentTimelineItem } from "../../agent-sdk-types.js";

type OmpIrcMessageTimelineItem = Extract<AgentTimelineItem, { type: "irc_message" }>;

const IRC_ENVELOPE_PATTERN = /^\s*<irc\b([^>]*)>([\s\S]*?)<\/irc>\s*$/i;
const IRC_ATTRIBUTE_PATTERN = /([\w-]+)=["'“‘]([^"'“”‘’]*)["'”’]/g;
// Mirrors packages/coding-agent/src/prompts/system/irc-incoming.md, whose header is
// "Incoming IRC message from agent `{{from}}`{{#if replyTo}} (replying to {{replyTo}}){{/if}}:".
const INCOMING_IRC_HEADER_PATTERN =
  /^Incoming IRC message from agent\s+(`[^`]+`|[^\s:(]+)(?:\s*\((?:replying to|in reply to|reply to)\s+([^)]+)\))?(?:\s+to(?:\s+agent)?\s+(`[^`]+`|[^:\n]+?))?(?:\s+(?:in reply to|replying to|reply to)\s+(`[^`]+`|[^:\n]+?))?\s*:?\s*$/i;
// Mirrors packages/coding-agent/src/prompts/steering/parent-irc.md. A parent's message to a
// subagent arrives as plain prose with no <irc> wrapper, so it needs its own envelope.
const PARENT_IRC_ENVELOPE_PATTERN =
  /^\s*Your current interruptible wait was interrupted because an IRC message arrived from your parent agent\s+(`[^`]+`|\S+?)\.\s*\r?\n\s*Parent IRC message:\s*\r?\n([\s\S]+)$/i;
// Trailing paragraphs the OMP harness appends to a delivered message. They describe the
// transport, not the message, so they never belong in the rendered body.
const IRC_HARNESS_TRAILERS = [
  /^An agent sent this while you were waiting or working\./i,
  /^If a response is expected, reply with the `hub` tool\b/i,
  /^You are mid-task, so a side-channel auto-reply was generated\b/i,
];
// A `hub` wait/inbox call returns delivered messages as its tool result rather than injecting
// them, so this is the shape an agent sees whenever it deliberately waits instead of being
// interrupted: "[<id>] <sender> (reply to <id>): <body>", body running to the next such line.
const HUB_DELIVERED_MESSAGE_PATTERN =
  /^\[([0-9a-z_-]{4,})\]\s+([\w.-]+)(?:\s+\(reply to\s+([^)]+)\))?:\s?(.*)$/i;

function readAttributeMap(attributeText: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const match of attributeText.matchAll(IRC_ATTRIBUTE_PATTERN)) {
    const name = match[1]?.trim().toLowerCase();
    const value = match[2]?.trim();
    if (name && value) {
      attributes.set(name, value);
    }
  }
  return attributes;
}

function readFirstAttribute(
  attributes: ReadonlyMap<string, string>,
  names: string[],
): string | null {
  for (const name of names) {
    const value = attributes.get(name);
    if (value) {
      return value;
    }
  }
  return null;
}

function normalizeIdentity(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  const unquoted = /^`([^`]+)`$/.exec(trimmed)?.[1] ?? trimmed;
  return unquoted.trim() || null;
}

function readDeliveryState(value: string | null): OmpIrcMessageTimelineItem["deliveryState"] {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    // The envelope reached OMP, so delivery is authoritative when its optional
    // metadata omits a state.
    return "delivered";
  }
  switch (normalized) {
    case "delivered":
      return "delivered";
    case "failed":
      return "failed";
    case "unknown":
      return "unknown";
    default:
      return "unknown";
  }
}

function stripHarnessTrailers(body: string): string {
  const paragraphs = body.split(/\n\s*\n/);
  while (paragraphs.length > 1) {
    const last = paragraphs[paragraphs.length - 1]?.trim() ?? "";
    if (!IRC_HARNESS_TRAILERS.some((pattern) => pattern.test(last))) {
      break;
    }
    paragraphs.pop();
  }
  return paragraphs.join("\n\n").trim();
}

/** Parses the parent-to-subagent steering envelope, which carries no <irc> wrapper. */
function mapParentSteeringEnvelope(text: string): OmpIrcMessageTimelineItem | null {
  const parentEnvelope = text.match(PARENT_IRC_ENVELOPE_PATTERN);
  if (!parentEnvelope) {
    return null;
  }
  return {
    type: "irc_message",
    sender: normalizeIdentity(parentEnvelope[1]) ?? "Unknown sender",
    body: stripHarnessTrailers((parentEnvelope[2] ?? "").trim()),
    deliveryState: "delivered",
  };
}

/**
 * Converts OMP's inbound IRC envelopes into a timeline item. Returning null
 * leaves ordinary user/custom messages on their existing paths.
 */
export function mapOmpIrcEnvelopeToTimelineItem(text: string): OmpIrcMessageTimelineItem | null {
  const parentSteering = mapParentSteeringEnvelope(text);
  if (parentSteering) {
    return parentSteering;
  }

  const envelope = text.match(IRC_ENVELOPE_PATTERN);
  if (!envelope) {
    return null;
  }

  const attributes = readAttributeMap(envelope[1] ?? "");
  const content = (envelope[2] ?? "").trim();
  const lines = content.split(/\r?\n/);
  const header = lines[0]?.trim() ?? "";
  const headerMatch = INCOMING_IRC_HEADER_PATTERN.exec(header);
  const body = stripHarnessTrailers(headerMatch ? lines.slice(1).join("\n").trim() : content);

  const sender =
    normalizeIdentity(readFirstAttribute(attributes, ["sender", "from", "agent"])) ??
    normalizeIdentity(headerMatch?.[1]) ??
    "Unknown sender";
  const recipient =
    normalizeIdentity(readFirstAttribute(attributes, ["recipient", "to", "target"])) ??
    normalizeIdentity(headerMatch?.[3]);
  const replyTo =
    normalizeIdentity(readFirstAttribute(attributes, ["reply-to", "replyto", "in-reply-to"])) ??
    normalizeIdentity(headerMatch?.[2]) ??
    normalizeIdentity(headerMatch?.[4]);

  return {
    type: "irc_message",
    sender,
    ...(recipient ? { recipient } : {}),
    ...(replyTo ? { replyTo } : {}),
    body,
    deliveryState: readDeliveryState(
      readFirstAttribute(attributes, ["delivery-state", "deliverystate", "delivery"]),
    ),
  };
}

/**
 * Extracts the messages a `hub` wait/inbox result delivered. Non-message results — send
 * receipts, job snapshots, elided waits — yield nothing and keep their ordinary tool card.
 */
export function mapOmpHubDeliveredMessages(text: string): OmpIrcMessageTimelineItem[] {
  const parsed: Array<{ item: OmpIrcMessageTimelineItem; bodyLines: string[] }> = [];

  for (const line of text.split(/\r?\n/)) {
    const header = HUB_DELIVERED_MESSAGE_PATTERN.exec(line);
    if (header) {
      parsed.push({
        item: {
          type: "irc_message",
          sender: normalizeIdentity(header[2]) ?? "Unknown sender",
          ...(header[3]?.trim() ? { replyTo: header[3].trim() } : {}),
          body: "",
          deliveryState: "delivered",
        },
        bodyLines: [header[4] ?? ""],
      });
      continue;
    }
    parsed[parsed.length - 1]?.bodyLines.push(line);
  }

  const messages: OmpIrcMessageTimelineItem[] = [];
  for (const { item, bodyLines } of parsed) {
    item.body = stripHarnessTrailers(bodyLines.join("\n").trim());
    if (item.body) {
      messages.push(item);
    }
  }
  return messages;
}
