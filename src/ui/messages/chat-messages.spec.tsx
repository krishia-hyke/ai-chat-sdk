import React from "react";
import { render, screen } from "@testing-library/react";
import { ChatMessages } from "./chat-messages";
import type { MessageSource } from "../../headless/types/chat";
import "@testing-library/jest-dom";

const mockMessages = [
  {
    id: "msg-1",
    role: "assistant",
    content: "Here is information [1]",
    sources: [{ id: "src-1", title: "Benefits Policy" }],
  },
];

let capturedChatMessageProps: any = null;

jest.mock("./chat-message", () => ({
  ChatMessage: (props: any) => {
    capturedChatMessageProps = props;
    return <div data-testid="chat-message">{props.message.content}</div>;
  },
}));

jest.mock("../../headless/hooks/use-chat", () => ({
  useChat: () => ({
    messages: mockMessages,
    retryLastMessage: jest.fn(),
    retryMessage: jest.fn(),
    sendMessage: jest.fn(),
    isStreaming: false,
    canResolveToolApprovals: false,
    resolveToolApproval: jest.fn(),
  }),
}));

jest.mock("../../headless/hooks/use-sticky-bottom", () => ({
  useStickyBottom: () => ({
    anchorRef: { current: null },
    isAtBottom: true,
    scrollToBottom: jest.fn(),
  }),
}));

describe("ChatMessages", () => {
  const mockArtifactsCtx = {
    artifacts: new Map(),
    openArtifact: jest.fn(),
    registerArtifacts: jest.fn(),
  } as any;

  const mockSourcesCtx = {
    activeSources: [],
    activeMessageId: undefined,
    panelState: { isOpen: false },
    openSources: jest.fn(),
    closeSources: jest.fn(),
  } as any;

  beforeEach(() => {
    capturedChatMessageProps = null;
  });

  it("renders messages and forwards onSourceClick, renderSourcePill, and renderCitationModal to ChatMessage", () => {
    const onSourceClick = jest.fn();
    const renderSourcePill = (source: MessageSource) => <span>Pill: {source.title}</span>;
    const renderCitationModal = (source: MessageSource) => <div>Modal: {source.title}</div>;

    render(
      <ChatMessages
        artifactsCtx={mockArtifactsCtx}
        sourcesCtx={mockSourcesCtx}
        onSourceClick={onSourceClick}
        renderSourcePill={renderSourcePill}
        renderCitationModal={renderCitationModal}
      />,
    );

    expect(screen.getByTestId("chat-message")).toBeInTheDocument();
    expect(capturedChatMessageProps).toBeDefined();
    expect(capturedChatMessageProps.onSourceClick).toBe(onSourceClick);
    expect(capturedChatMessageProps.renderSourcePill).toBe(renderSourcePill);
    expect(capturedChatMessageProps.renderCitationModal).toBe(renderCitationModal);
  });
});
