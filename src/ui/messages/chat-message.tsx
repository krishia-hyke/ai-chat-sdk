"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { UseArtifactsReturn } from "../../headless/hooks/use-artifacts";
import type { UseSourcesReturn } from "../../headless/hooks/use-sources";
import { useChatContext } from "../../headless/context/chat-provider";
import type { ChatMessage as ChatMessageType, ToolApproval } from "../../headless/types/chat";
import { ArtifactChip } from "./artifact-chip";
import { RecordChip } from "./record-chip";
import { CitationModal } from "./citation-modal";
import { FileText } from "lucide-react";
import type { MessageSource } from "../../headless/types/chat";
import { FollowUpSuggestions } from "./follow-up-suggestions";
import { ContextRequiredChips } from "./context-required-chips";
import { ToolApprovalCard } from "./tool-approval-card";
import { ReasoningBlock } from "./reasoning-block";
import { useIsMobile } from "../../headless/hooks/use-is-mobile";
import { extractArtifactsFromContent } from "../../headless/utils/artifact-utils";
import { extractSuggestionsFromContent } from "../../headless/utils/suggestion-utils";
import type { RecordTag } from "../../headless/utils/record-utils";

// Remark plugin: converts [N] citation markers inside text into span nodes
// that react-markdown renders as clickable <sup> elements.
function remarkInlineCitations() {
  return function transformer(tree: any) {
    function walk(node: any) {
      if (node.type === "code" || node.type === "inlineCode") return;
      if (!Array.isArray(node.children)) return;

      const newChildren: any[] = [];
      for (const child of node.children) {
        if (child.type === "code" || child.type === "inlineCode") {
          newChildren.push(child);
          continue;
        }
        if (child.type !== "text") {
          walk(child);
          newChildren.push(child);
          continue;
        }

        const parts: string[] = child.value.split(/(\[\d+\])/);
        if (parts.length === 1) {
          newChildren.push(child);
          continue;
        }

        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          if (!part) continue;
          if (i % 2 === 0) {
            newChildren.push({ type: "text", value: part });
          } else {
            const n = part.slice(1, -1);
            newChildren.push({
              type: "citeRef",
              data: {
                hName: "span",
                hProperties: { className: `ais-cite-ref-${n}` },
              },
              children: [{ type: "text", value: n }],
            });
          }
        }
      }
      node.children = newChildren;
    }
    walk(tree);
  };
}

const REMARK_PLUGINS = [remarkGfm, remarkInlineCitations];

interface ChatMessageProps {
  message: ChatMessageType;
  onRetry: () => void;
  onRetryMessage?: (messageId: string) => void;
  onFollowUp: (value: string) => void;
  artifactsCtx: UseArtifactsReturn;
  sourcesCtx: UseSourcesReturn;
  onRecordClick?: (record: RecordTag) => void;
  renderMessageFooter?: (message: ChatMessageType) => React.ReactNode;
  showSuggestions?: boolean;
  isPinned?: boolean;
  hideMessageActions?: boolean;
  /** True when the adapter implements resolveToolApproval (cards become actionable). */
  canResolveToolApprovals?: boolean;
  onResolveToolApproval?: (
    approval: ToolApproval,
    decision: "approved" | "denied",
    reason?: string,
  ) => void | Promise<void>;
  onSourceClick?: (source: MessageSource) => void;
  renderSourcePill?: (source: MessageSource, index: number) => React.ReactNode;
  renderCitationModal?: (source: MessageSource, onClose: () => void) => React.ReactNode;
}

export function ChatMessage({
  message,
  onRetry,
  onRetryMessage,
  onFollowUp,
  artifactsCtx,
  sourcesCtx,
  onRecordClick,
  renderMessageFooter,
  showSuggestions,
  isPinned,
  hideMessageActions,
  canResolveToolApprovals,
  onResolveToolApproval,
  onSourceClick,
  renderSourcePill,
  renderCitationModal,
}: ChatMessageProps) {
  const { config, strings } = useChatContext();
  const isMobile = useIsMobile();
  const enableArtifacts = config?.enableArtifacts ?? true;
  const [copied, setCopied] = React.useState(false);
  const [activeCitationSource, setActiveCitationSource] = React.useState<MessageSource | null>(
    null,
  );
  const copiedTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(
    () => () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    },
    [],
  );

  const { cleanedContent, extractedArtifacts } = React.useMemo(() => {
    if (message.role !== "assistant" || !message.content) {
      return { cleanedContent: message.content, extractedArtifacts: [] };
    }
    if (!enableArtifacts) {
      const { cleanedContent: afterSuggestions } = extractSuggestionsFromContent(message.content);
      return {
        cleanedContent: afterSuggestions,
        extractedArtifacts: [],
      };
    }
    const result = extractArtifactsFromContent(message.content, message.id);
    // Strip any <suggestions> tags that slipped into the content string.
    const { cleanedContent: afterSuggestions } = extractSuggestionsFromContent(
      result.cleanedContent,
    );
    return {
      cleanedContent: afterSuggestions,
      extractedArtifacts: result.artifacts,
    };
  }, [message.content, message.role, message.id, enableArtifacts]);

  const { registerArtifacts } = artifactsCtx;

  React.useEffect(() => {
    if (enableArtifacts && extractedArtifacts.length > 0) {
      registerArtifacts(extractedArtifacts);
    }
  }, [extractedArtifacts, registerArtifacts, enableArtifacts]);

  const handleCiteClick = React.useCallback(
    (scrollToIndex?: number) => {
      if (message.sources?.length) {
        const targetSource =
          scrollToIndex !== undefined && message.sources[scrollToIndex]
            ? message.sources[scrollToIndex]
            : message.sources[0];
        if (targetSource) {
          if (onSourceClick) onSourceClick(targetSource);
          setActiveCitationSource(targetSource);
        }
        // Only open the full SourcesPanel on desktop where it docks alongside the chat.
        // On mobile, opening the 85vh sheet over the chat traps the user and obscures the modal.
        if (!isMobile) {
          sourcesCtx.openSources(message.id, message.sources, scrollToIndex);
        }
      }
    },
    [message.id, message.sources, sourcesCtx, onSourceClick, isMobile],
  );

  // Build the components map inside the component so handleCiteClick is in scope.
  const markdownComponents = React.useMemo(
    () => ({
      span({ node, children, className, ...props }: any) {
        const cls: string = className ?? "";
        if (/^ais-cite-ref-\d+$/.test(cls)) {
          const n = parseInt(cls.replace("ais-cite-ref-", ""), 10);
          return (
            <button
              type="button"
              className="ais-cite-marker"
              aria-label={`View source ${n}`}
              onClick={() => handleCiteClick(n - 1)}
            >
              <sup>{n}</sup>
            </button>
          );
        }
        return (
          <span className={className} {...props}>
            {children}
          </span>
        );
      },
    }),
    [handleCiteClick],
  );

  if (message.role === "command") {
    return (
      <div className="ais-command-pill-row">
        <span
          className="ais-command-pill"
          role="status"
          aria-label={`Slash command: ${message.content}`}
          data-testid={`command-message-${message.id}`}
        >
          <span aria-hidden="true">/</span>
          {message.content.replace("/", "")}
        </span>
      </div>
    );
  }

  const isUser = message.role === "user";
  const allArtifactIds = Array.from(
    new Set([...(message.artifactIds ?? []), ...extractedArtifacts.map((a) => a.artifactId)]),
  );
  const hasSources = !isUser && !message.isStreaming && (message.sources?.length ?? 0) > 0;
  const customFooter = !isUser && !message.isStreaming ? renderMessageFooter?.(message) : null;

  const handleCopyMessage = React.useCallback(() => {
    if (!message.content) return;
    // `navigator.clipboard` is undefined on insecure origins and older browsers,
    // and writeText can reject (denied permission / unfocused document). Guard
    // both so a failed copy never throws out of the click handler.
    const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (!clipboard?.writeText) return;
    clipboard
      .writeText(message.content)
      .then(() => {
        setCopied(true);
        if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        /* copy unavailable/denied — leave the button in its default state */
      });
  }, [message.content]);

  return (
    <div className={`ais-message-row ${isUser ? "ais-user" : "ais-assistant"}`}>
      <div className="ais-message-bubble">
        {!isUser ? (
          <ReasoningBlock
            elapsedMs={message.elapsedMs}
            isStreaming={Boolean(message.isStreaming)}
            plan={message.plan}
            steps={message.steps ?? []}
          />
        ) : null}
        {cleanedContent || message.isStreaming ? (
          <div className="ais-message-content">
            <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={markdownComponents}>
              {cleanedContent}
            </ReactMarkdown>
          </div>
        ) : null}
        {message.error ? <p className="ais-message-error">{message.error}</p> : null}
        {!isUser && message.stoppedByUser ? (
          <p className="ais-message-stopped">{strings.responseStopped}</p>
        ) : null}
        {!isUser && !message.isStreaming && message.error ? (
          <button type="button" className="ais-retry-btn" onClick={onRetry}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Retry
          </button>
        ) : null}
        {!isUser && !message.isStreaming && enableArtifacts && allArtifactIds.length
          ? allArtifactIds.map((id) => {
              const artifact =
                artifactsCtx.artifacts.get(id) ||
                extractedArtifacts.find((a) => a.artifactId === id);
              return (
                <ArtifactChip
                  key={id}
                  artifact={artifact}
                  isSaved={Boolean(artifact?.savedRecord)}
                  onClick={() => artifactsCtx.openArtifact(id)}
                />
              );
            })
          : null}
        {!isUser && !message.isStreaming && message.records?.length
          ? message.records.map((record, i) => (
              <RecordChip key={i} record={record} onClick={onRecordClick} />
            ))
          : null}
        {hasSources ? (
          <div className="ais-sources-pills-list">
            {renderSourcePill
              ? message.sources!.map((source, index) => (
                  <span
                    key={source.id || index}
                    onClick={() => handleCiteClick(index)}
                    className="ais-source-pill-wrapper"
                  >
                    {renderSourcePill(source, index)}
                  </span>
                ))
              : message.sources!.map((source, index) => (
                  <button
                    key={source.id || index}
                    type="button"
                    className="ais-sources-pill"
                    aria-label={`View ${message.sources!.length} sources: ${source.title}`}
                    onClick={() => handleCiteClick(index)}
                  >
                    <FileText size={12} className="ais-sources-pill-icon" aria-hidden="true" />
                    <span className="ais-sources-pill-title">{source.title}</span>
                  </button>
                ))}
          </div>
        ) : null}
        {/* Approval cards render DURING streaming — the run is paused server-side
            until the approval resolves, so this is the only interactive surface. */}
        {!isUser && message.toolApprovals?.length
          ? message.toolApprovals.map((approval) => (
              <ToolApprovalCard
                key={approval.approvalId}
                approval={approval}
                canResolve={Boolean(canResolveToolApprovals && onResolveToolApproval)}
                onResolve={(a, decision, reason) => onResolveToolApproval?.(a, decision, reason)}
                strings={strings}
              />
            ))
          : null}
        {!isUser && !message.isStreaming && message.contextRequired ? (
          <ContextRequiredChips contextRequired={message.contextRequired} onSelect={onFollowUp} />
        ) : null}
        {!isUser && !message.isStreaming && showSuggestions && message.suggestions?.length ? (
          <FollowUpSuggestions onSelect={onFollowUp} suggestions={message.suggestions} />
        ) : null}
        {customFooter ? <div className="ais-message-custom-footer">{customFooter}</div> : null}
      </div>
      {/* Message hover actions: retry (user only) and copy */}
      {!message.isStreaming && !hideMessageActions ? (
        <div className="ais-msg-actions" data-pinned={isPinned ? "true" : "false"}>
          {isUser && onRetryMessage ? (
            <button
              type="button"
              className="ais-msg-action-btn"
              aria-label="Retry this message"
              onClick={() => onRetryMessage(message.id)}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </button>
          ) : null}
          <button
            type="button"
            className={`ais-msg-action-btn${copied ? " ais-copied" : ""}`}
            aria-label={copied ? "Copied" : "Copy message"}
            onClick={handleCopyMessage}
          >
            {copied ? (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
        </div>
      ) : null}
      {activeCitationSource ? (
        renderCitationModal ? (
          renderCitationModal(activeCitationSource, () => setActiveCitationSource(null))
        ) : (
          <CitationModal
            source={activeCitationSource}
            onClose={() => setActiveCitationSource(null)}
          />
        )
      ) : null}
    </div>
  );
}
