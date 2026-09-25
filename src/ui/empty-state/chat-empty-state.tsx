"use client";

import React from "react";
import { useChatContext } from "../../headless/context/chat-provider";

export interface StarterCard {
  /** A React node rendered as the card icon (e.g. a Lucide icon component). */
  icon: React.ReactNode;
  iconColor: string;
  title: string;
  description: string;
  prompt: string;
}

interface ChatEmptyStateProps {
  onSendMessage: (message: string) => void;
  starterCards?: StarterCard[];
  heading?: string;
  subheading?: string;
  compact?: boolean;
}

export function ChatEmptyState({
  onSendMessage,
  starterCards = [],
  heading = "What would you like to work on today?",
  subheading,
  compact = false,
}: ChatEmptyStateProps) {
  let enableSlashCommands = true;
  try {
    const { config } = useChatContext();
    enableSlashCommands = config.enableSlashCommands;
  } catch {
    // Graceful fallback if rendered outside a ChatProvider
  }

  return (
    <div className={`ais-empty-state ${compact ? "is-compact" : ""}`.trim()}>
      <div className="ais-empty-state-inner">
        <div className="ais-empty-prompt-header">
          <h2 className="ais-empty-heading ais-empty-heading--gradient">{heading}</h2>
          {subheading && <p className="ais-empty-subheading">{subheading}</p>}
        </div>

        {starterCards.length > 0 && (
          <div className="ais-starter-grid" role="list">
            {starterCards.map((card, i) => (
              <button
                key={card.title}
                role="listitem"
                className="ais-starter-card"
                style={{ animationDelay: `${i * 75}ms` }}
                onClick={() => onSendMessage(card.prompt)}
                type="button"
              >
                <div
                  className="ais-starter-card-icon"
                  style={{
                    color: card.iconColor,
                    background: `${card.iconColor}18`,
                  }}
                >
                  {card.icon}
                </div>
                <div className="ais-starter-card-body">
                  <span className="ais-starter-card-title">{card.title}</span>
                  <span className="ais-starter-card-desc">{card.description}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {enableSlashCommands && (
          <p className="ais-empty-hint">
            Or type <kbd>/</kbd> for slash commands
          </p>
        )}
      </div>
    </div>
  );
}
