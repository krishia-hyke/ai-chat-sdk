export interface ChatTheme {
  bg?: string;
  sidebarBg?: string;
  artifactBg?: string;
  border?: string;
  accent?: string;
  accentHover?: string;
  accentForeground?: string;
  messageUserBg?: string;
  messageUserText?: string;
  messageAiBg?: string;
  messageAiText?: string;
  muted?: string;
  radiusSm?: string;
  radiusMd?: string;
  radiusLg?: string;
  sidebarWidth?: string;
  artifactWidth?: string;
  floatingPanelBg?: string;
  floatingPanelBorder?: string;
  floatingPanelCardBg?: string;
}

export interface ChatThemeSpecification {
  light?: ChatTheme;
  dark?: ChatTheme;
}

export interface ChatConfig {
  enableArtifacts?: boolean;
  enableModelSelector?: boolean;
  enableFileUpload?: boolean;
  enableSlashCommands?: boolean;
  enableCommandPalette?: boolean;
  enableSlashFocusShortcut?: boolean;
  /**
   * Show the composer Resume/Retry control when the loaded session's `resumeState`
   * indicates the last run crashed (`resumable` → Resume, `retry` → Retry). Requires
   * the host adapter to surface `resumeState`/`resumableExecutionId` from `loadSession`
   * and (for Resume) implement `resumeExecution`. Defaults to true.
   */
  enableResumeRetry?: boolean;
  enableTools?: boolean;
  enableVoiceInput?: boolean;
  enableSendButton?: boolean;
  defaultModel?: string;
  theme?: "light" | "dark" | "system";
  themeOptions?: ChatThemeSpecification;
}

/**
 * Context handed to a slash-command interceptor so the host can surface output
 * back into the chat transcript without performing a backend round-trip.
 */
export interface SlashCommandContext {
  /** Appends an assistant-role markdown message to the transcript. */
  appendAssistantMessage(markdown: string): void;
}

/**
 * Host-provided interceptor for slash commands. Invoked before any backend send
 * whenever the composer submits a message beginning with `/<word>`.
 *
 * - `name` is the matched command (e.g. `"/agent"`).
 * - `args` is the trimmed remainder after the command (e.g. `"set my-agent"`).
 * - Return `true` (or a promise resolving to `true`) to mark the command handled,
 *   which renders the typed command plus any appended messages and skips the
 *   backend `sendMessage` call entirely.
 * - Return `false`/`undefined` to let the SDK fall through to its built-in
 *   handling (e.g. `/help`) or the normal backend send.
 */
export type SlashCommandHandler = (
  name: string,
  args: string,
  ctx: SlashCommandContext,
) => boolean | void | Promise<boolean | void>;

export const defaultStrings = {
  newConversation: "New conversation",
  sendMessage: "Send message",
  retry: "Retry",
  thinking: "Thinking...",
  artifactPanelClose: "Close artifact panel",
  openFullChat: "Open full chat",
  cancel: "Cancel",
  composerPlaceholder: "Ask a question...",
  footerDisclaimer: "AI responses can contain mistakes.",
  exportArtifact: "Save to workspace",
  exportArtifactSub: "Attach to your workspace",
  recentsTitle: "Chats",
  recentsSectionTitle: "Recents",
  searchChats: "Search chats...",
  noConversationsYet: "No conversations yet",
  noMatchingChats: "No chats match your search.",
  emptyStateHeading: "What would you like to work on today?",
  approvalTitle: "Approval required",
  approvalApprove: "Approve",
  approvalDeny: "Deny",
  approvalConfirmDeny: "Confirm deny",
  approvalDenyReasonPlaceholder: "Optional reason — sent to the agent",
  approvalWaiting: "Waiting for approval through another channel…",
  approvalApproved: "Approved",
  approvalDenied: "Denied",
  approvalExpired: "Expired",
  approvalCanceled: "Canceled",
  // Deliberately not "You stopped this response" — a run can also be stopped from
  // another channel (another device, or an operator ending a wedged run server-side).
  responseStopped: "This response was stopped.",
} as const;

export type DefaultChatStringKey = keyof typeof defaultStrings;

export type DefaultChatStrings = {
  [K in DefaultChatStringKey]: string;
};

/**
 * Fully resolved strings dictionary provided by ChatContext.
 * Guaranteed to provide non-empty defaults for all built-in keys,
 * while allowing extensible access for custom keys.
 */
export interface ChatStrings extends DefaultChatStrings {
  [key: string]: string;
}

/**
 * Partial strings dictionary accepted by ChatProvider.
 * All built-in keys are optional and accept any custom string (not just exact literals),
 * with an index signature allowing arbitrary domain-specific keys without TypeScript casting.
 */
export type ChatProviderStrings = {
  [K in DefaultChatStringKey]?: string;
} & {
  [key: string]: string | undefined;
};
