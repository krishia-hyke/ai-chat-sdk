import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ChatSidebar } from "./chat-sidebar";

jest.mock("../../headless/context/chat-provider", () => ({
  useChatContext: () => ({
    adapter: { loadSession: jest.fn() },
    organizationId: "org-1",
    currentSession: undefined,
    setCurrentSession: jest.fn(),
  }),
}));

jest.mock("../../headless/hooks/use-conversation-history", () => ({
  useConversationHistory: () => ({
    sessions: [],
    isLoading: false,
    refresh: jest.fn(),
    deleteSession: jest.fn(),
  }),
}));

jest.mock("../../headless/hooks/use-chat", () => ({
  useChat: () => ({
    loadSession: jest.fn(),
    currentSessionId: undefined,
    isStreaming: false,
    clearMessages: jest.fn(),
  }),
}));

describe("ChatSidebar custom links", () => {
  it("renders the built-in Artifacts item by default", () => {
    render(<ChatSidebar />);
    expect(screen.getByRole("button", { name: "Artifacts" })).toBeInTheDocument();
  });

  it("hides the Artifacts item when hideArtifactsLink is set", () => {
    render(<ChatSidebar hideArtifactsLink />);
    expect(screen.queryByRole("button", { name: "Artifacts" })).not.toBeInTheDocument();
  });

  it("renders host-supplied sidebar links and fires their onClick", () => {
    const onClick = jest.fn();
    render(
      <ChatSidebar
        hideArtifactsLink
        sidebarLinks={[{ id: "back-to-host", label: "Platform", onClick }]}
      />,
    );

    const link = screen.getByRole("button", { name: "Platform" });
    expect(link).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Artifacts" })).not.toBeInTheDocument();

    fireEvent.click(link);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("invokes onClose when a rail button is clicked while open on mobile", () => {
    const onClose = jest.fn();
    render(<ChatSidebar isOpen={true} onClose={onClose} />);
    const newChatBtn = screen.getByRole("button", { name: "New Chat" });
    fireEvent.click(newChatBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
