import React from "react";
import { act, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ChatProvider } from "../../headless/context/chat-provider";
import { ChatShell } from "./chat-shell";

jest.mock("../../headless/hooks/use-chat", () => ({
  ChatStateProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useChat: () => ({
    sendMessage: jest.fn(),
    isStreaming: false,
    clearMessages: jest.fn(),
    loadSession: jest.fn(),
    adapter: { loadSession: jest.fn() },
    currentSessionId: undefined,
    currentSessionTitle: "New session",
  }),
}));

jest.mock("../../headless/hooks/use-artifacts", () => ({
  useArtifacts: () => ({
    // The real hook always returns `artifacts` as a Map; ChatShellContent reads
    // `artifacts.size` for the header count, so the mock must include it.
    artifacts: new Map(),
    registerArtifacts: jest.fn(),
    panelState: { isOpen: false },
  }),
}));

jest.mock("../../headless/hooks/use-sources", () => ({
  useSources: () => ({
    panelState: { isOpen: false },
  }),
}));

jest.mock("../../headless/hooks/use-session-files", () => ({
  useSessionFiles: () => ({
    files: [],
    panelOpen: false,
    openPanel: jest.fn(),
    closePanel: jest.fn(),
  }),
}));

jest.mock("../artifact-panel/artifact-panel", () => ({
  ArtifactPanel: () => null,
}));

jest.mock("../sources-panel/sources-panel", () => ({
  SourcesPanel: () => null,
}));

jest.mock("../files-panel/files-panel", () => ({
  FilesPanel: () => null,
}));

jest.mock("./chat-shell-header", () => ({
  ChatShellHeader: () => null,
}));

jest.mock("../command-palette/command-palette", () => ({
  CommandPalette: () => null,
}));

jest.mock("../messages/chat-messages", () => ({
  ChatMessages: () => <div data-testid="chat-messages" />,
}));

jest.mock("../sidebar/chat-sidebar", () => ({
  ChatSidebar: () => null,
}));

jest.mock("../recents/recents-page", () => ({
  RecentsPage: ({ onSelectSession }: { onSelectSession?: () => void }) => (
    <div data-testid="recents-page">
      <button data-testid="select-session-btn" onClick={() => onSelectSession?.()}>
        Select
      </button>
    </div>
  ),
}));

jest.mock("../primitives/resizable-handle", () => ({
  ResizablePanelGroup: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ResizablePanel: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ResizableHandle: () => null,
}));

describe("ChatShell banner slots", () => {
  it("renders host-provided composerTopBanner", () => {
    render(
      <ChatProvider
        adapter={
          {
            createSession: jest.fn(),
            listSessions: jest.fn().mockResolvedValue([]),
            loadSession: jest.fn(),
            sendMessage: jest.fn(),
          } as any
        }
        organizationId="org-1"
        plugins={{
          composerTopBanner: {
            id: "notify-banner",
            type: "announcement",
            title: "Want to be notified when the AI responds?",
            dismissible: true,
          },
        }}
        config={{ enableFileUpload: false, enableCommandPalette: false }}
      >
        <ChatShell />
      </ChatProvider>,
    );

    expect(screen.getByText("Want to be notified when the AI responds?")).toBeInTheDocument();
  });

  it("shrinks to the visual viewport when the mobile keyboard is open", () => {
    const originalMatchMedia = window.matchMedia;
    const originalViewport = Object.getOwnPropertyDescriptor(window, "visualViewport");
    const originalInnerHeight = window.innerHeight;

    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: query.includes("767"),
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }));
    Object.defineProperty(window, "visualViewport", {
      value: {
        height: 420,
        offsetTop: 0,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
      configurable: true,
    });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });

    const { container } = render(
      <ChatProvider
        adapter={
          {
            createSession: jest.fn(),
            listSessions: jest.fn().mockResolvedValue([]),
            loadSession: jest.fn(),
            sendMessage: jest.fn(),
          } as any
        }
        organizationId="org-1"
        config={{ enableFileUpload: false, enableCommandPalette: false }}
      >
        <ChatShell />
      </ChatProvider>,
    );

    const shell = container.querySelector(".ais-chat-shell");
    // A shorter visual viewport alone is browser chrome, not a keyboard — the
    // shell only shrinks once a text field actually has focus.
    expect(shell).not.toHaveClass("is-keyboard-open");

    act(() => {
      container.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    });

    expect(shell).toHaveClass("is-keyboard-open");
    expect(shell).toHaveStyle({ height: "420px", maxHeight: "420px" });

    window.matchMedia = originalMatchMedia;
    if (originalViewport) Object.defineProperty(window, "visualViewport", originalViewport);
    else Reflect.deleteProperty(window, "visualViewport");
    Object.defineProperty(window, "innerHeight", {
      value: originalInnerHeight,
      configurable: true,
    });
  });
  it("supports controlled activeView and transitions view when onSelectSession fires in RecentsPage", () => {
    const onViewChange = jest.fn();

    const { rerender } = render(
      <ChatProvider
        adapter={
          {
            createSession: jest.fn(),
            listSessions: jest.fn().mockResolvedValue([]),
            loadSession: jest.fn(),
            sendMessage: jest.fn(),
          } as any
        }
        organizationId="org-1"
        config={{ enableFileUpload: false, enableCommandPalette: false }}
      >
        <ChatShell initialActiveView="recents" onViewChange={onViewChange} />
      </ChatProvider>,
    );

    expect(screen.getByTestId("recents-page")).toBeInTheDocument();
    expect(screen.queryByTestId("chat-messages")).not.toBeInTheDocument();

    // Clicking session in RecentsPage switches view back to chat
    act(() => {
      screen.getByTestId("select-session-btn").click();
    });

    expect(onViewChange).toHaveBeenCalledWith("chat");
    expect(screen.getByTestId("chat-messages")).toBeInTheDocument();
    expect(screen.queryByTestId("recents-page")).not.toBeInTheDocument();

    // Controlled activeView="recents"
    rerender(
      <ChatProvider
        adapter={
          {
            createSession: jest.fn(),
            listSessions: jest.fn().mockResolvedValue([]),
            loadSession: jest.fn(),
            sendMessage: jest.fn(),
          } as any
        }
        organizationId="org-1"
        config={{ enableFileUpload: false, enableCommandPalette: false }}
      >
        <ChatShell activeView="recents" onViewChange={onViewChange} />
      </ChatProvider>,
    );

    expect(screen.getByTestId("recents-page")).toBeInTheDocument();
  });
});
