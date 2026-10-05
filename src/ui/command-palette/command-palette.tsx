"use client";

import React, { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Command, CornerDownLeft, MessageSquare, Search, X } from "lucide-react";
import { getCommandRegistry } from "../../extensions/command-registry";
import { useConversationHistory } from "../../headless/hooks/use-conversation-history";
import { useChat } from "../../headless/hooks/use-chat";
import { useChatContext } from "../../headless/context/chat-provider";
import { useIsMobile } from "../../headless/hooks/use-is-mobile";
import {
  useKeyboardOpen,
  overlayHeight,
  useVisualViewport,
} from "../../headless/hooks/use-visual-viewport";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const commands = getCommandRegistry();
  const { sessions, isLoading } = useConversationHistory();
  const { loadSession, switchSession } = useChat();
  const { adapter, config } = useChatContext();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const isMobile = useIsMobile();
  const viewport = useVisualViewport(isMobile);
  const keyboardOpen = useKeyboardOpen(isMobile);

  useEffect(() => {
    if (!config?.enableCommandPalette) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((v) => !v);
      }
    };

    const handleOpen = () => {
      setOpen(true);
      setSelectedIndex(0);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("ais-open-command-palette", handleOpen);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("ais-open-command-palette", handleOpen);
    };
  }, [config?.enableCommandPalette]);

  const q = query.toLowerCase().trim();

  const filtered = useMemo(() => {
    const filteredCommands = q
      ? commands.filter((cmd) => `${cmd.label} ${cmd.description ?? ""}`.toLowerCase().includes(q))
      : commands;

    const filteredSessions = q
      ? sessions.filter((s) => s.title.toLowerCase().includes(q))
      : sessions.slice(0, 5);

    return [
      ...filteredCommands.map((cmd) => ({
        type: "command" as const,
        id: `cmd-${cmd.id}`,
        label: cmd.label,
        description: cmd.description,
        action: () => cmd.onExecute(),
      })),
      ...filteredSessions.map((s) => ({
        type: "session" as const,
        id: `session-${s.sessionId}`,
        label: s.title,
        description: "Recent chat",
        action: async () => {
          if (switchSession) {
            await switchSession(s.sessionId);
          } else {
            const full = await adapter.loadSession(s.sessionId);
            loadSession(full);
          }
        },
      })),
    ];
  }, [commands, sessions, q, adapter, loadSession, switchSession]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = async (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, filtered.length));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
      } else if (event.key === "Enter" && filtered[selectedIndex]) {
        event.preventDefault();
        await filtered[selectedIndex].action();
        setOpen(false);
        setQuery("");
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, filtered, selectedIndex]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const selectedElement = document.getElementById(`ais-command-item-${selectedIndex}`);
    selectedElement?.scrollIntoView({ block: "nearest" });
  }, [open, selectedIndex]);

  const commandItems = filtered.filter((i) => i.type === "command");
  const sessionItems = filtered.filter((i) => i.type === "session");

  const sheetStyle: React.CSSProperties | undefined = isMobile
    ? {
        top: viewport?.offsetTop ?? 0,
        left: 0,
        right: 0,
        width: "100%",
        height: overlayHeight(viewport),
        maxHeight: "none",
        transform: "none",
        borderRadius: 0,
      }
    : undefined;

  const paletteClass = [
    "ais-command-palette",
    isMobile ? "is-mobile" : "",
    keyboardOpen ? "is-keyboard-open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Dialog.Root onOpenChange={setOpen} open={open}>
      <Dialog.Portal
        container={typeof document !== "undefined" ? document.documentElement : undefined}
      >
        {/* Re-scope theme tokens: this portal leaves the in-tree ChatProvider so
            `position: fixed` is not trapped by the shell's overflow/transform. */}
        <div data-chat-provider="ai-chat-sdk" data-theme={config.theme}>
          <Dialog.Overlay className="ais-dialog-overlay" />
          <Dialog.Content className={paletteClass} style={sheetStyle}>
            <Dialog.Title className="ais-sr-only">Command Palette</Dialog.Title>
            <Dialog.Description className="ais-sr-only">
              Search for commands and recent chat conversations.
            </Dialog.Description>

            <div className="ais-command-header">
              <div className="ais-command-header-brand" aria-hidden="true">
                <span className="ais-command-header-dot" />
                <span>Command Center</span>
              </div>
              <Search className="ais-command-search-icon" size={20} />
              <input
                aria-activedescendant={
                  filtered[selectedIndex] ? `ais-command-item-${selectedIndex}` : undefined
                }
                aria-autocomplete="list"
                aria-controls="ais-command-listbox"
                aria-expanded={open}
                aria-label="Search commands and chats"
                autoComplete="off"
                autoFocus
                className="ais-command-input"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search commands and chats..."
                role="combobox"
                value={query}
              />
              <button
                aria-label="Close command palette"
                className="ais-command-close"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X size={20} />
              </button>
            </div>

            <div className="ais-command-body" id="ais-command-listbox" role="listbox">
              {isLoading && filtered.length === 0 ? (
                <div className="ais-command-empty">
                  <p className="ais-command-item-description">Loading…</p>
                </div>
              ) : filtered.length > 0 ? (
                <>
                  {commandItems.length > 0 && (
                    <div className="ais-command-section">
                      <div className="ais-command-section-title">Commands</div>
                      <ul className="ais-command-list">
                        {commandItems.map((item, idx) => {
                          const isSelected = idx === selectedIndex;
                          return (
                            <li className="ais-command-item" key={item.id}>
                              <button
                                aria-selected={isSelected}
                                className={`ais-command-item-button ${isSelected ? "is-selected" : ""}`}
                                id={`ais-command-item-${idx}`}
                                onClick={async () => {
                                  await item.action();
                                  setOpen(false);
                                  setQuery("");
                                }}
                                onMouseEnter={() => setSelectedIndex(idx)}
                                role="option"
                                type="button"
                              >
                                <div className="ais-command-item-icon">
                                  <Command size={18} />
                                </div>
                                <div className="ais-command-item-content">
                                  <span className="ais-command-item-label">{item.label}</span>
                                  {item.description ? (
                                    <span className="ais-command-item-description">
                                      {item.description}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="ais-command-item-enter">
                                  <CornerDownLeft size={14} />
                                </div>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {sessionItems.length > 0 && (
                    <div className="ais-command-section">
                      <div className="ais-command-section-title">Recent Conversations</div>
                      <ul className="ais-command-list">
                        {sessionItems.map((item, idx) => {
                          const flatIdx = commandItems.length + idx;
                          const isSelected = flatIdx === selectedIndex;
                          return (
                            <li className="ais-command-item" key={item.id}>
                              <button
                                aria-selected={isSelected}
                                className={`ais-command-item-button ${isSelected ? "is-selected" : ""}`}
                                id={`ais-command-item-${flatIdx}`}
                                onClick={async () => {
                                  await item.action();
                                  setOpen(false);
                                  setQuery("");
                                }}
                                onMouseEnter={() => setSelectedIndex(flatIdx)}
                                role="option"
                                type="button"
                              >
                                <div className="ais-command-item-icon">
                                  <MessageSquare size={18} />
                                </div>
                                <div className="ais-command-item-content">
                                  <span className="ais-command-item-label">{item.label}</span>
                                  {item.description ? (
                                    <span className="ais-command-item-description">
                                      {item.description}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="ais-command-item-enter">
                                  <CornerDownLeft size={14} />
                                </div>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </>
              ) : q ? (
                <div className="ais-command-empty">
                  <p>No results found for &ldquo;{query}&rdquo;</p>
                  <p className="ais-command-item-description">Try a different search term</p>
                </div>
              ) : (
                <div className="ais-command-empty">
                  <p className="ais-command-item-description">No recent conversations</p>
                </div>
              )}
            </div>

            {!isMobile ? (
              <div className="ais-command-footer">
                <div className="ais-command-shortcut">
                  <kbd>Esc</kbd> <span>to close</span>
                </div>
                <div className="ais-command-shortcut">
                  <kbd>↵</kbd> <span>to select</span>
                </div>
              </div>
            ) : null}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
