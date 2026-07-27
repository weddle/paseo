import type { AgentTimelineItem } from "../../agent-sdk-types.js";
import type { OmpAgentMessage } from "./rpc-types.js";

type OmpIrcMessageTimelineItem = Extract<AgentTimelineItem, { type: "irc_message" }>;

type OmpSteeringMessage = Pick<OmpAgentMessage, "steering" | "attribution">;

const IRC_ENVELOPE_PATTERN = /^\s*<irc\b([^>]*)>([\s\S]*?)<\/irc>\s*$/i;
const IRC_ATTRIBUTE_PATTERN = /([\w-]+)=["'“‘]([^"'“”‘’]*)["'”’]/g;
// Mirrors packages/coding-agent/src/prompts/system/irc-incoming.md, whose header is
// "Incoming IRC message from agent `{{from}}`{{#if replyTo}} (replying to {{replyTo}}){{/if}}:".
const INCOMING_IRC_HEADER_PATTERN =
  /^Incoming IRC message from agent\s+(`[^`]+`|[^\s:(]+)(?:\s*\((?:replying to|in reply to|reply to)\s+([^)]+)\))?(?:\s+to(?:\s+agent)?\s+(`[^`]+`|[^:\n]+?))?(?:\s+(?:in reply to|replying to|reply to)\s+(`[^`]+`|[^:\n]+?))?\s*:?\s*$/i;
// Mirrors packages/coding-agent/src/prompts/steering/parent-irc.md. Older OMP builds identify
// parent steering only through this label; surrounding prose is free to be reworded.
const PARENT_IRC_LABEL_PATTERN = /^Parent IRC message:[ \t]*$/m;
const PARENT_IRC_SENDER_PATTERN = /parent agent\s+(`[^`]+`|[^\s.,;:]+)/i;
// Trailing paragraphs the OMP harness appends to describe the transport rather than the message.
// These track prose that upstream may reword; each pattern is anchored at a paragraph start and
// only ever drops trailing paragraphs, so a wording change degrades to showing the extra text
// rather than eating a real message.
const IRC_HARNESS_TRAILERS = [
  /^An agent sent this while you were/i,
  /^If a response is expected, reply with the `hub` tool\b/i,
  /^You are mid-task, so a side-channel auto-reply\b/i,
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

/**
 * Parses a parent-to-subagent steering envelope, which carries no <irc> wrapper. The typed
 * steering flags establish the message kind; the prose still carries its sender and body.
 */
function mapParentSteeringEnvelope(
  text: string,
  label: RegExpExecArray | null,
): OmpIrcMessageTimelineItem | null {
  const body = stripHarnessTrailers(
    (label ? text.slice(label.index + label[0].length) : text).trim(),
  );
  if (!body) {
    return null;
  }
  const attribution = PARENT_IRC_SENDER_PATTERN.exec(label ? text.slice(0, label.index) : text);
  return {
    type: "irc_message",
    sender: normalizeIdentity(attribution?.[1]) ?? "Parent agent",
    body,
    deliveryState: "delivered",
  };
}

/**
 * Decides whether a message is a parent steering injection. The typed flags are authoritative;
 * the prose label is only consulted for older OMP builds that omit them.
 */
function readParentSteering(
  text: string,
  message: OmpSteeringMessage | undefined,
): OmpIrcMessageTimelineItem | null {
  const label = PARENT_IRC_LABEL_PATTERN.exec(text);
  if (message?.steering === true && message.attribution === "agent") {
    return mapParentSteeringEnvelope(text, label);
  }
  const flagsAbsent = message?.steering === undefined && message?.attribution === undefined;
  return flagsAbsent && label ? mapParentSteeringEnvelope(text, label) : null;
}

/**
 * Converts OMP's inbound IRC envelopes into a timeline item. Returning null
 * leaves ordinary user/custom messages on their existing paths.
 */
export function mapOmpIrcEnvelopeToTimelineItem(
  text: string,
  message?: OmpSteeringMessage,
): OmpIrcMessageTimelineItem | null {
  const parentSteering = readParentSteering(text, message);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Builds a card from OMP's structured delivered-message record: `{ from, to, body, id, ts,
 * replyTo? }`. Authoritative — the rendered text is a projection of these same fields.
 */
function mapDeliveredRecord(value: unknown): OmpIrcMessageTimelineItem | null {
  if (!isRecord(value)) {
    return null;
  }
  const sender = normalizeIdentity(typeof value.from === "string" ? value.from : null);
  const body = typeof value.body === "string" ? stripHarnessTrailers(value.body.trim()) : "";
  if (!body) {
    return null;
  }
  const recipient = normalizeIdentity(typeof value.to === "string" ? value.to : null);
  const replyTo = normalizeIdentity(typeof value.replyTo === "string" ? value.replyTo : null);
  return {
    type: "irc_message",
    sender: sender ?? "Unknown sender",
    ...(recipient ? { recipient } : {}),
    ...(replyTo ? { replyTo } : {}),
    body,
    deliveryState: "delivered",
  };
}

/**
 * Extracts the messages a `hub` wait/inbox result delivered. Non-message results — send
 * receipts, job snapshots, elided waits — yield nothing and keep their ordinary tool card.
 *
 * OMP reports deliveries structurally as `details.waited` (a single record) or `details.inbox`
 * (an array). Both are preferred over `text`, which only renders the same fields. The text
 * parser below remains for OMP builds that omit `details`.
 */
export function mapOmpHubDeliveredMessages(
  text: string,
  details?: unknown,
): OmpIrcMessageTimelineItem[] {
  if (isRecord(details)) {
    const structured: OmpIrcMessageTimelineItem[] = [];
    for (const candidate of [
      details.waited,
      ...(Array.isArray(details.inbox) ? details.inbox : []),
    ]) {
      const item = mapDeliveredRecord(candidate);
      if (item) {
        structured.push(item);
      }
    }
    if (structured.length > 0) {
      return structured;
    }
    // A wait that timed out or returned a job snapshot carries no message; the text below
    // holds only a prose summary, so there is nothing further to recover.
    if ("waited" in details || "inbox" in details || "jobs" in details) {
      return [];
    }
  }

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
