"use client";

import React, { useEffect, useState, useContext } from "react";
import { createPortal } from "react-dom";
import { X, ExternalLink, FileText, Database } from "lucide-react";
import { cn } from "../../lib/cn";
import type { MessageSource } from "../../headless/types/chat";
import { useChatContext } from "../../headless/context/chat-provider";

export interface CitationModalProps {
  source: MessageSource | null;
  onClose: () => void;
  className?: string;
  container?: HTMLElement | null;
}

export function CitationModal({ source, onClose, className, container }: CitationModalProps) {
  const [mounted, setMounted] = useState(false);
  const { config } = useChatContext();
  const theme = config?.theme ?? "light";

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!source) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [source, onClose]);

  if (!source) return null;

  const isDatabase = source.type === "database";
  const title = source.title || "Source Reference";
  const rawSnippet =
    source.snippet ||
    source.content ||
    source.matchText ||
    source.metadata?.matchedSnippet ||
    (typeof source.metadata?.citation === "string" ? source.metadata.citation : undefined);

  // Strip duplicate surrounding quotes so it renders as a clean single quote
  const cleanSnippet = rawSnippet ? rawSnippet.replace(/^["'\s]+|["'\s]+$/g, "").trim() : undefined;

  const tags =
    typeof source.metadata?.tags === "string"
      ? source.metadata.tags
      : Array.isArray(source.tags)
        ? source.tags.join(", ")
        : Array.isArray(source.metadata?.tags)
          ? (source.metadata.tags as string[]).join(", ")
          : undefined;

  const classification =
    typeof source.metadata?.classification === "string"
      ? source.metadata.classification
      : typeof source.classification === "string"
        ? source.classification
        : undefined;

  const page = source.page;
  const section = source.section;

  const modalContent = (
    <div data-chat-provider="ai-chat-sdk" data-theme={theme}>
      <div
        className={cn("ais-citation-modal-overlay", className)}
        role="dialog"
        aria-modal="true"
        aria-label={`Source citation: ${title}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        <div className="ais-citation-modal-card" role="document">
          <div className="ais-citation-modal-header">
            <div className="ais-citation-modal-title-group">
              <span className="ais-citation-modal-icon">
                {isDatabase ? <Database size={16} /> : <FileText size={16} />}
              </span>
              <span className="ais-citation-modal-title" title={title}>
                {title}
              </span>
            </div>
            <button
              type="button"
              className="ais-citation-modal-close"
              aria-label="Close"
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </div>

          <div className="ais-citation-modal-body">
            {cleanSnippet && (
              <blockquote className="ais-citation-modal-snippet">"{cleanSnippet}"</blockquote>
            )}

            {(tags || classification || page !== undefined || section) && (
              <div className="ais-citation-modal-meta">
                {tags && <span className="ais-citation-tag">{tags}</span>}
                {classification && (
                  <span className="ais-citation-classification">{classification}</span>
                )}
                {page !== undefined && <span className="ais-citation-page">Page {page}</span>}
                {section && <span className="ais-citation-section">{section}</span>}
              </div>
            )}

            {source.url && (
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="ais-citation-modal-link"
              >
                <span>Open external document</span>
                <ExternalLink size={14} />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (mounted && typeof document !== "undefined") {
    const target = container ?? document.body;
    return createPortal(modalContent, target);
  }

  return modalContent;
}
