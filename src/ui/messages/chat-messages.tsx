"use client";

import React, { useEffect } from "react";
import type { UseArtifactsReturn } from "../../headless/hooks/use-artifacts";
import type { UseSourcesReturn } from "../../headless/hooks/use-sources";
import { useChat } from "../../headless/hooks/use-chat";
import { useStickyBottom } from "../../headless/hooks/use-sticky-bottom";
import { ChatEmptyState } from "../empty-state/chat-empty-state";
import { ChatMessage } from "./chat-message";
import type { ChatMessage as ChatMessageType, MessageSource } from "../../headless/types/chat";
import type { RecordTag } from "../../headless/utils/record-utils";

interface ChatMessagesProps {
  artifactsCtx: UseArtifactsReturn;
  sourcesCtx: UseSourcesReturn;
  onRecordClick?: (record: RecordTag) => void;
  renderMessageFooter?: (message: ChatMessageType) => React.ReactNode;
  /** Consumer-supplied empty state. Falls back to a minimal generic empty state. */
  emptyState?: React.ReactNode;
  /** Whether to hide the default message actions (e.g. copy, retry). */
  hideMessageActions?: boolean;
  /** Optional callback invoked when a citation marker or source pill is clicked. */
  onSourceClick?: (source: MessageSource) => void;
  /** Custom renderer for individual source pills below an assistant message. */
  renderSourcePill?: (source: MessageSource, index: number) => React.ReactNode;
  /** Custom modal/dialog renderer when viewing citation details. */
  renderCitationModal?: (source: MessageSource, onClose: () => void) => React.ReactNode;
}

export function ChatMessages({
  artifactsCtx,
  sourcesCtx,
  onRecordClick,
  renderMessageFooter,
  emptyState,
  hideMessageActions,
  onSourceClick,
  renderSourcePill,
  renderCitationModal,
}: ChatMessagesProps) {
  const {
    messages,
    retryLastMessage,
    retryMessage,
    sendMessage,
    isStreaming,
    canResolveToolApprovals,
    resolveToolApproval,
  } = useChat();
  const { anchorRef, isAtBottom, scrollToBottom } = useStickyBottom();

  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom("auto");
    }
  }, [isAtBottom, messages.length, scrollToBottom]);

  if (messages.length === 0) {
    return (
      <div
        className="ais-messages ais-messages--empty"
        role="main"
        aria-label="Start a new conversation"
      >
        {emptyState ?? <ChatEmptyState onSendMessage={(msg) => void sendMessage(msg)} />}
      </div>
    );
  }

  return (
    <div className="ais-messages" role="log" aria-live="polite" aria-label="Conversation">
      <div className="ais-messages-blur-top" />
      <div className="ais-messages-inner">
        {messages.map((message, index) => {
          const isLastAssistant = index === messages.length - 1 && message.role === "assistant";

          // The last completed (non-streaming, non-command) message keeps its actions pinned.
          // Earlier turns reveal actions on row hover.
          const isPinned = (() => {
            for (let i = messages.length - 1; i >= 0; i--) {
              const m = messages[i];
              if (m && !m.isStreaming && m.role !== "command") {
                return m.id === message.id;
              }
            }
            return false;
          })();

          return (
            <ChatMessage
              key={message.id}
              artifactsCtx={artifactsCtx}
              sourcesCtx={sourcesCtx}
              message={message}
              isPinned={isPinned}
              showSuggestions={isLastAssistant}
              hideMessageActions={hideMessageActions}
              onFollowUp={(value) => {
                void sendMessage(value);
              }}
              onRetry={() => {
                void retryLastMessage();
              }}
              onRetryMessage={
                isStreaming
                  ? undefined
                  : (messageId) => {
                      void retryMessage(messageId);
                    }
              }
              onRecordClick={onRecordClick}
              renderMessageFooter={renderMessageFooter}
              canResolveToolApprovals={canResolveToolApprovals}
              onResolveToolApproval={resolveToolApproval}
              onSourceClick={onSourceClick}
              renderSourcePill={renderSourcePill}
              renderCitationModal={renderCitationModal}
            />
          );
        })}
        <div ref={anchorRef} />
      </div>
      <div className="ais-messages-blur-bottom" />
    </div>
  );
}
