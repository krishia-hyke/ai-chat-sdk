"use client";

import React, { useEffect, useRef, useState } from "react";
import type { ChatMessage, StreamingState } from "../../headless/types/chat";
import type { ResumeState } from "../../headless/types/session";
import { ChatStateProvider, useChat } from "../../headless/hooks/use-chat";
import { useArtifacts, type UseArtifactsReturn } from "../../headless/hooks/use-artifacts";
import { useSources, type UseSourcesReturn } from "../../headless/hooks/use-sources";
import {
  useSessionFiles,
  type UseSessionFilesReturn,
} from "../../headless/hooks/use-session-files";
import { useChatContext } from "../../headless/context/chat-provider";
import { useViewportHeightFallback } from "../../headless/hooks/use-viewport-height";
import { useIsMobile } from "../../headless/hooks/use-is-mobile";
import { useKeyboardOpen, useVisualViewport } from "../../headless/hooks/use-visual-viewport";
import { registerCommand, unregisterCommand } from "../../extensions/command-registry";
import { ArtifactPanel } from "../artifact-panel/artifact-panel";
import { SourcesPanel } from "../sources-panel/sources-panel";
import { FilesPanel } from "../files-panel/files-panel";
import { ChatShellHeader } from "./chat-shell-header";
import { CommandPalette } from "../command-palette/command-palette";
import { ChatComposer } from "../composer/chat-composer";
import { ChatMessages } from "../messages/chat-messages";
import { ChatSidebar } from "../sidebar/chat-sidebar";
import type { SidebarView, SidebarNavLink } from "../sidebar/chat-sidebar";
import { RecentsPage } from "../recents/recents-page";
import type { SessionWithMessages } from "../../headless/types/session";
import type { ComposerAnnouncement } from "../../headless/types/chat";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../primitives/resizable-handle";
import type { RecordTag } from "../../headless/utils/record-utils";

const SIDEBAR_OVERLAY_BREAKPOINT_PX = 1024;

interface ChatShellProps {
  /** Called when the user triggers the "save artifact" action. When omitted, the button is hidden. */
  onExportArtifact?: (artifactId: string) => Promise<void>;
  onRecordClick?: (record: RecordTag) => void;
  renderMessageFooter?: (message: SessionWithMessages["messages"][number]) => React.ReactNode;
  recordPanel?: React.ReactNode;
  className?: string;
  /**
   * Inline styles merged onto the shell root. Hosts that provide a bounded
   * parent container should pass `{ height: "100%" }` so the shell fills the
   * parent instead of the viewport (see the height contract in the README).
   */
  style?: React.CSSProperties;
  /**
   * Pixels of host-app chrome (header and/or footer) rendered outside the
   * shell. Used to compute the available viewport height on mobile, where the
   * shell would otherwise overflow below the fold and clip the composer.
   * Equivalent to setting `--ais-chrome-offset-top/bottom` in CSS.
   */
  viewportOffset?: { top?: number; bottom?: number };
  initialSessionId?: string;
  onSessionChange?: (sessionId?: string) => void;
  /** Consumer-supplied empty state rendered when the conversation has no messages. */
  emptyState?: React.ReactNode;
  /** Tip announcements shown randomly in the composer. Defaults to none. */
  tips?: ComposerAnnouncement[];
  /** Callback triggered when clicking the global Artifacts sidebar item. When provided, overrides local toggle. */
  onArtifactsClick?: () => void;
  /** Hide the built-in Artifacts sidebar item. */
  hideArtifactsLink?: boolean;
  /** Custom nav items appended to the sidebar rail. The host supplies each item's label, icon, and click handler. */
  sidebarLinks?: SidebarNavLink[];
  /** Whether to hide the default message actions (e.g. copy, retry). */
  hideMessageActions?: boolean;
  /**
   * Generic streaming-state callback. Fires from inside ChatStateProvider
   * whenever isStreaming or resumeState transitions (edge only, not per token).
   * Keeps the SDK agnostic — hosts can drive banners/notifications.
   */
  onStreamingChange?: (
    isStreaming: boolean,
    messages: ChatMessage[],
    resumeState: ResumeState,
    executionId?: string,
  ) => void;
  /**
   * Whether to show the Tools button in the composer footer.
   * Overrides `config.enableTools` if provided. Defaults to true.
   */
  enableTools?: boolean;
  /**
   * Whether to show the voice input (microphone) button in the composer footer.
   * Overrides `config.enableVoiceInput` if provided. Defaults to true.
   */
  enableVoiceInput?: boolean;
  /**
   * Overrides `config.enableSendButton` if provided. Defaults to true.
   */
  enableSendButton?: boolean;
}

export function ChatShell({
  onExportArtifact,
  onRecordClick,
  renderMessageFooter,
  recordPanel,
  className,
  style,
  viewportOffset,
  initialSessionId,
  onSessionChange,
  emptyState,
  tips = [],
  onArtifactsClick,
  hideArtifactsLink,
  sidebarLinks,
  hideMessageActions,
  onStreamingChange,
  enableTools,
  enableVoiceInput,
  enableSendButton,
}: ChatShellProps) {
  const { config } = useChatContext();
  const artifactsCtx = useArtifacts();
  const sourcesCtx = useSources();
  const filesCtx = useSessionFiles();
  return (
    <ChatStateProvider
      onArtifactsReady={artifactsCtx.registerArtifacts}
      onClearArtifacts={artifactsCtx.clearArtifacts}
    >
      <ChatShellContent
        artifactsCtx={artifactsCtx}
        sourcesCtx={sourcesCtx}
        filesCtx={filesCtx}
        enableFileUpload={config.enableFileUpload}
        onExportArtifact={onExportArtifact}
        onRecordClick={onRecordClick}
        renderMessageFooter={renderMessageFooter}
        recordPanel={recordPanel}
        className={className}
        style={style}
        viewportOffset={viewportOffset}
        initialSessionId={initialSessionId}
        onSessionChange={onSessionChange}
        emptyState={emptyState}
        tips={tips}
        onArtifactsClick={onArtifactsClick}
        hideArtifactsLink={hideArtifactsLink}
        sidebarLinks={sidebarLinks}
        hideMessageActions={hideMessageActions}
        onStreamingChange={onStreamingChange}
        enableTools={enableTools}
        enableVoiceInput={enableVoiceInput}
        enableSendButton={enableSendButton}
      />
    </ChatStateProvider>
  );
}

interface ChatShellContentProps extends ChatShellProps {
  artifactsCtx: UseArtifactsReturn;
  sourcesCtx: UseSourcesReturn;
  filesCtx: UseSessionFilesReturn;
  enableFileUpload: boolean;
}

function ChatShellContent({
  onExportArtifact,
  onRecordClick,
  renderMessageFooter,
  recordPanel,
  className,
  style,
  viewportOffset,
  initialSessionId,
  onSessionChange,
  artifactsCtx,
  sourcesCtx,
  filesCtx,
  enableFileUpload,
  emptyState,
  tips = [],
  onArtifactsClick,
  hideArtifactsLink,
  sidebarLinks,
  hideMessageActions,
  onStreamingChange,
  enableTools,
  enableVoiceInput,
  enableSendButton,
}: ChatShellContentProps) {
  const {
    sendMessage,
    stopStreaming,
    isStreaming,
    clearMessages,
    loadSession,
    adapter,
    currentSessionId,
    currentSessionTitle,
    resumeState,
    resumeRun,
    messages,
    streamingState,
  } = useChat();
  const prevStreamingRef = useRef({ isStreaming, resumeState });
  useEffect(() => {
    if (!onStreamingChange) return;
    if (
      prevStreamingRef.current.isStreaming === isStreaming &&
      prevStreamingRef.current.resumeState === resumeState
    )
      return;
    prevStreamingRef.current = { isStreaming, resumeState };
    onStreamingChange(
      isStreaming,
      messages,
      resumeState,
      (streamingState as StreamingState | undefined)?.executionId,
    );
  }, [
    isStreaming,
    messages,
    resumeState,
    (streamingState as StreamingState | undefined)?.executionId,
    onStreamingChange,
  ]);
  const { setTopBanner, setBottomBanner, config } = useChatContext();

  React.useEffect(() => {
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

  React.useEffect(() => {
    const BUILT_IN_COMMANDS = [
      {
        id: "shell:new-conversation",
        label: "New Conversation",
        description: "Start a fresh chat session",
        onExecute: () => {
          handleNewConversation();
        },
      },
      {
        id: "shell:view-recents",
        label: "Recent Conversations",
        description: "Browse your conversation history",
        onExecute: () => {
          handleViewChange("recents");
        },
      },
    ];

    BUILT_IN_COMMANDS.forEach(registerCommand);
    return () => BUILT_IN_COMMANDS.forEach((c) => unregisterCommand(c.id));
  }, []); // handleNewConversation and handleViewChange are stable refs

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isOverlayViewport, setIsOverlayViewport] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth <= SIDEBAR_OVERLAY_BREAKPOINT_PX : false,
  );
  const didLoadInitialRef = React.useRef(false);
  React.useEffect(() => {
    if (!initialSessionId) return;
    if (initialSessionId === currentSessionId) {
      didLoadInitialRef.current = true;
      return;
    }
    if (didLoadInitialRef.current) return;
    didLoadInitialRef.current = true;
    adapter
      .loadSession(initialSessionId)
      .then((session: SessionWithMessages) => {
        loadSession(session);
      })
      .catch(() => {
        onSessionChange?.(undefined);
      });
  }, [initialSessionId, currentSessionId, adapter, loadSession, onSessionChange]);

  const prevSessionIdRef = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    if (currentSessionId === undefined && prevSessionIdRef.current === undefined) return;
    if (currentSessionId === prevSessionIdRef.current) return;
    prevSessionIdRef.current = currentSessionId;
    onSessionChange?.(currentSessionId);
  }, [currentSessionId, onSessionChange]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => {
      const nextIsOverlay = window.innerWidth <= SIDEBAR_OVERLAY_BREAKPOINT_PX;
      setIsOverlayViewport(nextIsOverlay);
      if (!nextIsOverlay) {
        setSidebarOpen(false);
      }
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const embedPanelIsOpen =
    !!recordPanel || (config.enableArtifacts && artifactsCtx.panelState.isOpen);

  const filesOpen = enableFileUpload && filesCtx.panelOpen;
  const innerRightPanelIsOpen = sourcesCtx.panelState.isOpen || filesOpen;
  const showSourcesPanel = sourcesCtx.panelState.isOpen;
  const showFilesPanel = filesOpen && !sourcesCtx.panelState.isOpen;

  const innerRightPanelDefaultSize = showSourcesPanel ? 25 : 30;
  const mainPanelDefaultSize = 100 - innerRightPanelDefaultSize;
  const layoutStorageKey = `ais-chat-layout-${showSourcesPanel ? "sources" : "files"}`;

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

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(layoutStorageKey);
    setSavedLayout(saved ? JSON.parse(saved) : undefined);
  }, [layoutStorageKey]);

  const outerLayoutStorageKey = "ais-shell-layout";

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

  React.useEffect(() => {
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

  const [activeView, setActiveView] = useState<SidebarView>("chat");

  function handleViewChange(view: SidebarView) {
    setActiveView(view);
    setSidebarOpen(false);
  }

  function handleNewConversation() {
    clearMessages();
    setActiveView("chat");
    setSidebarOpen(false);
  }

  const sessionTitle = currentSessionTitle?.trim() || "New session";

  // Mobile viewport sizing: where `dvh` is unsupported, mirror the visual
  // viewport height into --ais-viewport-height so the shell never overflows
  // the visible area when browser chrome shows/hides.
  const shellRef = React.useRef<HTMLDivElement | null>(null);
  useViewportHeightFallback(shellRef);
  const isMobile = useIsMobile();
  const viewport = useVisualViewport(isMobile);
  const keyboardOpen = useKeyboardOpen(isMobile);

  const shellStyle: React.CSSProperties = {
    ...(viewportOffset?.top != null
      ? ({ "--ais-chrome-offset-top": `${viewportOffset.top}px` } as React.CSSProperties)
      : {}),
    ...(viewportOffset?.bottom != null
      ? ({ "--ais-chrome-offset-bottom": `${viewportOffset.bottom}px` } as React.CSSProperties)
      : {}),
    ...style,
    // iOS keyboard: `dvh` does not shrink. Recents search and the composer
    // autofocus/focus then drag a full-height shell off-screen. Shrink to the
    // visual viewport so the focused field stays in view.
    ...(keyboardOpen && viewport ? { height: viewport.height, maxHeight: viewport.height } : {}),
  };

  return (
    <div
      ref={shellRef}
      className={`ais-chat-shell ${className ?? ""} ${keyboardOpen ? "is-keyboard-open" : ""}`.trim()}
      style={shellStyle}
    >
      <ChatSidebar
        activeView={activeView}
        isOpen={isOverlayViewport ? sidebarOpen : false}
        onNewConversation={handleNewConversation}
        onToggle={() => setSidebarOpen((prev) => !prev)}
        onClose={() => setSidebarOpen(false)}
        onViewChange={handleViewChange}
        artifactPanelOpen={artifactsCtx.panelState.isOpen}
        onToggleArtifacts={
          onArtifactsClick ||
          (() =>
            artifactsCtx.panelState.isOpen
              ? artifactsCtx.closePanel()
              : artifactsCtx.openArtifact(Array.from(artifactsCtx.artifacts.keys())[0] ?? ""))
        }
        hideArtifactsLink={hideArtifactsLink}
        sidebarLinks={sidebarLinks}
      />

      <ResizablePanelGroup
        key={`shell-resizable-group-${embedPanelIsOpen}`}
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
          <div className="ais-chat-content">
            <ChatShellHeader
              onOpenMenu={() => setSidebarOpen(true)}
              sessionTitle={sessionTitle}
              artifactsCount={artifactsCtx.artifacts.size}
              artifactsPanelOpen={artifactsCtx.panelState.isOpen}
              onToggleArtifacts={() =>
                artifactsCtx.panelState.isOpen
                  ? artifactsCtx.closePanel()
                  : artifactsCtx.openArtifact(Array.from(artifactsCtx.artifacts.keys())[0] ?? "")
              }
              filesCount={enableFileUpload ? filesCtx.files.length : 0}
              onToggleFiles={
                enableFileUpload
                  ? () => (filesCtx.panelOpen ? filesCtx.closePanel() : filesCtx.openPanel())
                  : undefined
              }
              filesPanelOpen={filesOpen}
            />

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
                maxSize={80}
                minSize={20}
                className="ais-resizable-panel"
              >
                <main className="ais-chat-main">
                  {activeView === "recents" ? (
                    <RecentsPage
                      onSelectSession={() => setActiveView("chat")}
                      onNewConversation={handleNewConversation}
                    />
                  ) : (
                    <>
                      <ChatMessages
                        artifactsCtx={artifactsCtx}
                        sourcesCtx={sourcesCtx}
                        onRecordClick={onRecordClick}
                        renderMessageFooter={renderMessageFooter}
                        emptyState={emptyState}
                        hideMessageActions={hideMessageActions}
                      />
                      <ChatComposer
                        enableTools={enableTools}
                        enableVoiceInput={enableVoiceInput}
                        enableSendButton={enableSendButton}
                        isStreaming={isStreaming}
                        onStop={stopStreaming}
                        resumeState={resumeState}
                        onResume={() => void resumeRun()}
                        onSendMessage={(
                          message,
                          attachedFileIds,
                          sessionId,
                          extraContextVariables,
                        ) => {
                          void sendMessage(
                            message,
                            attachedFileIds,
                            sessionId,
                            extraContextVariables,
                          );
                        }}
                      />
                    </>
                  )}
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
                    <SourcesPanel sourcesCtx={sourcesCtx} />
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

      {isOverlayViewport && sidebarOpen && (
        <div className="ais-mobile-sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      {config.enableCommandPalette && <CommandPalette />}
    </div>
  );
}
