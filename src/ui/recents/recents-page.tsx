"use client";

import React, { useMemo, useState } from "react";
import { MessageCircle, Search } from "lucide-react";
import { useChatContext } from "../../headless/context/chat-provider";
import { useConversationHistory } from "../../headless/hooks/use-conversation-history";
import { useChat } from "../../headless/hooks/use-chat";
import type { Session } from "../../headless/types/session";
import { RecentSessionItem } from "../shared/recent-session-item";
import { ConfirmDialog } from "../shared/confirm-dialog";

interface RecentsPageProps {
  onSelectSession?: () => void;
  onNewConversation?: () => void;
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return months === 1 ? "1 month ago" : `${months} months ago`;
  }
  const years = Math.floor(diffDays / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

function getGroupLabel(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "Older";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return "Previous 7 days";
  if (diffDays < 30) return "Previous 30 days";
  return "Older";
}

const GROUP_ORDER = ["Today", "Yesterday", "Previous 7 days", "Previous 30 days", "Older"];

export function RecentsPage({ onSelectSession, onNewConversation }: RecentsPageProps) {
  const { adapter, strings } = useChatContext();
  const { sessions, isLoading, deleteSession } = useConversationHistory();
  const { loadSession, currentSessionId, clearMessages } = useChat();
  const [query, setQuery] = useState("");
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => s.title.toLowerCase().includes(q));
  }, [sessions, query]);

  const groups = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const label of GROUP_ORDER) {
      map.set(label, []);
    }
    for (const session of filtered) {
      const label = getGroupLabel(session.updatedAt);
      const bucket = map.get(label) ?? [];
      bucket.push(session);
      map.set(label, bucket);
    }
    // Remove empty groups
    for (const [label, items] of map.entries()) {
      if (items.length === 0) map.delete(label);
    }
    return map;
  }, [filtered]);

  async function handleSelect(session: Session) {
    try {
      const full = await adapter.loadSession(session.sessionId);
      loadSession(full);
      onSelectSession?.();
    } catch {
      // Session no longer exists on the backend — fall back to a new chat.
      clearMessages();
      onNewConversation?.();
    }
  }

  return (
    <div className="ais-recents-page">
      <div className="ais-recents-header">
        <h1 className="ais-recents-title">{strings?.recentsTitle ?? "Chats"}</h1>
        <div className="ais-recents-search-wrap">
          <Search size={15} className="ais-recents-search-icon" />
          <input
            className="ais-recents-search"
            type="search"
            placeholder={strings?.searchChats ?? "Search chats..."}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={strings?.searchChats ?? "Search chats"}
          />
        </div>
      </div>

      <div className="ais-recents-list">
        {isLoading && (
          <div className="ais-recents-empty">
            <p>{strings?.loading ?? "Loading..."}</p>
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="ais-recents-empty">
            <MessageCircle size={36} strokeWidth={1.4} />
            <p>
              {query
                ? (strings?.noMatchingChats ?? "No chats match your search.")
                : (strings?.noConversationsYet ?? "No conversations yet.")}
            </p>
          </div>
        )}

        {!isLoading &&
          GROUP_ORDER.filter((label) => groups.has(label)).map((label) => (
            <div key={label} className="ais-recents-group">
              <div className="ais-recents-group-label">{label}</div>
              {groups.get(label)!.map((session) => (
                <RecentSessionItem
                  key={session.sessionId}
                  session={session}
                  isActive={session.sessionId === currentSessionId}
                  onClick={() => void handleSelect(session)}
                  onDelete={handleDeleteSession}
                  formatDate={formatRelativeDate}
                  variant="list"
                />
              ))}
            </div>
          ))}

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
      </div>
    </div>
  );
}
