"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ChatAdapter } from "../types/adapter";
import type {
  ChatConfig,
  ChatProviderStrings,
  ChatStrings,
  ChatTheme,
  ChatThemeSpecification,
  SlashCommandHandler,
} from "../types/config";
import type { ChatPlugins } from "../types/plugins";
import type { Session } from "../types/session";
import type { ComposerAnnouncement, ContextReference } from "../types/chat";
import { defaultStrings } from "../types/config";

interface ChatContextValue {
  adapter: ChatAdapter;
  organizationId?: string;
  config: Required<ChatConfig>;
  strings: ChatStrings;
  plugins: ChatPlugins;
  onSlashCommand?: SlashCommandHandler;
  currentSession?: Session;
  setCurrentSession: (session?: Session) => void;
  orgLabel?: string;
  setOrgLabel: (label: string | undefined) => void;
  activeContextId?: string;
  activeContextLabel?: string;
  setActiveContext: (id: string | undefined, label?: string | undefined) => void;
  contextReferences: ContextReference[];
  setContextReferences: (refs: ContextReference[]) => void;
  addContextReference: (ref: ContextReference) => void;
  removeContextReference: (id: string) => void;
  topBanner: ComposerAnnouncement | null;
  setTopBanner: (announcement: ComposerAnnouncement | null) => void;
  bottomBanner: ComposerAnnouncement | null;
  setBottomBanner: (announcement: ComposerAnnouncement | null) => void;
  /** @deprecated Use bottomBanner/setBottomBanner */
  announcement: ComposerAnnouncement | null;
  /** @deprecated Use setBottomBanner */
  setAnnouncement: (announcement: ComposerAnnouncement | null) => void;
  persistentContextVariables: Record<string, string>;
  setPersistentContextVariable: (key: string, value: string | undefined) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

const THEME_MAP: Record<keyof ChatTheme, string> = {
  bg: "--chat-bg",
  sidebarBg: "--chat-sidebar-bg",
  artifactBg: "--artifact-bg",
  border: "--chat-border",
  accent: "--chat-accent",
  accentHover: "--chat-accent-hover",
  accentForeground: "--chat-accent-foreground",
  messageUserBg: "--message-user-bg",
  messageUserText: "--message-user-text",
  messageAiBg: "--message-ai-bg",
  messageAiText: "--message-ai-text",
  muted: "--chat-muted",
  radiusSm: "--chat-radius-sm",
  radiusMd: "--chat-radius-md",
  radiusLg: "--chat-radius-lg",
  sidebarWidth: "--chat-sidebar-width",
  artifactWidth: "--chat-artifact-width",
  floatingPanelBg: "--ais-floating-panel-bg",
  floatingPanelBorder: "--ais-floating-panel-border",
  floatingPanelCardBg: "--ais-floating-panel-card-bg",
};

function generateThemeCss(themeOptions?: ChatThemeSpecification): string {
  if (!themeOptions) return "";
  let css = "";

  if (themeOptions.light) {
    css += `\n[data-chat-provider="ai-chat-sdk"] {\n`;
    for (const [key, value] of Object.entries(themeOptions.light)) {
      const cssVar = THEME_MAP[key as keyof ChatTheme];
      if (cssVar && value) {
        css += `  ${cssVar}: ${value};\n`;
      }
    }
    css += `}\n`;
  }

  if (themeOptions.dark) {
    const darkSelectors = [
      `[data-chat-provider="ai-chat-sdk"][data-theme="dark"]`,
      `:where(.dark) [data-chat-provider="ai-chat-sdk"]:not([data-theme="light"])`,
    ];

    css += `\n${darkSelectors.join(",\n")} {\n`;
    for (const [key, value] of Object.entries(themeOptions.dark)) {
      const cssVar = THEME_MAP[key as keyof ChatTheme];
      if (cssVar && value) {
        css += `  ${cssVar}: ${value};\n`;
      }
    }
    css += `}\n`;

    css += `\n@media (prefers-color-scheme: dark) {\n  [data-chat-provider="ai-chat-sdk"]:not([data-theme="light"]) {\n`;
    for (const [key, value] of Object.entries(themeOptions.dark)) {
      const cssVar = THEME_MAP[key as keyof ChatTheme];
      if (cssVar && value) {
        css += `    ${cssVar}: ${value};\n`;
      }
    }
    css += `  }\n}\n`;
  }

  return css;
}

export interface ChatProviderProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  adapter: ChatAdapter;
  organizationId?: string;
  config?: ChatConfig;
  strings?: ChatProviderStrings;
  plugins?: ChatPlugins;
  onSlashCommand?: SlashCommandHandler;
  "data-chat-provider"?: string;
}

export function ChatProvider({
  children,
  adapter,
  organizationId = "",
  config = {},
  strings = {},
  plugins = {},
  onSlashCommand,
  className,
  style,
  ...rest
}: ChatProviderProps) {
  const [currentSession, setCurrentSession] = useState<Session | undefined>(undefined);
  const [orgLabel, setOrgLabel] = useState<string | undefined>(undefined);
  const [activeContextId, setActiveContextId] = useState<string | undefined>(undefined);
  const [activeContextLabel, setActiveContextLabel] = useState<string | undefined>(undefined);
  const [topBannerOverride, setTopBannerOverride] = useState<
    ComposerAnnouncement | null | undefined
  >(undefined);
  const [bottomBannerOverride, setBottomBannerOverride] = useState<
    ComposerAnnouncement | null | undefined
  >(undefined);
  const [persistentContextVariables, setPersistentContextVariablesState] = useState<
    Record<string, string>
  >({});
  const [contextReferences, setContextReferences] = useState<ContextReference[]>([]);

  const addContextReference = useCallback((ref: ContextReference) => {
    setContextReferences((prev) => {
      const idx = prev.findIndex((r) => r.id === ref.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = ref;
        return next;
      }
      return [...prev, ref];
    });
  }, []);

  const removeContextReference = useCallback((id: string) => {
    setContextReferences((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const setActiveContext = useCallback((id: string | undefined, label?: string | undefined) => {
    setActiveContextId(id);
    setActiveContextLabel(label);
  }, []);

  const setPersistentContextVariable = useCallback((key: string, value: string | undefined) => {
    setPersistentContextVariablesState((prev) => {
      if (value === undefined) {
        const { [key]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: value };
    });
  }, []);

  const setTopBanner = useCallback((announcement: ComposerAnnouncement | null) => {
    setTopBannerOverride(announcement);
  }, []);

  const setBottomBanner = useCallback((announcement: ComposerAnnouncement | null) => {
    setBottomBannerOverride(announcement);
  }, []);

  const topBanner =
    topBannerOverride !== undefined ? topBannerOverride : (plugins.composerTopBanner ?? null);
  const bottomBanner =
    bottomBannerOverride !== undefined
      ? bottomBannerOverride
      : (plugins.composerBottomBanner ?? null);

  const setAnnouncement = useCallback(
    (announcement: ComposerAnnouncement | null) => {
      setBottomBanner(announcement);
    },
    [setBottomBanner],
  );

  const mergedConfig: Required<ChatConfig> = {
    enableArtifacts: config.enableArtifacts ?? true,
    enableModelSelector: config.enableModelSelector ?? true,
    enableFileUpload: config.enableFileUpload ?? false,
    enableSlashCommands: config.enableSlashCommands ?? true,
    enableCommandPalette: config.enableCommandPalette ?? true,
    enableSlashFocusShortcut: config.enableSlashFocusShortcut ?? true,
    enableResumeRetry: config.enableResumeRetry ?? true,
    enableTools: config.enableTools ?? true,
    enableVoiceInput: config.enableVoiceInput ?? true,
    enableSendButton: config.enableSendButton ?? true,
    defaultModel: config.defaultModel ?? "claude-sonnet-4-6",
    theme: config.theme ?? "system",
    themeOptions: config.themeOptions ?? {},
  };

  const mergedStrings = useMemo(
    () => ({ ...defaultStrings, ...strings }) as ChatStrings,
    [strings],
  );

  const value = useMemo<ChatContextValue>(
    () => ({
      adapter,
      organizationId,
      config: mergedConfig,
      strings: mergedStrings,
      plugins,
      onSlashCommand,
      currentSession,
      setCurrentSession,
      orgLabel,
      setOrgLabel,
      activeContextId,
      activeContextLabel,
      setActiveContext,
      contextReferences,
      setContextReferences,
      addContextReference,
      removeContextReference,
      topBanner,
      setTopBanner,
      bottomBanner,
      setBottomBanner,
      announcement: bottomBanner,
      setAnnouncement,
      persistentContextVariables,
      setPersistentContextVariable,
    }),
    [
      adapter,
      organizationId,
      mergedConfig,
      mergedStrings,
      plugins,
      onSlashCommand,
      currentSession,
      orgLabel,
      activeContextId,
      activeContextLabel,
      setActiveContext,
      contextReferences,
      setContextReferences,
      addContextReference,
      removeContextReference,
      topBanner,
      setTopBanner,
      bottomBanner,
      setBottomBanner,
      persistentContextVariables,
      setPersistentContextVariable,
      setAnnouncement,
    ],
  );

  const themeCss = useMemo(() => {
    return generateThemeCss(config.themeOptions);
  }, [config.themeOptions]);

  return (
    <div
      data-chat-provider="ai-chat-sdk"
      data-theme={mergedConfig.theme}
      className={className}
      style={style}
      {...rest}
    >
      {themeCss && <style dangerouslySetInnerHTML={{ __html: themeCss }} />}
      <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
    </div>
  );
}

export function useChatContext(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChatContext must be used within ChatProvider");
  }

  return ctx;
}
