import type { OmpHistoryMapperHooks } from "./message-history.js";
import { mapOmpAdvisorMessageToToolCall } from "./advisor-message.js";
import { mapOmpSystemNoticeToToolCall } from "./system-notice.js";
import { mapOmpIrcEnvelopeToTimelineItem } from "./irc-message.js";
import { mapOmpToolDetail } from "./tool-call-mapper.js";
import { resolveOmpEmittedToolCallId } from "./tool-call-id.js";

export const OMP_HISTORY_MAPPER_HOOKS: OmpHistoryMapperHooks = {
  mapToolDetail: mapOmpToolDetail,
  mapUserMessage: (message, text, provider) => {
    const item = mapOmpIrcEnvelopeToTimelineItem(text, message);
    return item ? { type: "timeline", provider, item } : null;
  },
  mapAssistantMessage: (message, text, provider) => {
    const item = mapOmpIrcEnvelopeToTimelineItem(text, message);
    return item ? { type: "timeline", provider, item } : null;
  },
  mapCustomMessage: (message, text, provider) => {
    const item =
      mapOmpIrcEnvelopeToTimelineItem(text, message) ??
      mapOmpAdvisorMessageToToolCall(message, text) ??
      mapOmpSystemNoticeToToolCall(text);
    return item ? { type: "timeline", provider, item } : null;
  },
  resolveToolCallId: resolveOmpEmittedToolCallId,
};
