"use client";

import React, { useState, useEffect } from "react";
import { ChatStateProvider, useChat } from "../../headless/hooks/use-chat";
import { useArtifacts, type UseArtifactsReturn } from "../../headless/hooks/use-artifacts";
import { useSources, type UseSourcesReturn } from "../../headless/hooks/use-sources";
import {
  useSessionFiles,
  type UseSessionFilesReturn,
} from "../../headless/hooks/use-session-files";
import { useChatContext } from "../../headless/context/chat-provider";
import { ArtifactPanel } from "../artifact-panel/artifact-panel";
import { SourcesPanel } from "../sources-panel/sources-panel";
import { FilesPanel } from "../files-panel/files-panel";
import { ChatComposer } from "../composer/chat-composer";
import { ChatMessages } from "../messages/chat-messages";
import type { SessionWithMessages } from "../../headless/types/session";
import type { ComposerAnnouncement, MessageSource } from "../../headless/types/chat";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../primitives/resizable-handle";
import type { RecordTag } from "../../headless/utils/record-utils";

export interface ChatViewProps {
  onExportArtifact?: (artifactId: string) => Promise<void>;
  onRecordClick?: (record: RecordTag) => void;
  renderMessageFooter?: (message: SessionWithMessages["messages"][number]) => React.ReactNode;
  recordPanel?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  initialSessionId?: string;
  onSessionChange?: (sessionId?: string) => void;
  emptyState?: React.ReactNode;
  tips?: ComposerAnnouncement[];
  hideMessageActions?: boolean;
  enableTools?: boolean;
  enableVoiceInput?: boolean;
  enableSendButton?: boolean;
  onSourceClick?: (source: MessageSource) => void;
  renderSourcePill?: (source: MessageSource, index: number) => React.ReactNode;
  renderCitationModal?: (source: MessageSource, onClose: () => void) => React.ReactNode;
}

export function ChatView({
  onExportArtifact,
  onRecordClick,
  renderMessageFooter,
  recordPanel,
  className,
  style,
  initialSessionId,
  onSessionChange,
  emptyState,
  tips = [],
  hideMessageActions,
  enableTools,
  enableVoiceInput,
  enableSendButton,
  onSourceClick,
  renderSourcePill,
  renderCitationModal,
}: ChatViewProps) {
  const { config } = useChatContext();
  const artifactsCtx = useArtifacts();
  const sourcesCtx = useSources();
  const filesCtx = useSessionFiles();

  return (
    <ChatStateProvider
      onArtifactsReady={artifactsCtx.registerArtifacts}
      onClearArtifacts={artifactsCtx.clearArtifacts}
    >
      <ChatViewContent
        artifactsCtx={artifactsCtx}
        sourcesCtx={sourcesCtx}
        filesCtx={filesCtx}
        enableFileUpload={config.enableFileUpload}
        onExportArtifact={onExportArtifact}
        onRecordClick={onRecordClick}
        onSourceClick={onSourceClick}
        renderSourcePill={renderSourcePill}
        renderCitationModal={renderCitationModal}
        renderMessageFooter={renderMessageFooter}
        recordPanel={recordPanel}
        className={className}
        style={style}
        initialSessionId={initialSessionId}
        onSessionChange={onSessionChange}
        emptyState={emptyState}
        tips={tips}
        hideMessageActions={hideMessageActions}
        enableTools={enableTools}
        enableVoiceInput={enableVoiceInput}
        enableSendButton={enableSendButton}
      />
    </ChatStateProvider>
  );
}

export interface ChatViewContentProps extends ChatViewProps {
  artifactsCtx: UseArtifactsReturn;
  sourcesCtx: UseSourcesReturn;
  filesCtx: UseSessionFilesReturn;
  enableFileUpload: boolean;
}

function ChatViewContent({
  onExportArtifact,
  onRecordClick,
  renderMessageFooter,
  recordPanel,
  className,
  style,
  initialSessionId,
  onSessionChange,
  artifactsCtx,
  sourcesCtx,
  filesCtx,
  enableFileUpload,
  emptyState,
  tips = [],
  hideMessageActions,
  enableTools,
  enableVoiceInput,
  enableSendButton,
  onSourceClick,
  renderSourcePill,
  renderCitationModal,
}: ChatViewContentProps) {
  const {
    sendMessage,
    stopStreaming,
    isStreaming,
    isSessionLoading,
    loadSession,
    adapter,
    currentSessionId,
    resumeState,
    resumeRun,
  } = useChat();
  const { setTopBanner, setBottomBanner, config } = useChatContext();

  useEffect(() => {
    if (!tips.length) return;
    const randomTip = tips[Math.floor(Math.random() * tips.length)];
    if (randomTip) {
      if (randomTip.position === "top") {
        setTopBanner(randomTip);
      } else {
        setBottomBanner(randomTip);
      }
    }
  }, [setBottomBanner, setTopBanner, tips]);

  const didLoadInitialRef = React.useRef(false);
  useEffect(() => {
    if (!initialSessionId || didLoadInitialRef.current) return;
    didLoadInitialRef.current = true;
    adapter
      .loadSession(initialSessionId)
      .then((session: SessionWithMessages) => {
        loadSession(session);
      })
      .catch(() => {
        onSessionChange?.(undefined);
      });
  }, [initialSessionId, adapter, loadSession, onSessionChange]);

  const prevSessionIdRef = React.useRef<string | undefined>(undefined);
  useEffect(() => {
    if (currentSessionId === undefined && prevSessionIdRef.current === undefined) return;
    if (currentSessionId === prevSessionIdRef.current) return;
    prevSessionIdRef.current = currentSessionId;
    onSessionChange?.(currentSessionId);
  }, [currentSessionId, onSessionChange]);

  const embedPanelIsOpen =
    !!recordPanel || (config.enableArtifacts && artifactsCtx.panelState.isOpen);

  const filesOpen = enableFileUpload && filesCtx.panelOpen;
  const innerRightPanelIsOpen = sourcesCtx.panelState.isOpen || filesOpen;
  const showSourcesPanel = sourcesCtx.panelState.isOpen;
  const showFilesPanel = filesOpen && !sourcesCtx.panelState.isOpen;

  const innerRightPanelDefaultSize = showSourcesPanel ? 25 : 30;
  const mainPanelDefaultSize = 100 - innerRightPanelDefaultSize;
  const layoutStorageKey = `ais-chat-view-layout-${showSourcesPanel ? "sources" : "files"}`;

  const [savedLayout, setSavedLayout] = useState<Record<string, number> | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    const saved = window.localStorage.getItem(layoutStorageKey);
    return saved ? JSON.parse(saved) : undefined;
  });

  const handleLayoutChanged = React.useCallback(
    (layout: Record<string, number>) => {
      if (!innerRightPanelIsOpen || typeof window === "undefined") return;

      const layoutKeys = Object.keys(layout);
      const isSame =
        savedLayout &&
        layoutKeys.length === Object.keys(savedLayout).length &&
        layoutKeys.every((k) => Math.abs((layout[k] ?? 0) - (savedLayout[k] ?? 0)) < 0.01);
      if (isSame) return;

      setSavedLayout(layout);
      window.localStorage.setItem(layoutStorageKey, JSON.stringify(layout));
    },
    [innerRightPanelIsOpen, savedLayout, layoutStorageKey],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(layoutStorageKey);
    setSavedLayout(saved ? JSON.parse(saved) : undefined);
  }, [layoutStorageKey]);

  const outerLayoutStorageKey = "ais-chat-view-outer-layout";

  const [savedOuterLayout, setSavedOuterLayout] = useState<Record<string, number> | undefined>(
    () => {
      if (typeof window === "undefined") return undefined;
      const saved = window.localStorage.getItem(outerLayoutStorageKey);
      return saved ? JSON.parse(saved) : undefined;
    },
  );

  const handleOuterLayoutChanged = React.useCallback(
    (layout: Record<string, number>) => {
      if (!embedPanelIsOpen || typeof window === "undefined") return;

      const layoutKeys = Object.keys(layout);
      const isSame =
        savedOuterLayout &&
        layoutKeys.length === Object.keys(savedOuterLayout).length &&
        layoutKeys.every((k) => Math.abs((layout[k] ?? 0) - (savedOuterLayout[k] ?? 0)) < 0.01);
      if (isSame) return;

      setSavedOuterLayout(layout);
      window.localStorage.setItem(outerLayoutStorageKey, JSON.stringify(layout));
    },
    [embedPanelIsOpen, savedOuterLayout],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(outerLayoutStorageKey);
    const parsed: Record<string, number> | undefined = saved ? JSON.parse(saved) : undefined;
    if (parsed && parsed["embed-panel"] == null) {
      window.localStorage.removeItem(outerLayoutStorageKey);
      setSavedOuterLayout(undefined);
    } else {
      setSavedOuterLayout(parsed);
    }
  }, []);

  return (
    <div className={`ais-chat-view ${className ?? ""}`} style={{ height: "100%", ...style }}>
      <ResizablePanelGroup
        key={`panel-resizable-group-${embedPanelIsOpen}`}
        orientation="horizontal"
        className="ais-resizable-group"
        defaultLayout={savedOuterLayout}
        onLayoutChanged={handleOuterLayoutChanged}
      >
        <ResizablePanel
          id="chat-content"
          key="chat-content"
          defaultSize={savedOuterLayout?.["chat-content"] ?? 50}
          minSize={30}
          className="ais-resizable-panel"
        >
          <div
            className="ais-chat-content"
            style={{ height: "100%", display: "flex", flexDirection: "column" }}
          >
            <ResizablePanelGroup
              key={`resizable-group-${innerRightPanelIsOpen}-${showSourcesPanel}`}
              orientation="horizontal"
              className="ais-resizable-group"
              defaultLayout={savedLayout}
              onLayoutChanged={handleLayoutChanged}
            >
              <ResizablePanel
                id="chat-main"
                key="chat-main"
                defaultSize={savedLayout?.["chat-main"] ?? mainPanelDefaultSize}
                maxSize={100}
                minSize={20}
                className="ais-resizable-panel"
              >
                <main className="ais-chat-main">
                  {isSessionLoading && (
                    <div
                      className="ais-session-loading-overlay"
                      role="status"
                      aria-live="polite"
                      aria-label="Loading conversation..."
                    >
                      <div className="ais-session-loading-skeleton">
                        <div className="ais-skeleton-header">
                          <div className="ais-skeleton-avatar" />
                          <div className="ais-skeleton-lines">
                            <div className="ais-skeleton-line ais-skeleton-line--title" />
                            <div className="ais-skeleton-line ais-skeleton-line--meta" />
                          </div>
                        </div>
                        <div className="ais-skeleton-bubble">
                          <div className="ais-skeleton-line ais-skeleton-line--full" />
                          <div className="ais-skeleton-line ais-skeleton-line--full" />
                          <div className="ais-skeleton-line ais-skeleton-line--half" />
                        </div>
                        <div className="ais-session-loading-badge">
                          <div className="ais-spinner" />
                          <span>Loading conversation...</span>
                        </div>
                      </div>
                    </div>
                  )}
                  <ChatMessages
                    artifactsCtx={artifactsCtx}
                    sourcesCtx={sourcesCtx}
                    onRecordClick={onRecordClick}
                    renderMessageFooter={renderMessageFooter}
                    emptyState={emptyState}
                    hideMessageActions={hideMessageActions}
                    onSourceClick={onSourceClick}
                    renderSourcePill={renderSourcePill}
                    renderCitationModal={renderCitationModal}
                  />
                  <ChatComposer
                    enableTools={enableTools}
                    enableVoiceInput={enableVoiceInput}
                    enableSendButton={enableSendButton}
                    isStreaming={isStreaming}
                    onStop={stopStreaming}
                    resumeState={resumeState}
                    onResume={() => void resumeRun()}
                    onSendMessage={(message, attachedFileIds, sessionId, extraContextVariables) => {
                      void sendMessage(message, attachedFileIds, sessionId, extraContextVariables);
                    }}
                  />
                </main>
              </ResizablePanel>

              {innerRightPanelIsOpen && (
                <ResizablePanel
                  id="right-panel"
                  key="right-panel"
                  defaultSize={savedLayout?.["right-panel"] ?? innerRightPanelDefaultSize}
                  maxSize={40}
                  minSize={15}
                  className="ais-resizable-panel"
                >
                  {showSourcesPanel ? (
                    <SourcesPanel
                      sourcesCtx={sourcesCtx}
                      onSourceClick={onSourceClick}
                      renderCitationModal={renderCitationModal}
                    />
                  ) : (
                    showFilesPanel && <FilesPanel filesCtx={filesCtx} />
                  )}
                </ResizablePanel>
              )}
            </ResizablePanelGroup>
          </div>
        </ResizablePanel>

        {embedPanelIsOpen && <ResizableHandle withHandle />}
        {embedPanelIsOpen && (
          <ResizablePanel
            id="embed-panel"
            key="embed-panel"
            defaultSize={savedOuterLayout?.["embed-panel"] ?? 50}
            minSize={30}
            className="ais-resizable-panel"
          >
            <div className="ais-embed-panel">
              {recordPanel ??
                (config.enableArtifacts && artifactsCtx.panelState.isOpen && (
                  <ArtifactPanel
                    artifactsCtx={artifactsCtx}
                    onExportArtifact={onExportArtifact}
                    onSendMessage={(text) => void sendMessage(text)}
                    isStreaming={isStreaming}
                  />
                ))}
            </div>
          </ResizablePanel>
        )}
      </ResizablePanelGroup>
    </div>
  );
}
