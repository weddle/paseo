import { describe, expect, it, vi } from "vitest";
import {
  computeCanStartDictation,
  resolveComposerSurfacePresentation,
  resolveSelectedSendBehavior,
  resolveSendErrorAfterInputChange,
  runAlternateSendAction,
  runDefaultSendAction,
  runMessageInputKeyboardAction,
  stopRealtimeVoice,
} from "./state";

const connected = { isConnected: true } as never;
const disconnected = { isConnected: false } as never;

function createDictationKeyboard({ startsRecording }: { startsRecording: boolean }) {
  let isRecording = false;
  const actions: string[] = [];

  return {
    actions,
    pressDictationShortcut: () =>
      runMessageInputKeyboardAction("dictation-toggle", {
        focusInput: () => undefined,
        isDictationRecording: () => isRecording,
        markTranscriptForSend: () => actions.push("send transcript"),
        startDictation: () => {
          actions.push("start");
          isRecording = startsRecording;
        },
        confirmDictation: () => {
          actions.push("confirm");
          isRecording = false;
        },
        cancelDictation: () => undefined,
        toggleRealtimeVoice: () => undefined,
        isRealtimeVoiceActive: false,
        toggleRealtimeVoiceMute: () => undefined,
      }),
  };
}

describe("composer surface presentation", () => {
  it("shows only the input when no voice overlay is active", () => {
    expect(resolveComposerSurfacePresentation(false)).toEqual({
      input: { opacity: 1, pointerEvents: "auto" },
      overlay: { opacity: 0, pointerEvents: "none" },
    });
  });

  it("shows only the voice overlay while voice UI is active", () => {
    expect(resolveComposerSurfacePresentation(true)).toEqual({
      input: { opacity: 0, pointerEvents: "none" },
      overlay: { opacity: 1, pointerEvents: "auto" },
    });
  });
});

describe("selected send behavior", () => {
  it("defaults a newly eligible running composer to Steer", () => {
    expect(
      resolveSelectedSendBehavior({
        current: "queue",
        defaultSendBehavior: "queue",
        canSteer: true,
        wasSteerAvailable: false,
      }),
    ).toBe("steer");
  });

  it("keeps a deliberate choice while steering stays available", () => {
    expect(
      resolveSelectedSendBehavior({
        current: "queue",
        defaultSendBehavior: "interrupt",
        canSteer: true,
        wasSteerAvailable: true,
      }),
    ).toBe("queue");
  });

  it("falls back to the normal preference when steering becomes unavailable", () => {
    expect(
      resolveSelectedSendBehavior({
        current: "steer",
        defaultSendBehavior: "queue",
        canSteer: false,
        wasSteerAvailable: true,
      }),
    ).toBe("queue");
  });
});

describe("composer send errors", () => {
  it("retains a steering failure beside its unchanged draft and clears it after an edit", () => {
    const failure = "Couldn’t steer the agent.";

    expect(
      resolveSendErrorAfterInputChange(failure, "Refocus on tests.", "Refocus on tests."),
    ).toBe(failure);
    expect(
      resolveSendErrorAfterInputChange(failure, "Refocus on tests.", "Refocus on parser tests."),
    ).toBe(null);
  });
});

describe("computeCanStartDictation", () => {
  it("returns false when socket is disconnected", () => {
    expect(
      computeCanStartDictation({
        client: disconnected,
        isReadyForDictation: true,
        disabled: false,
        dictationUnavailableMessage: null,
      }),
    ).toBe(false);
  });

  it("returns false when isReadyForDictation is explicitly false", () => {
    expect(
      computeCanStartDictation({
        client: connected,
        isReadyForDictation: false,
        disabled: false,
        dictationUnavailableMessage: null,
      }),
    ).toBe(false);
  });

  it("returns true when connected and ready", () => {
    expect(
      computeCanStartDictation({
        client: connected,
        isReadyForDictation: true,
        disabled: false,
        dictationUnavailableMessage: null,
      }),
    ).toBe(true);
  });

  it("falls back to socket connected state when isReadyForDictation is undefined", () => {
    expect(
      computeCanStartDictation({
        client: connected,
        isReadyForDictation: undefined,
        disabled: false,
        dictationUnavailableMessage: null,
      }),
    ).toBe(true);

    expect(
      computeCanStartDictation({
        client: disconnected,
        isReadyForDictation: undefined,
        disabled: false,
        dictationUnavailableMessage: null,
      }),
    ).toBe(false);
  });

  it("returns false when the input is disabled", () => {
    expect(
      computeCanStartDictation({
        client: connected,
        isReadyForDictation: true,
        disabled: true,
        dictationUnavailableMessage: null,
      }),
    ).toBe(false);
  });

  it("returns false when a dictation unavailable message is present", () => {
    expect(
      computeCanStartDictation({
        client: connected,
        isReadyForDictation: true,
        disabled: false,
        dictationUnavailableMessage: "Microphone unavailable",
      }),
    ).toBe(false);
  });

  it("returns false when client is null", () => {
    expect(
      computeCanStartDictation({
        client: null,
        isReadyForDictation: true,
        disabled: false,
        dictationUnavailableMessage: null,
      }),
    ).toBe(false);
  });
});

describe("dictation keyboard behavior", () => {
  it("starts dictation again after the previous dictation finishes", () => {
    const keyboard = createDictationKeyboard({ startsRecording: true });

    keyboard.pressDictationShortcut();
    keyboard.pressDictationShortcut();
    keyboard.pressDictationShortcut();

    expect(keyboard.actions).toEqual(["start", "send transcript", "confirm", "start"]);
  });

  it("can retry when starting dictation does not enter the recording state", () => {
    const keyboard = createDictationKeyboard({ startsRecording: false });

    keyboard.pressDictationShortcut();
    keyboard.pressDictationShortcut();

    expect(keyboard.actions).toEqual(["start", "start"]);
  });
});

describe("composer send behavior", () => {
  function actions() {
    const calls: string[] = [];
    return {
      calls,
      handleSendMessage: () => calls.push("send"),
      handleQueueMessage: () => calls.push("queue"),
      handleSteerMessage: () => calls.push("steer"),
      onQueue: () => undefined,
      onSteer: async () => undefined,
    };
  }

  it("uses Enter to interrupt and Mod+Enter to queue when interrupt is selected", () => {
    const defaultAction = actions();
    runDefaultSendAction({
      selectedSendBehavior: "interrupt",
      isAgentRunning: true,
      canSteer: false,
      hasAttachments: false,
      onQueue: defaultAction.onQueue,
      onSteer: defaultAction.onSteer,
      handleSendMessage: defaultAction.handleSendMessage,
      handleQueueMessage: defaultAction.handleQueueMessage,
      handleSteerMessage: defaultAction.handleSteerMessage,
    });

    const alternateAction = actions();
    runAlternateSendAction({
      selectedSendBehavior: "interrupt",
      isAgentRunning: true,
      canSteer: false,
      hasAttachments: false,
      onQueue: alternateAction.onQueue,
      onSteer: alternateAction.onSteer,
      handleSendMessage: alternateAction.handleSendMessage,
      handleQueueMessage: alternateAction.handleQueueMessage,
      handleSteerMessage: alternateAction.handleSteerMessage,
    });

    expect(defaultAction.calls).toEqual(["send"]);
    expect(alternateAction.calls).toEqual(["queue"]);
  });

  it("uses Enter to queue and Mod+Enter to submit when queue is selected", () => {
    const defaultAction = actions();
    runDefaultSendAction({
      selectedSendBehavior: "queue",
      isAgentRunning: true,
      canSteer: false,
      hasAttachments: false,
      onQueue: defaultAction.onQueue,
      onSteer: defaultAction.onSteer,
      handleSendMessage: defaultAction.handleSendMessage,
      handleQueueMessage: defaultAction.handleQueueMessage,
      handleSteerMessage: defaultAction.handleSteerMessage,
    });

    const alternateAction = actions();
    runAlternateSendAction({
      selectedSendBehavior: "queue",
      isAgentRunning: true,
      canSteer: false,
      hasAttachments: false,
      onQueue: alternateAction.onQueue,
      onSteer: alternateAction.onSteer,
      handleSendMessage: alternateAction.handleSendMessage,
      handleQueueMessage: alternateAction.handleQueueMessage,
      handleSteerMessage: alternateAction.handleSteerMessage,
    });

    expect(defaultAction.calls).toEqual(["queue"]);
    expect(alternateAction.calls).toEqual(["send"]);
  });

  it("uses Enter to steer and Mod+Enter to queue when Steer is selected", () => {
    const defaultAction = actions();
    runDefaultSendAction({
      selectedSendBehavior: "steer",
      isAgentRunning: true,
      canSteer: true,
      hasAttachments: false,
      onQueue: defaultAction.onQueue,
      onSteer: defaultAction.onSteer,
      handleSendMessage: defaultAction.handleSendMessage,
      handleQueueMessage: defaultAction.handleQueueMessage,
      handleSteerMessage: defaultAction.handleSteerMessage,
    });

    const alternateAction = actions();
    runAlternateSendAction({
      selectedSendBehavior: "steer",
      isAgentRunning: true,
      canSteer: true,
      hasAttachments: false,
      onQueue: alternateAction.onQueue,
      onSteer: alternateAction.onSteer,
      handleSendMessage: alternateAction.handleSendMessage,
      handleQueueMessage: alternateAction.handleQueueMessage,
      handleSteerMessage: alternateAction.handleSteerMessage,
    });

    expect(defaultAction.calls).toEqual(["steer"]);
    expect(alternateAction.calls).toEqual(["queue"]);
  });

  it("does not fall through to interrupt when selected Steer is unavailable", () => {
    const unavailableAction = actions();
    runDefaultSendAction({
      selectedSendBehavior: "steer",
      isAgentRunning: true,
      canSteer: false,
      hasAttachments: false,
      onQueue: unavailableAction.onQueue,
      onSteer: unavailableAction.onSteer,
      handleSendMessage: unavailableAction.handleSendMessage,
      handleQueueMessage: unavailableAction.handleQueueMessage,
      handleSteerMessage: unavailableAction.handleSteerMessage,
    });

    const attachmentAction = actions();
    runDefaultSendAction({
      selectedSendBehavior: "steer",
      isAgentRunning: true,
      canSteer: true,
      hasAttachments: true,
      onQueue: attachmentAction.onQueue,
      onSteer: attachmentAction.onSteer,
      handleSendMessage: attachmentAction.handleSendMessage,
      handleQueueMessage: attachmentAction.handleQueueMessage,
      handleSteerMessage: attachmentAction.handleSteerMessage,
    });

    expect(unavailableAction.calls).toEqual([]);
    expect(attachmentAction.calls).toEqual([]);
  });
});

describe("stopRealtimeVoice", () => {
  it("keeps voice mode active when the running agent refuses cancellation", async () => {
    const cancellationError = new Error("active run cancellation was not acknowledged");
    const cancelAgent = vi.fn().mockRejectedValue(cancellationError);
    const stopVoice = vi.fn().mockResolvedValue(undefined);

    await expect(
      stopRealtimeVoice({
        voice: { stopVoice },
        isRealtimeVoiceForCurrentAgent: true,
        isAgentRunning: true,
        client: { cancelAgent },
        voiceAgentId: "agent-1",
      }),
    ).rejects.toBe(cancellationError);

    expect(stopVoice).not.toHaveBeenCalled();
  });

  it("stops voice mode after the running agent acknowledges cancellation", async () => {
    const calls: string[] = [];

    await stopRealtimeVoice({
      voice: {
        stopVoice: async () => {
          calls.push("stop voice");
        },
      },
      isRealtimeVoiceForCurrentAgent: true,
      isAgentRunning: true,
      client: {
        cancelAgent: async () => {
          calls.push("cancel agent");
        },
      },
      voiceAgentId: "agent-1",
    });

    expect(calls).toEqual(["cancel agent", "stop voice"]);
  });
});
