"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  FileText,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useChatContext } from "../../headless/context/chat-provider";
import { useConversationHistory } from "../../headless/hooks/use-conversation-history";
import { useChat } from "../../headless/hooks/use-chat";
import { RecentSessionItem } from "../shared/recent-session-item";
import { ConfirmDialog } from "../shared/confirm-dialog";

export type SidebarView = "chat" | "recents";
const SIDEBAR_OVERLAY_BREAKPOINT_PX = 1024;

/**
 * A host-supplied navigation item appended to the sidebar rail. Keeps the SDK
 * agnostic: the consumer owns the label, icon, and click behaviour, so any
 * product can wire its own destinations (e.g. a "back to host app" link)
 * without the SDK encoding domain-specific navigation.
 */
export interface SidebarNavLink {
  /** Stable identifier, used as the React key. */
  id: string;
  /** Visible label and accessible name. */
  label: string;
  /** Icon component; defaults to a generic external-link glyph when omitted. */
  icon?: LucideIcon;
  /** Invoked when the item is clicked. */
  onClick: () => void;
}

interface SidebarNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  active?: boolean;
  action: () => void;
}

interface ChatSidebarProps {
  onNewConversation?: () => void;
  isOpen?: boolean;
  onToggle?: () => void;
  className?: string;
  activeView?: SidebarView;
  onViewChange?: (view: SidebarView) => void;
  /** When this transitions from false → true (artifact panel just opened),
   *  the sidebar is automatically collapsed. The user can still re-open it
   *  afterwards — this is a one-time nudge, not a permanent lock. REQ-02/04 */
  artifactPanelOpen?: boolean;
  onToggleArtifacts?: () => void;
  /** Hide the built-in Artifacts nav item (e.g. when the host has no use for it). */
  hideArtifactsLink?: boolean;
  /** Custom nav items appended after the built-in items. */
  sidebarLinks?: SidebarNavLink[];
}

export function ChatSidebar({
  onNewConversation,
  isOpen,
  onToggle,
  className,
  activeView = "chat",
  onViewChange,
  artifactPanelOpen,
  onToggleArtifacts,
  hideArtifactsLink = false,
  sidebarLinks = [],
}: ChatSidebarProps) {
  const { adapter, organizationId, currentSession, setCurrentSession } = useChatContext();
  const { sessions, isLoading, refresh, deleteSession } = useConversationHistory();
  const { loadSession, switchSession, currentSessionId, isStreaming, clearMessages, messages } = useChat();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    const persisted = window.localStorage.getItem("ais-chat-sidebar-collapsed");
    if (persisted === "1") return true;
    if (persisted === "0") return false;
    // No stored preference yet — auto-collapse on smaller screens on first mount.
    return window.innerWidth <= SIDEBAR_OVERLAY_BREAKPOINT_PX;
  });
  const [recentsCollapsed, setRecentsCollapsed] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const isStreamingRef = React.useRef(isStreaming);
  const prevArtifactOpenRef = React.useRef<boolean | undefined>(undefined);
  // What `collapsed` was right before the artifact panel auto-collapsed it, so
  // closing the panel can restore it — and whether the user explicitly touched
  // the toggle while the panel was open, in which case we defer to them instead
  // of stomping their choice back to the pre-collapse value.
  const preAutoCollapseRef = React.useRef(false);
  const userToggledDuringArtifactRef = React.useRef(false);

  const displaySessions = useMemo(() => {
    const hasCurrent = sessions.some((s) => s.sessionId === currentSessionId);
    if (currentSessionId && !hasCurrent) {
      const userMsg = messages.find((m) => m.role === "user")?.content;
      if (userMsg) {
        const title = userMsg.length > 50 ? userMsg.substring(0, 47) + "..." : userMsg;
        const optimisticSession = {
          sessionId: currentSessionId,
          title,
          updatedAt: new Date().toISOString(),
          status: "active" as const,
        };
        return [optimisticSession, ...sessions];
      }
    }
    return sessions;
  }, [sessions, currentSessionId, messages]);

  // REQ-02: auto-collapse the sidebar the moment the artifact panel opens,
  // but allow the user to re-expand it afterwards (edge-trigger, not a lock).
  // Closing the panel restores whatever the sidebar was before, unless the
  // user explicitly toggled it while the panel was open — that choice wins.
  useEffect(() => {
    if (artifactPanelOpen && !prevArtifactOpenRef.current) {
      preAutoCollapseRef.current = collapsed;
      userToggledDuringArtifactRef.current = false;
      setCollapsed(true);
    } else if (!artifactPanelOpen && prevArtifactOpenRef.current) {
      if (!userToggledDuringArtifactRef.current) {
        setCollapsed(preAutoCollapseRef.current);
      }
    }
    prevArtifactOpenRef.current = artifactPanelOpen;
  }, [artifactPanelOpen]);

  const handleDeleteSession = (sessionId: string) => {
    setSessionToDelete(sessionId);
  };

  const confirmDelete = async () => {
    if (sessionToDelete) {
      await deleteSession(sessionToDelete);
      if (sessionToDelete === currentSessionId) {
        if (onNewConversation) {
          onNewConversation();
        } else {
          clearMessages();
        }
      }
      setSessionToDelete(null);
    }
  };

  // Refresh sessions when a new chat's first response completes
  useEffect(() => {
    if (isStreamingRef.current && !isStreaming) {
      const isKnownSession = sessions.some((s) => s.sessionId === currentSessionId);
      if (!isKnownSession && currentSessionId) {
        void refresh();
      }
    }
    isStreamingRef.current = isStreaming;
  }, [isStreaming, sessions, currentSessionId, refresh]);

  // Sync current session title with the history list if it changed (e.g. after auto-naming)
  useEffect(() => {
    if (!currentSessionId || !currentSession || isStreaming) return;

    const matchingSession = sessions.find((s) => s.sessionId === currentSessionId);
    if (matchingSession && matchingSession.title !== currentSession.title) {
      setCurrentSession({
        ...currentSession,
        title: matchingSession.title,
      });
    }
  }, [sessions, currentSessionId, currentSession, setCurrentSession, isStreaming]);

  useEffect(() => {
    if (!isOpen) return;
    if (window.innerWidth <= SIDEBAR_OVERLAY_BREAKPOINT_PX) {
      setCollapsed(false);
    }
  }, [isOpen]);

  const topNavItems = useMemo<SidebarNavItem[]>(() => {
    const items: SidebarNavItem[] = [
      {
        id: "new-chat",
        label: "New Chat",
        icon: Plus,
        action: () => {
          onNewConversation?.();
          onViewChange?.("chat");
        },
      },
      {
        id: "search",
        label: "Search",
        icon: Search,
        action: () => {
          window.dispatchEvent(new CustomEvent("ais-open-command-palette"));
        },
      },
      {
        id: "recents",
        label: "Chats",
        icon: MessageCircle,
        active: activeView === "recents",
        action: () => onViewChange?.("recents"),
      },
    ];

    if (!hideArtifactsLink) {
      items.push({
        id: "artifacts",
        label: "Artifacts",
        icon: FileText,
        active: artifactPanelOpen,
        action: () => {
          onToggleArtifacts?.();
        },
      });
    }

    for (const link of sidebarLinks) {
      items.push({
        id: link.id,
        label: link.label,
        icon: link.icon ?? ExternalLink,
        action: link.onClick,
      });
    }

    return items;
  }, [
    onNewConversation,
    onViewChange,
    activeView,
    onToggleArtifacts,
    artifactPanelOpen,
    hideArtifactsLink,
    sidebarLinks,
  ]);

  function renderRailButton(item: SidebarNavItem) {
    const Icon = item.icon;
    return (
      <button
        key={item.id}
        className={`ais-sidebar-nav-item ${item.active ? "is-active" : ""} ${collapsed ? "is-collapsed" : ""}`}
        onClick={() => {
          item.action?.();
          if (isOpen && onToggle) onToggle(); // Close sidebar on mobile after action
        }}
        type="button"
        title={item.label}
        aria-label={item.label}
      >
        <Icon size={18} strokeWidth={1.9} />
        <span className="ais-sidebar-nav-label">{item.label}</span>
        {item.id === "search" && !collapsed && <span className="ais-sidebar-nav-shortcut">⌘K</span>}
      </button>
    );
  }

  return (
    <aside
      className={`ais-sidebar ${collapsed ? "is-collapsed" : ""} ${isOpen ? "is-mobile-open" : ""} ${className ?? ""}`}
    >
      <div className="ais-sidebar-header">
        <div className="ais-sidebar-brand">
          <div className="ais-sidebar-brand-title">anter</div>
        </div>

        <button
          className="ais-sidebar-toggle"
          onClick={() => {
            if (window.innerWidth <= SIDEBAR_OVERLAY_BREAKPOINT_PX && onToggle) {
              onToggle();
            } else {
              // An explicit user choice — persist it directly here (rather than
              // via a blanket effect on every `collapsed` change) so the
              // artifact-panel auto-collapse/restore above never overwrites it,
              // and mark it so the panel-close restore defers to this instead.
              userToggledDuringArtifactRef.current = true;
              setCollapsed((prev) => {
                const next = !prev;
                try {
                  window.localStorage.setItem("ais-chat-sidebar-collapsed", next ? "1" : "0");
                } catch {
                  // ignore localStorage errors
                }
                return next;
              });
            }
          }}
          type="button"
          aria-label={collapsed ? "Open sidebar" : "Close sidebar"}
          title={collapsed ? "Open sidebar" : "Close sidebar"}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      <div className={`ais-sidebar-nav-list ${collapsed ? "is-collapsed" : ""}`}>
        {topNavItems.map((item) => renderRailButton(item))}
      </div>

      {(!collapsed || isOpen) && (
        <div
          className={`ais-sidebar-content-area ${recentsCollapsed ? "is-recents-collapsed" : ""}`}
        >
          <div className="ais-sidebar-section-header">
            <div className="ais-sidebar-section-label">Recents</div>
            <button
              className="ais-sidebar-section-toggle"
              onClick={() => setRecentsCollapsed((prev) => !prev)}
              type="button"
            >
              {recentsCollapsed ? "Show" : "Hide"}
            </button>
          </div>
          <div className="ais-sidebar-recents" role="list" aria-label="Recent conversations">
            {isLoading ? <p className="ais-sidebar-hint">Loading...</p> : null}
            {!isLoading && displaySessions.length === 0 ? (
              <p className="ais-sidebar-hint">No conversations yet</p>
            ) : null}
            {displaySessions.map((session) => (
              <RecentSessionItem
                key={session.sessionId}
                session={session}
                isActive={session.sessionId === currentSessionId}
                onClick={async () => {
                  try {
                    if (switchSession) {
                      await switchSession(session.sessionId);
                    } else {
                      const full = await adapter.loadSession(session.sessionId);
                      loadSession(full);
                    }
                    if (isOpen && onToggle) onToggle();
                  } catch {
                    // Session no longer exists on the backend — refresh the
                    // list and fall back to an empty new-chat state.
                    void refresh();
                    clearMessages();
                    onNewConversation?.();
                  }
                }}
                onDelete={handleDeleteSession}
                formatDate={(d) => d} // Sidebar variant doesn't use formatDate currently
                variant="sidebar"
              />
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!sessionToDelete}
        onOpenChange={(open) => !open && setSessionToDelete(null)}
        title="Delete conversation"
        description="Are you sure you want to delete this conversation? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDelete}
        isDanger
      />
    </aside>
  );
}
