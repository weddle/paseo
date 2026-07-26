import type { AgentTimelineItem } from "../../agent-sdk-types.js";

type OmpIrcMessageTimelineItem = Extract<AgentTimelineItem, { type: "irc_message" }>;

const IRC_ENVELOPE_PATTERN = /^\s*<irc\b([^>]*)>([\s\S]*?)<\/irc>\s*$/i;
const IRC_ATTRIBUTE_PATTERN = /([\w-]+)=["'“‘]([^"'“”‘’]*)["'”’]/g;
const INCOMING_IRC_HEADER_PATTERN =
  /^Incoming IRC message from agent\s+(`[^`]+`|[^:\n]+?)(?:\s+to(?:\s+agent)?\s+(`[^`]+`|[^:\n]+?))?(?:\s+(?:in reply to|replying to|reply to)\s+(`[^`]+`|[^:\n]+?))?\s*:?\s*$/i;

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

/**
 * Converts OMP's inbound IRC envelope into a timeline item. Returning null
 * leaves ordinary user/custom messages on their existing paths.
 */
export function mapOmpIrcEnvelopeToTimelineItem(text: string): OmpIrcMessageTimelineItem | null {
  const envelope = text.match(IRC_ENVELOPE_PATTERN);
  if (!envelope) {
    return null;
  }

  const attributes = readAttributeMap(envelope[1] ?? "");
  const content = (envelope[2] ?? "").trim();
  const lines = content.split(/\r?\n/);
  const header = lines[0]?.trim() ?? "";
  const headerMatch = INCOMING_IRC_HEADER_PATTERN.exec(header);
  const body = headerMatch ? lines.slice(1).join("\n").trim() : content;

  const sender =
    normalizeIdentity(readFirstAttribute(attributes, ["sender", "from", "agent"])) ??
    normalizeIdentity(headerMatch?.[1]) ??
    "Unknown sender";
  const recipient =
    normalizeIdentity(readFirstAttribute(attributes, ["recipient", "to", "target"])) ??
    normalizeIdentity(headerMatch?.[2]);
  const replyTo =
    normalizeIdentity(readFirstAttribute(attributes, ["reply-to", "replyto", "in-reply-to"])) ??
    normalizeIdentity(headerMatch?.[3]);

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
