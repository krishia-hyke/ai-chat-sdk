import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ChatProvider, useChatContext } from "./chat-provider";
import type { ChatAdapter } from "../types/adapter";

const mockAdapter: ChatAdapter = {
  createSession: jest.fn(async () => "session-1"),
  updateSession: jest.fn(),
  sendMessage: jest.fn(),
  loadSession: jest.fn(),
  listSessions: jest.fn(async () => ({ sessions: [], total: 0, page: 1 })),
  deleteSession: jest.fn(),
};

function TestConsumer() {
  const ctx = useChatContext();
  return <div data-testid="consumer">{ctx.config.defaultModel}</div>;
}

describe("ChatProvider", () => {
  it("renders with data-chat-provider='ai-chat-sdk' and default theme", () => {
    const { container } = render(
      <ChatProvider adapter={mockAdapter}>
        <div>child content</div>
      </ChatProvider>,
    );

    const root = container.firstElementChild;
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute("data-chat-provider", "ai-chat-sdk");
    expect(root).toHaveAttribute("data-theme", "system");
  });

  it("forwards className, style, and standard HTML div attributes to wrapper element", () => {
    render(
      <ChatProvider
        adapter={mockAdapter}
        className="custom-flex-class flex-1"
        style={{ height: "100vh", minWidth: 0 }}
        data-testid="provider-root"
        id="chat-root-id"
      >
        <div>child content</div>
      </ChatProvider>,
    );

    const root = screen.getByTestId("provider-root");
    expect(root).toBeInTheDocument();
    expect(root).toHaveClass("custom-flex-class", "flex-1");
    expect(root).toHaveAttribute("id", "chat-root-id");
    expect(root).toHaveStyle({ height: "100vh" });
    expect((root as HTMLElement).style.minWidth).toBe("0");
  });

  it("provides chat context to descendant components", () => {
    render(
      <ChatProvider adapter={mockAdapter} config={{ defaultModel: "custom-model" }}>
        <TestConsumer />
      </ChatProvider>,
    );

    expect(screen.getByTestId("consumer")).toHaveTextContent("custom-model");
  });

  it("injects custom theme CSS when themeOptions are provided", () => {
    const { container } = render(
      <ChatProvider
        adapter={mockAdapter}
        config={{
          themeOptions: {
            light: {
              accent: "#123456",
              floatingPanelBg: "#fafafa",
            },
            dark: {
              accent: "#abcdef",
              floatingPanelBg: "#111111",
            },
          },
        }}
      >
        <div>child content</div>
      </ChatProvider>,
    );

    const styleTag = container.querySelector("style");
    expect(styleTag).toBeInTheDocument();
    expect(styleTag?.textContent).toContain("--chat-accent: #123456;");
    expect(styleTag?.textContent).toContain("--ais-floating-panel-bg: #fafafa;");
    expect(styleTag?.textContent).toContain("--chat-accent: #abcdef;");
    expect(styleTag?.textContent).toContain("--ais-floating-panel-bg: #111111;");
    expect(styleTag?.textContent).toContain("@media (prefers-color-scheme: dark)");
  });

  it("throws error when useChatContext is called outside ChatProvider", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<TestConsumer />)).toThrow(
      "useChatContext must be used within ChatProvider",
    );

    spy.mockRestore();
  });
  it("merges custom strings and extensible keys into strings context", () => {
    function StringsConsumer() {
      const { strings } = useChatContext();
      return (
        <div>
          <span data-testid="placeholder">{strings.composerPlaceholder}</span>
          <span data-testid="recents-title">{strings.recentsTitle}</span>
          <span data-testid="custom-key">{strings["customDomainKey"]}</span>
        </div>
      );
    }

    render(
      <ChatProvider
        adapter={mockAdapter}
        strings={{
          composerPlaceholder: "Ask Theo anything...",
          recentsTitle: "Conversations",
          customDomainKey: "Custom Value",
        }}
      >
        <StringsConsumer />
      </ChatProvider>,
    );

    expect(screen.getByTestId("placeholder")).toHaveTextContent("Ask Theo anything...");
    expect(screen.getByTestId("recents-title")).toHaveTextContent("Conversations");
    expect(screen.getByTestId("custom-key")).toHaveTextContent("Custom Value");
  });
});
