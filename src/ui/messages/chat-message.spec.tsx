import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChatMessage } from "./chat-message";
import "@testing-library/jest-dom";

jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));

jest.mock("remark-gfm", () => ({
  __esModule: true,
  default: {},
}));

// ChatMessage reads `config` from context; provide a minimal stub so it can render
// in isolation (artifacts/sources contexts are passed in as props).
jest.mock("../../headless/context/chat-provider", () => ({
  useChatContext: () => ({ config: { enableArtifacts: true } }),
}));

describe("ChatMessage", () => {
  const mockOnRetry = jest.fn();
  const mockOnFollowUp = jest.fn();
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

  it("renders a user message correctly", () => {
    const message = {
      id: "1",
      role: "user",
      content: "Hello",
      timestamp: new Date(),
    } as any;
    render(
      <ChatMessage
        message={message}
        onRetry={mockOnRetry}
        onFollowUp={mockOnFollowUp}
        artifactsCtx={mockArtifactsCtx}
        sourcesCtx={mockSourcesCtx}
      />,
    );
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("renders a command message as a pill", () => {
    const message = {
      id: "2",
      role: "command",
      content: "/gap",
      timestamp: new Date(),
    } as any;
    render(
      <ChatMessage
        message={message}
        onRetry={mockOnRetry}
        onFollowUp={mockOnFollowUp}
        artifactsCtx={mockArtifactsCtx}
        sourcesCtx={mockSourcesCtx}
      />,
    );
    const pill = screen.getByTestId("command-message-2");
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveTextContent("/gap");
  });

  it("renders an assistant message with markdown", () => {
    const message = {
      id: "3",
      role: "assistant",
      content: "**bold text**",
      timestamp: new Date(),
    } as any;
    render(
      <ChatMessage
        message={message}
        onRetry={mockOnRetry}
        onFollowUp={mockOnFollowUp}
        artifactsCtx={mockArtifactsCtx}
        sourcesCtx={mockSourcesCtx}
      />,
    );
    const boldText = screen.getByText("**bold text**");
    expect(boldText).toBeInTheDocument();
  });

  it("renders a custom footer for assistant messages", () => {
    const message = {
      id: "3b",
      role: "assistant",
      content: "A longer assistant response that can host a footer.",
      timestamp: new Date(),
    } as any;
    render(
      <ChatMessage
        message={message}
        onRetry={mockOnRetry}
        onFollowUp={mockOnFollowUp}
        artifactsCtx={mockArtifactsCtx}
        sourcesCtx={mockSourcesCtx}
        renderMessageFooter={() => <div>Footer</div>}
      />,
    );
    expect(screen.getByText("Footer")).toBeInTheDocument();
  });

  it("renders error message and retry button", () => {
    const message = {
      id: "4",
      role: "assistant",
      content: "",
      error: "Something went wrong",
      timestamp: new Date(),
    } as any;
    render(
      <ChatMessage
        message={message}
        onRetry={mockOnRetry}
        onFollowUp={mockOnFollowUp}
        artifactsCtx={mockArtifactsCtx}
        sourcesCtx={mockSourcesCtx}
      />,
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("renders user message hover action buttons (retry + copy)", () => {
    const mockOnRetryMessage = jest.fn();
    const message = {
      id: "u1",
      role: "user",
      content: "Hello world",
      timestamp: new Date(),
    } as any;
    render(
      <ChatMessage
        message={message}
        onRetry={mockOnRetry}
        onRetryMessage={mockOnRetryMessage}
        onFollowUp={mockOnFollowUp}
        artifactsCtx={mockArtifactsCtx}
        sourcesCtx={mockSourcesCtx}
      />,
    );
    const retryBtn = screen.getByRole("button", { name: "Retry this message" });
    expect(retryBtn).toBeInTheDocument();
    fireEvent.click(retryBtn);
    expect(mockOnRetryMessage).toHaveBeenCalledWith("u1");

    const copyBtn = screen.getByRole("button", { name: "Copy message" });
    expect(copyBtn).toBeInTheDocument();
  });

  it("does not render retry action on user message when onRetryMessage is not provided", () => {
    const message = {
      id: "u2",
      role: "user",
      content: "No retry here",
      timestamp: new Date(),
    } as any;
    render(
      <ChatMessage
        message={message}
        onRetry={mockOnRetry}
        onFollowUp={mockOnFollowUp}
        artifactsCtx={mockArtifactsCtx}
        sourcesCtx={mockSourcesCtx}
      />,
    );
    expect(screen.queryByRole("button", { name: "Retry this message" })).not.toBeInTheDocument();
    // Copy should still render
    expect(screen.getByRole("button", { name: "Copy message" })).toBeInTheDocument();
  });

  it("extracts and renders artifacts from content even in non-streaming messages", () => {
    const contentWithArtifact =
      'Here is the plan: <artifact type="markdown" title="Action Plan">Do step 1</artifact>';
    const message = {
      id: "5",
      role: "assistant",
      content: contentWithArtifact,
      timestamp: new Date(),
    } as any;

    render(
      <ChatMessage
        message={message}
        onRetry={mockOnRetry}
        onFollowUp={mockOnFollowUp}
        artifactsCtx={mockArtifactsCtx}
        sourcesCtx={mockSourcesCtx}
      />,
    );

    // Should NOT show the raw artifact tag in the main content
    expect(screen.queryByText(/<artifact/)).not.toBeInTheDocument();

    // It should render an ArtifactChip (we check for the title)
    expect(screen.getByText("Action Plan")).toBeInTheDocument();
  });

  it("renders an actionable tool approval card WHILE the message is streaming", () => {
    const onResolveToolApproval = jest.fn();
    const message = {
      id: "6",
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isStreaming: true,
      toolApprovals: [
        {
          approvalId: "approval_1",
          toolCallId: "call_1",
          toolName: "delete_records",
          riskCategory: "destructive",
          status: "pending",
        },
      ],
    } as any;

    render(
      <ChatMessage
        message={message}
        onRetry={mockOnRetry}
        onFollowUp={mockOnFollowUp}
        artifactsCtx={mockArtifactsCtx}
        sourcesCtx={mockSourcesCtx}
        canResolveToolApprovals
        onResolveToolApproval={onResolveToolApproval}
      />,
    );

    expect(screen.getByTestId("tool-approval-approval_1")).toBeInTheDocument();
    expect(screen.getByText("delete_records")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(onResolveToolApproval).toHaveBeenCalledWith(
      expect.objectContaining({ approvalId: "approval_1" }),
      "approved",
      undefined,
    );
  });
  it("renders sources pill and opens CitationModal on click", () => {
    const onSourceClick = jest.fn();
    const message = {
      id: "7",
      role: "assistant",
      content: "Here is verified info.",
      timestamp: new Date(),
      sources: [
        {
          id: "src_1",
          title: "Policy.pdf",
          snippet: "Remote work is permitted.",
          metadata: { tags: "HR" },
        },
      ],
    } as any;

    render(
      <ChatMessage
        message={message}
        onRetry={mockOnRetry}
        onFollowUp={mockOnFollowUp}
        artifactsCtx={mockArtifactsCtx}
        sourcesCtx={mockSourcesCtx}
        onSourceClick={onSourceClick}
      />,
    );

    const pill = screen.getByRole("button", { name: /View 1 sources/ });
    expect(pill).toBeInTheDocument();

    fireEvent.click(pill);
    expect(onSourceClick).toHaveBeenCalledWith(message.sources[0]);
    expect(screen.getByRole("dialog", { name: /Source citation: Policy.pdf/ })).toBeInTheDocument();
    expect(screen.getByText('"Remote work is permitted."')).toBeInTheDocument();
  });

  it("supports custom renderSourcePill and renderCitationModal", () => {
    const message = {
      id: "8",
      role: "assistant",
      content: "Content with custom source pill",
      timestamp: new Date(),
      sources: [
        {
          id: "src_2",
          title: "CustomDoc.pdf",
          snippet: "Custom snippet",
        },
      ],
    } as any;

    render(
      <ChatMessage
        message={message}
        onRetry={mockOnRetry}
        onFollowUp={mockOnFollowUp}
        artifactsCtx={mockArtifactsCtx}
        sourcesCtx={mockSourcesCtx}
        renderSourcePill={(source) => <span data-testid="custom-pill">{source.title}</span>}
        renderCitationModal={(source, onClose) => (
          <div data-testid="custom-modal">
            <span>Modal: {source.title}</span>
            <button onClick={onClose}>Close Custom</button>
          </div>
        )}
      />,
    );

    const customPill = screen.getByTestId("custom-pill");
    expect(customPill).toHaveTextContent("CustomDoc.pdf");

    fireEvent.click(customPill);
    expect(screen.getByTestId("custom-modal")).toHaveTextContent("Modal: CustomDoc.pdf");
  });
});
