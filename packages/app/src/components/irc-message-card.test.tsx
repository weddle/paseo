/**
 * @vitest-environment jsdom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { theme } = vi.hoisted(() => ({
  theme: {
    spacing: { 1: 4, 2: 8, 3: 12 },
    borderRadius: { md: 6 },
    borderWidth: { 1: 1 },
    fontSize: { xs: 11, sm: 13 },
    fontWeight: { semibold: "600" },
    colors: {
      surface1: "#111",
      border: "#555",
      foreground: "#fff",
      foregroundMuted: "#aaa",
    },
  },
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: unknown) =>
      typeof factory === "function"
        ? (factory as (value: typeof theme) => unknown)(theme)
        : factory,
  },
}));

vi.mock("lucide-react-native", () => ({
  MessageSquare: (props: Record<string, unknown>) =>
    React.createElement("span", { ...props, "data-icon": "MessageSquare" }),
}));

vi.stubGlobal("React", React);
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

import { IrcMessageCard } from "./irc-message-card";

describe("IrcMessageCard", () => {
  let root: Root | null = null;
  let container: HTMLElement | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    root = null;
    container?.remove();
    container = null;
  });

  it("renders the IRC route, delivery state, and body without its raw envelope", () => {
    act(() => {
      root?.render(
        <IrcMessageCard
          sender="CodexAppServerResearch"
          recipient="OmpIrcTimeline"
          replyTo="inbox-42"
          body="Use a typed timeline card instead of assistant Markdown."
          deliveryState="delivered"
        />,
      );
    });

    expect(container?.textContent).toContain("IRC message");
    expect(container?.textContent).toContain("Delivered");
    expect(container?.textContent).toContain("From CodexAppServerResearch");
    expect(container?.textContent).toContain("To OmpIrcTimeline");
    expect(container?.textContent).toContain("Reply to inbox-42");
    expect(container?.textContent).toContain(
      "Use a typed timeline card instead of assistant Markdown.",
    );
    expect(container?.textContent).not.toContain("<irc>");
  });
});
