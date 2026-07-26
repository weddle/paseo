/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import React, { type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  resolveSendBehaviorOptions,
  SendBehaviorControl,
  type SendBehaviorLabels,
} from "./send-behavior-control";

const { theme } = vi.hoisted(() => ({
  theme: {
    spacing: { 0: 0, 1: 4, 2: 8, 3: 12 },
    borderRadius: { full: 9999, xl: 12 },
    fontSize: { xs: 12, base: 16 },
    fontWeight: { medium: "500" },
    colors: { foreground: "#fff", foregroundMuted: "#aaa", surface2: "#222" },
  },
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: unknown) => (typeof factory === "function" ? factory(theme) : factory),
  },
  withUnistyles:
    (Component: React.ComponentType<Record<string, unknown>>) =>
    ({ uniProps: _uniProps, ...props }: Record<string, unknown>) =>
      React.createElement(Component, props),
}));

vi.mock("@/constants/layout", () => ({
  useIsCompactFormFactor: () => true,
}));

vi.mock("@/components/ui/keyboard-dismiss", () => ({
  useDismissKeyboardOnOpen: () => undefined,
}));

vi.mock("@/components/adaptive-modal-sheet", () => ({
  AdaptiveModalSheet: ({
    visible,
    children,
    testID,
  }: {
    visible: boolean;
    children: ReactNode;
    testID?: string;
  }) => (visible ? <section data-testid={testID}>{children}</section> : null),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("lucide-react-native", () => ({
  Check: () => <span data-testid="check" />,
  ChevronDown: () => <span data-testid="chevron" />,
}));

const labels: SendBehaviorLabels = {
  choose: "Choose send behavior",
  title: "Send behavior",
  steer: "Steer",
  steerDescription: "Guide the current response without interrupting it",
  steerUnavailableWithAttachments: "Steer is unavailable with attachments.",
  queue: "Queue",
  queueDescription: "Send after the current response finishes",
  interrupt: "Interrupt",
  interruptDescription: "Stop the current response and send now",
};

describe("SendBehaviorControl", () => {
  it("omits Steer for ineligible agents and disables it when attachments are present", () => {
    expect(
      resolveSendBehaviorOptions({ canSteer: false, hasAttachments: false, labels }).map(
        (option) => option.behavior,
      ),
    ).toEqual(["queue", "interrupt"]);

    expect(resolveSendBehaviorOptions({ canSteer: true, hasAttachments: true, labels })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          behavior: "steer",
          disabled: true,
          description: labels.steerUnavailableWithAttachments,
        }),
      ]),
    );
  });

  it("renders all running-agent choices and selects Queue from the adjacent chooser", () => {
    const onSelect = vi.fn();
    render(
      <SendBehaviorControl
        canSteer
        hasAttachments={false}
        selectedBehavior="steer"
        labels={labels}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByTestId("message-input-send-behavior-trigger").textContent).toContain(
      "Steer",
    );
    fireEvent.click(screen.getByTestId("message-input-send-behavior-trigger"));

    expect(screen.getByTestId("message-input-send-behavior-menu")).not.toBeNull();
    expect(screen.getByTestId("message-input-send-behavior-option-steer").textContent).toContain(
      labels.steerDescription,
    );
    expect(screen.getByTestId("message-input-send-behavior-option-queue").textContent).toContain(
      labels.queueDescription,
    );
    expect(
      screen.getByTestId("message-input-send-behavior-option-interrupt").textContent,
    ).toContain(labels.interruptDescription);

    fireEvent.click(screen.getByTestId("message-input-send-behavior-option-queue"));
    expect(onSelect).toHaveBeenCalledWith("queue");
  });
});
