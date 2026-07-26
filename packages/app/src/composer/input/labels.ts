import type { TFunction } from "i18next";
import type { SendBehavior } from "./state";

export function resolveSubmitAccessibilityLabel(input: {
  submitButtonAccessibilityLabel: string | undefined;
  canPressLoadingButton: boolean;
  selectedSendBehavior: SendBehavior;
  isAgentRunning: boolean;
  t: TFunction;
}): string {
  if (input.submitButtonAccessibilityLabel) return input.submitButtonAccessibilityLabel;
  if (input.canPressLoadingButton) return input.t("composer.input.interruptAgent");
  if (input.selectedSendBehavior === "steer" && input.isAgentRunning) {
    return input.t("composer.input.steerAgent");
  }
  if (input.selectedSendBehavior === "queue" && input.isAgentRunning) {
    return input.t("composer.input.queueMessage");
  }
  if (input.isAgentRunning) return input.t("composer.input.sendAndInterrupt");
  return input.t("composer.input.sendMessage");
}

export function resolveVoiceAccessibilityLabel(input: {
  isRealtimeVoiceForCurrentAgent: boolean;
  isMuted: boolean;
  isDictating: boolean;
  t: TFunction;
}): string {
  if (input.isRealtimeVoiceForCurrentAgent) {
    return input.isMuted
      ? input.t("composer.voice.unmuteVoiceMode")
      : input.t("composer.voice.muteVoiceMode");
  }
  if (input.isDictating) return input.t("composer.voice.stopDictation");
  return input.t("composer.voice.startDictation");
}

export function resolveVoiceTooltipText(input: {
  isRealtimeVoiceForCurrentAgent: boolean;
  isMuted: boolean;
  t: TFunction;
}): string {
  if (input.isRealtimeVoiceForCurrentAgent) {
    return input.isMuted
      ? input.t("composer.voice.unmuteVoice")
      : input.t("composer.voice.muteVoice");
  }
  return input.t("composer.voice.dictation");
}

export function resolveSendTooltipLabel(input: {
  submitButtonAccessibilityLabel: string | undefined;
  selectedSendBehavior: SendBehavior;
  t: TFunction;
}): string {
  if (input.submitButtonAccessibilityLabel) return input.submitButtonAccessibilityLabel;
  if (input.selectedSendBehavior === "steer") return input.t("composer.input.steer");
  return input.selectedSendBehavior === "queue"
    ? input.t("composer.input.queue")
    : input.t("composer.input.send");
}
