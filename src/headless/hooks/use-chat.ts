"use client";

import { createParser, type EventSourceMessage } from "eventsource-parser";
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useChatContext } from "../context/chat-provider";
import type {
  AgentPlanPhase,
  AgentStepEvent,
  ChatMessage,
  MessageSource,
  StreamingState,
  ToolApproval,
} from "../types/chat";
import type { ResumeState, SessionWithMessages } from "../types/session";
import type { ChatAdapter } from "../types/adapter";
import type { Artifact } from "../types/artifact";
import {
  extractContent,
  extractError,
  isRunnerCancellation,
  isRunnerCompletion,
  isRunnerControlEvent,
  resolveEventType,
  runnerEventToStep,
  runnerStepConsumesSeq,
  toolApprovalFromRequestEvent,
  toolApprovalResolutionFromEvent,
} from "./stream-event-utils";
import { getSlashCommandRegistry } from "../../extensions/slash-command-registry";

import { extractArtifactsFromContent } from "../utils/artifact-utils";
import { extractCitationsFromContent } from "../utils/citation-utils";
import { extractRecordTagsFromContent, type RecordTag } from "../utils/record-utils";
import { extractSuggestionsFromContent } from "../utils/suggestion-utils";
import { StreamingSourceStripper, stripSources } from "../utils/streaming-source-stripper";

function generateMessageId(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  return `msg_${ts}_${rand}`;
}

function createUserMessage(content: string): ChatMessage {
  return {
    id: generateMessageId(),
    content,
    role: "user",
    timestamp: new Date(),
  };
}

function createAssistantMessage(): ChatMessage {
  return {
    id: generateMessageId(),
    content: "",
    role: "assistant",
    timestamp: new Date(),
    isStreaming: true,
    steps: [],
    startedAt: Date.now(),
  };
}

interface ParsedEvent {
  [key: string]: unknown;
  label?: string;
  phase?: "start" | "done" | string;
  status?: string;
  duration_ms?: number;
  content?: string;
  isComplete?: boolean;
  error?: string;
  event?:
    | "step"
    | "plan"
    | "done"
    | "error"
    | "content"
    | "artifact"
    | "context_required"
    | "context_resolved"
    | string;
  type?: string;
  payload?: Record<string, unknown>;
  step?: AgentStepEvent;
  plan?: { phases: AgentPlanPhase[] };
  sources?: MessageSource[];
  artifactIds?: string[];
  suggestions?: string[];
  contextKey?: string;
  questionIntro?: string;
  choices?: Array<{ label: string; value: string }>;
  key?: string;
  value?: string;
}

export interface UseChatReturn {
  isSessionLoading?: boolean;
  switchSession?: (sessionId: string) => Promise<SessionWithMessages>;
  messages: ChatMessage[];
  streamingState: StreamingState;
  isStreaming: boolean;
  isLoading: boolean;
  error?: string;
  currentSessionId?: string;
  currentSessionTitle?: string;
  adapter: ChatAdapter;
  sendMessage: (
    message: string,
    attachedFileIds?: string[],
    sessionId?: string,
    extraContextVariables?: Record<string, string>,
  ) => Promise<void>;
  /**
   * Stop the in-flight response (Stop button). Cancels the run server-side via
   * the adapter's optional `cancelRun`, then aborts the local stream and marks
   * the streaming message as stopped by the user.
   */
  stopStreaming: () => void;
  clearMessages: () => void;
  retryLastMessage: () => Promise<void>;
  /**
   * Retry from a specific user message. Removes that message and everything
   * after it (the assistant response, any subsequent turns), then re-sends
   * the same content — so the message doesn't duplicate.
   */
  retryMessage: (messageId: string) => Promise<void>;
  /**
   * Resume affordance for the last crashed run, from the loaded session's backend hint:
   * `resumable` → Resume (continue from checkpoint), `retry` → Retry (re-send last turn),
   * `live`/`null` → no manual control. Cleared when any new run starts.
   */
  resumeState: ResumeState;
  /** Run the Resume/Retry action (resume-from-checkpoint, with a retry fallback). */
  resumeRun: () => Promise<void>;
  loadSession: (session: SessionWithMessages) => void;
  /** Whether the adapter can resolve tool approvals (drives card actionability). */
  canResolveToolApprovals: boolean;
  /**
   * Resolve a pending tool approval via the adapter. Optimistically marks the
   * card; an adapter rejection re-opens it with the error message. The server's
   * `tool_approval_resolved` event remains authoritative.
   */
  resolveToolApproval: (
    approval: ToolApproval,
    decision: "approved" | "denied",
    reason?: string,
  ) => Promise<void>;
}

const ChatStateContext = createContext<UseChatReturn | null>(null);

function useProvideChat(
  onArtifactsReady?: (artifacts: Artifact[]) => void,
  onClearArtifacts?: () => void,
): UseChatReturn {
  const {
    adapter,
    organizationId,
    currentSession,
    setCurrentSession,
    activeContextId,
    setActiveContext,
    persistentContextVariables,
    onSlashCommand,
    contextReferences,
  } = useChatContext();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Mirror of `messages` kept current every render so callbacks can read the
  // latest list without depending on it (and without extracting state from
  // inside a setMessages updater, which only runs synchronously via React's
  // eager-bailout and is skipped when an update is already pending).
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const [streamingState, setStreamingState] = useState<StreamingState>({
    isStreaming: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSessionLoading, setIsSessionLoading] = useState(false);
  // Resume affordance for the composer: which control (if any) to offer for the last
  // crashed run, and the execution id a "resumable" run continues from. Seeded by
  // loadSession from the backend hint; cleared the moment any new run starts.
  const [resumeState, setResumeState] = useState<ResumeState>(null);
  const resumableExecutionIdRef = useRef<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  // Backend execution id of the in-flight run, captured from the stream's
  // `started` event — required to cancel the run server-side on Stop.
  const activeExecutionIdRef = useRef<string | null>(null);
  const lastUserMessageRef = useRef<string>("");
  const onArtifactsReadyRef = useRef(onArtifactsReady);
  onArtifactsReadyRef.current = onArtifactsReady;
  const onClearArtifactsRef = useRef(onClearArtifacts);
  onClearArtifactsRef.current = onClearArtifacts;
  const accumContentRef = useRef("");
  const accumProcessedContentRef = useRef("");
  const streamingSourceStripperRef = useRef<StreamingSourceStripper | null>(null);
  // Per-stream counter giving repeatable runner control events (tool calls, handoffs)
  // unique step ids. Reset at the start of each sendMessage.
  const stepSeqRef = useRef(0);
  const activeContextIdRef = useRef(activeContextId);
  activeContextIdRef.current = activeContextId;
  const persistentContextVariablesRef = useRef(persistentContextVariables);
  persistentContextVariablesRef.current = persistentContextVariables;
  const onSlashCommandRef = useRef(onSlashCommand);
  onSlashCommandRef.current = onSlashCommand;
  const contextReferencesRef = useRef(contextReferences);
  contextReferencesRef.current = contextReferences;

  const clearMessages = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    activeExecutionIdRef.current = null;
    streamingSourceStripperRef.current = null;
    accumProcessedContentRef.current = "";
    setMessages([]);
    setStreamingState({ isStreaming: false });
    setIsLoading(false);
    setCurrentSession(undefined);
    setActiveContext(undefined);
    onClearArtifactsRef.current?.();
  }, [setCurrentSession, setActiveContext]);

  const consumeStream = useCallback(
    async (
      reader: ReadableStreamDefaultReader<Uint8Array>,
      assistantMessageId: string,
      signal: AbortSignal,
    ) => {
      // A run can outlive a single HTTP connection: a proxy idle-timeout during a long
      // approval wait drops the socket, but the run detaches server-side and keeps
      // persisting (see anter-adapter / agent-runner Phase 1). If a stream ends WITHOUT
      // a terminal (completion / [DONE] / error) frame, we reconnect to the replay
      // endpoint and rebuild this bubble from the persisted tail. Bounded so a genuinely
      // stuck run can't loop forever.
      const MAX_RECONNECTS = 5;
      let currentReader = reader;
      let reconnectAttempt = 0;

      accumContentRef.current = "";
      accumProcessedContentRef.current = "";
      streamingSourceStripperRef.current = new StreamingSourceStripper();

      const settleStopped = (stopped = false): void => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId && msg.isStreaming
              ? {
                  ...msg,
                  isStreaming: false,
                  ...(stopped ? { stoppedByUser: true } : {}),
                  elapsedMs: msg.startedAt ? Date.now() - msg.startedAt : msg.elapsedMs,
                }
              : msg,
          ),
        );
        setStreamingState({ isStreaming: false });
        setIsLoading(false);
      };

      // The connection dropped and we couldn't reattach (no execution id / no replay
      // adapter, the reattach failed, or reconnect attempts were exhausted). Settle the
      // bubble with an error so the message's inline Retry control surfaces — the user
      // can re-run the turn rather than being stuck staring at a frozen "Thinking…".
      const settleDropped = (): void => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId && msg.isStreaming
              ? {
                  ...msg,
                  isStreaming: false,
                  error:
                    msg.error ??
                    "The connection was lost before the response finished. Retry to continue.",
                  elapsedMs: msg.startedAt ? Date.now() - msg.startedAt : msg.elapsedMs,
                }
              : msg,
          ),
        );
        setStreamingState({ isStreaming: false });
        setIsLoading(false);
      };

      // Each iteration consumes one connection; on a non-terminal end we reattach below.
      for (;;) {
        const decoder = new TextDecoder();
        // Set by any terminal frame so the loop knows the run actually ended (vs. a
        // dropped connection) and must not reconnect.
        let sawTerminal = false;
        // Terminal *and* a stop: settles with the "stopped" marker rather than silently,
        // so a cancel from another channel doesn't look like a completed answer.
        let sawCancellation = false;
        const parser = createParser({
          onEvent(event: EventSourceMessage) {
            if (event.data === "[DONE]") {
              sawTerminal = true;
              let finalSources: MessageSource[] | undefined;
              if (streamingSourceStripperRef.current) {
                const flushed = streamingSourceStripperRef.current.flush();
                accumProcessedContentRef.current += flushed;
                const collected = streamingSourceStripperRef.current.getCollectedSources();
                if (collected.length > 0) {
                  finalSources = collected;
                }
              }
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId
                    ? {
                        ...msg,
                        isStreaming: false,
                        content: stripSources(accumProcessedContentRef.current || msg.content),
                        sources: finalSources ?? msg.sources,
                        steps: msg.steps?.map((s) => (s.status === "in_progress" ? { ...s, status: "done" } : s)),
                        elapsedMs: msg.startedAt ? Date.now() - msg.startedAt : msg.elapsedMs,
                      }
                    : msg,
                ),
              );
              setStreamingState({ isStreaming: false });
              setIsLoading(false);
              return;
            }

            let parsed: ParsedEvent;
            try {
              parsed = JSON.parse(event.data) as ParsedEvent;
            } catch {
              return;
            }

            const outerEventType = resolveEventType(event.event, parsed);

            // The runner's `started` frame carries the backend execution id —
            // captured so Stop can cancel the run server-side.
            if (outerEventType === "started") {
              const startedExecutionId = (parsed as Record<string, unknown>)["executionId"];
              if (typeof startedExecutionId === "string" && startedExecutionId) {
                activeExecutionIdRef.current = startedExecutionId;
                setStreamingState((prev) =>
                  prev.isStreaming ? { ...prev, executionId: startedExecutionId } : prev,
                );
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, executionId: startedExecutionId }
                      : msg,
                  ),
                );
              }
            }

            // The agent-runner emits control events (thought/tool_call/tool_result/status and the
            // multi-agent handoff frames) that must surface as step chips, never as message text.
            const isRunnerControl = isRunnerControlEvent(outerEventType);
            const isCompletionSignal =
              outerEventType === "done" ||
              parsed.isComplete === true ||
              parsed.type === "complete" ||
              isRunnerCompletion(outerEventType, parsed);
            const isCancellationSignal = isRunnerCancellation(outerEventType, parsed);

            let runnerStep: AgentStepEvent | null = null;
            if (isRunnerControl) {
              runnerStep = runnerEventToStep(outerEventType, parsed, stepSeqRef.current);
              if (runnerStep && runnerStepConsumesSeq(outerEventType)) {
                stepSeqRef.current += 1;
              }
            }

            if (outerEventType === "artifact" && parsed.payload) {
              onArtifactsReadyRef.current?.([parsed.payload as unknown as Artifact]);
            }

            // context_resolved: the server resolved a required context value.
            // Accept both "contextId" (new) and "frameworkId" (legacy backend compat).
            if (outerEventType === "context_resolved" && parsed.payload) {
              const { key, value } = parsed.payload as {
                key?: string;
                value?: string;
              };
              if ((key === "contextId" || key === "frameworkId") && typeof value === "string") {
                setActiveContext(value);
              }
            }

            const rawParsedContent = extractContent(parsed);
            if (rawParsedContent && outerEventType !== "artifact" && !isRunnerControl) {
              accumContentRef.current += rawParsedContent;
              const strippedChunk = streamingSourceStripperRef.current
                ? streamingSourceStripperRef.current.process(rawParsedContent)
                : rawParsedContent;
              accumProcessedContentRef.current += strippedChunk;
            }

            let frontendArtifacts: Artifact[] = [];
            const originalAccumContent = accumContentRef.current;
            let cleanedAccumContent = originalAccumContent;
            let frontendCitations: MessageSource[] = [];
            let frontendRecords: RecordTag[] = [];
            let frontendSuggestions: string[] = [];
            if (isCompletionSignal) {
              const extracted = extractArtifactsFromContent(
                originalAccumContent,
                assistantMessageId,
              );
              if (extracted.artifacts.length > 0) {
                frontendArtifacts = extracted.artifacts;
                cleanedAccumContent = extracted.cleanedContent;
                onArtifactsReadyRef.current?.(frontendArtifacts);
              }

              const doneSources: MessageSource[] = Array.isArray(parsed.sources)
                ? (parsed.sources as MessageSource[])
                : Array.isArray(parsed.payload?.sources)
                  ? (parsed.payload.sources as MessageSource[])
                  : [];
              const citationResult = extractCitationsFromContent(cleanedAccumContent, doneSources);
              cleanedAccumContent = citationResult.cleanedContent;
              frontendCitations = citationResult.citations;

              const recordResult = extractRecordTagsFromContent(cleanedAccumContent);
              cleanedAccumContent = recordResult.cleanedContent;
              frontendRecords = recordResult.records;

              const suggestionsResult = extractSuggestionsFromContent(cleanedAccumContent);
              cleanedAccumContent = suggestionsResult.cleanedContent;
              frontendSuggestions = suggestionsResult.suggestions;

              if (streamingSourceStripperRef.current) {
                const flushed = streamingSourceStripperRef.current.flush();
                accumProcessedContentRef.current += flushed;
                const collectedSources = streamingSourceStripperRef.current.getCollectedSources();
                if (collectedSources.length > 0) {
                  frontendCitations = [...frontendCitations, ...collectedSources];
                }
              }
              cleanedAccumContent = stripSources(cleanedAccumContent);
            } else {
              cleanedAccumContent = accumProcessedContentRef.current || accumContentRef.current;
              if (cleanedAccumContent.includes("<record")) {
                const { cleanedContent } = extractRecordTagsFromContent(cleanedAccumContent);
                cleanedAccumContent = cleanedContent;
              }
            }

            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id !== assistantMessageId) return msg;

                const eventType = resolveEventType(event.event, parsed);
                const parsedError = extractError(parsed);
                const parsedContent = extractContent(parsed);
                const payload = parsed.payload;
                const payloadSources = Array.isArray(payload?.sources)
                  ? (payload.sources as MessageSource[])
                  : undefined;
                const payloadArtifactIds = Array.isArray(payload?.artifactIds)
                  ? (payload.artifactIds as string[])
                  : undefined;
                const isComplete = isCompletionSignal;

                if (eventType === "artifact" && payload) {
                  const artifact = payload as unknown as Artifact;
                  return {
                    ...msg,
                    artifactIds: [...(msg.artifactIds ?? []), artifact.artifactId],
                  };
                }

                if (eventType === "step") {
                  const rawStep =
                    parsed.step ||
                    (parsed.payload?.step as Partial<AgentStepEvent> | undefined) ||
                    (parsed.payload && typeof parsed.payload === "object" && ("label" in parsed.payload || "step_id" in parsed.payload)
                      ? (parsed.payload as unknown as Partial<AgentStepEvent>)
                      : undefined) ||
                    (parsed.label ? (parsed as unknown as Partial<AgentStepEvent>) : undefined);

                  if (rawStep && (rawStep.label || rawStep.step_id)) {
                    const stepId =
                      rawStep.step_id ||
                      (rawStep.label
                        ? `step_${rawStep.label.toLowerCase().replace(/[^a-z0-9_]/g, "_")}`
                        : `step_${stepSeqRef.current}`);
                    const normalizedStep: AgentStepEvent = {
                      type: rawStep.type ?? "reasoning",
                      label: rawStep.label ?? "Step",
                      status: rawStep.status ?? "in_progress",
                      step_id: stepId,
                      ...(rawStep.duration_ms !== undefined ? { duration_ms: rawStep.duration_ms } : {}),
                      ...(rawStep.detail !== undefined ? { detail: rawStep.detail } : {}),
                    };

                    const existing = msg.steps ?? [];
                    const idx = existing.findIndex((s) => s.step_id === normalizedStep.step_id);
                    const updatedExisting =
                      normalizedStep.status === "in_progress" && idx < 0
                        ? existing.map((s) =>
                            s.status === "in_progress" && (s.type === "reasoning" || s.type === "tool_call")
                              ? { ...s, status: "done" as const }
                              : s,
                          )
                        : existing;
                    const nextSteps =
                      idx >= 0
                        ? updatedExisting.map((s, i) => (i === idx ? { ...s, ...normalizedStep } : s))
                        : [...updatedExisting, normalizedStep];
                    return { ...msg, steps: nextSteps };
                  }
                }

                // Runner control event mapped to a step chip (thought → reasoning,
                // tool_call/tool_result → tool steps, handoff → skill boundary). Returning
                // here also prevents thought reasoning text from leaking into the bubble.
                if (runnerStep) {
                  const step = runnerStep;
                  const existing = msg.steps ?? [];
                  const idx = existing.findIndex((s) => s.step_id === step.step_id);
                  const updatedExisting =
                    step.status === "in_progress" && idx < 0
                      ? existing.map((s) =>
                          s.status === "in_progress" && (s.type === "reasoning" || s.type === "tool_call")
                            ? { ...s, status: "done" as const }
                            : s,
                        )
                      : existing;
                  const nextSteps =
                    idx >= 0
                      ? updatedExisting.map((s, i) => (i === idx ? { ...s, ...step } : s))
                      : [...updatedExisting, step];
                  return { ...msg, steps: nextSteps };
                }

                if (eventType === "plan" && parsed.plan) {
                  return { ...msg, plan: parsed.plan.phases };
                }

                if (eventType === "context_required" && parsed.contextKey && parsed.choices) {
                  return {
                    ...msg,
                    contextRequired: {
                      contextKey: parsed.contextKey,
                      questionIntro: parsed.questionIntro ?? "",
                      choices: parsed.choices,
                    },
                  };
                }

                // HITL tool approvals: a request appends a pending card on the
                // streaming message (the run is paused server-side); the resolved
                // event — whether triggered by this client or another channel —
                // flips the card's status and carries any deny reason.
                if (eventType === "tool_approval_request") {
                  const approval = toolApprovalFromRequestEvent(parsed);
                  if (!approval) return msg;
                  const existing = msg.toolApprovals ?? [];
                  const idx = existing.findIndex((a) => a.approvalId === approval.approvalId);
                  const nextApprovals =
                    idx >= 0
                      ? existing.map((a, i) => (i === idx ? { ...a, ...approval } : a))
                      : [...existing, approval];
                  return { ...msg, toolApprovals: nextApprovals };
                }

                if (eventType === "tool_approval_resolved") {
                  const resolution = toolApprovalResolutionFromEvent(parsed);
                  if (!resolution || !msg.toolApprovals?.length) return msg;
                  return {
                    ...msg,
                    toolApprovals: msg.toolApprovals.map((a) =>
                      a.approvalId === resolution.approvalId
                        ? {
                            ...a,
                            status: resolution.status,
                            reason: resolution.reason ?? a.reason ?? null,
                            error: undefined,
                          }
                        : a,
                    ),
                  };
                }

                if (isComplete) {
                  const backendArtifactIds =
                    parsed.artifactIds ?? payloadArtifactIds ?? msg.artifactIds;
                  const allArtifactIds = [
                    ...(backendArtifactIds ?? []),
                    ...frontendArtifacts.map((a) => a.artifactId),
                  ];
                  const contentWasModified = cleanedAccumContent !== originalAccumContent;
                  const hasClientSideChanges =
                    frontendArtifacts.length > 0 ||
                    frontendCitations.length > 0 ||
                    frontendRecords.length > 0 ||
                    contentWasModified;
                  const doneSuggestions: string[] = Array.isArray(parsed.suggestions)
                    ? (parsed.suggestions as unknown[]).filter(
                        (s): s is string => typeof s === "string",
                      )
                    : [];
                  const finalSuggestions =
                    doneSuggestions.length > 0 ? doneSuggestions : frontendSuggestions;
                  const finalizedSteps = msg.steps?.map((s) =>
                    s.status === "in_progress" ? { ...s, status: "done" as const } : s,
                  );
                  return {
                    ...msg,
                    content: hasClientSideChanges ? cleanedAccumContent : msg.content,
                    isStreaming: false,
                    artifactIds: allArtifactIds.length > 0 ? allArtifactIds : msg.artifactIds,
                    sources:
                      frontendCitations.length > 0
                        ? frontendCitations
                        : (parsed.sources ?? payloadSources ?? msg.sources),
                    records: frontendRecords.length > 0 ? frontendRecords : msg.records,
                    suggestions: finalSuggestions.length > 0 ? finalSuggestions : msg.suggestions,
                    steps: finalizedSteps ?? msg.steps,
                    elapsedMs: msg.startedAt ? Date.now() - msg.startedAt : msg.elapsedMs,
                  };
                }

                if (eventType === "error" || parsedError) {
                  return {
                    ...msg,
                    isStreaming: false,
                    error: parsedError ?? "Unexpected stream error",
                    elapsedMs: msg.startedAt ? Date.now() - msg.startedAt : msg.elapsedMs,
                  };
                }

                const nextContent = cleanedAccumContent || (parsedContent ? `${msg.content}${parsedContent}` : msg.content);

                return {
                  ...msg,
                  content: nextContent,
                  sources: parsed.sources ?? payloadSources ?? msg.sources,
                  isStreaming: !isComplete,
                  elapsedMs:
                    isComplete && msg.startedAt ? Date.now() - msg.startedAt : msg.elapsedMs,
                };
              }),
            );

            const eventType = resolveEventType(event.event, parsed);
            if (isCompletionSignal || isCancellationSignal || eventType === "error") {
              sawTerminal = true;
              sawCancellation = sawCancellation || isCancellationSignal;
              setStreamingState({ isStreaming: false });
              setIsLoading(false);
            }
          },
          onError() {
            setStreamingState({
              isStreaming: false,
              error: "Failed to parse stream event",
            });
            setIsLoading(false);
          },
        });

        try {
          while (true) {
            if (signal.aborted) break;
            const { done, value } = await currentReader.read();
            if (done) break;
            parser.feed(decoder.decode(value, { stream: true }));
          }
        } catch (error) {
          // A rejected read() is the browser surfacing a killed connection (a proxy
          // or load balancer dropping a long-lived stream) as a TypeError — e.g.
          // "network error" — rather than a clean stream end. A user abort can also
          // surface here as an AbortError instead of a clean end. Everything else
          // falls through to the same reconnect path a clean non-terminal end takes:
          // the run detaches server-side and keeps going, so bubbling the error up
          // would show a dead-end failure for a run that is still progressing.
          if (signal.aborted || (error instanceof Error && error.name === "AbortError")) {
            settleStopped();
            return;
          }
        }

        const tail = decoder.decode();
        if (tail) {
          parser.feed(tail);
        }

        try {
          currentReader.releaseLock();
        } catch {
          // The lock may already be gone when the stream errored out from under us.
        }

        // Clean end (completion / [DONE] / error / cancel) or a local abort: settle and stop.
        if (sawTerminal || signal.aborted) {
          settleStopped(sawCancellation);
          return;
        }

        // The stream ended with no terminal frame — the connection dropped mid-run. Try
        // to reattach to the (detached, still-persisting) run via the replay endpoint.
        const executionId = activeExecutionIdRef.current;
        const reconnect = adapter.getExecutionStream?.bind(adapter);
        if (!executionId || !reconnect || reconnectAttempt >= MAX_RECONNECTS) {
          settleDropped();
          return;
        }

        reconnectAttempt += 1;
        let replayStream: ReadableStream<Uint8Array>;
        try {
          replayStream = await reconnect(executionId, 0, { signal });
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") return;
          settleDropped();
          return;
        }

        // Replay re-sends the whole turn from chunk 0, so reset this bubble's
        // accumulators and everything the replay rebuilds (content, steps, artifact
        // ids) to avoid duplicated/misplaced chips. Tool-approval cards are preserved
        // (deduped by approvalId on replay) so a still-pending approval survives.
        accumContentRef.current = "";
      accumProcessedContentRef.current = "";
      streamingSourceStripperRef.current = new StreamingSourceStripper();
        stepSeqRef.current = 0;
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: "", steps: [], artifactIds: [], isStreaming: true }
              : msg,
          ),
        );
        currentReader = replayStream.getReader();
      }
    },
    [setMessages, setStreamingState, setIsLoading, setActiveContext, adapter],
  );

  const sendMessage = useCallback(
    async (
      message: string,
      attachedFileIds?: string[],
      overrideSessionId?: string,
      extraContextVariables?: Record<string, string>,
    ) => {
      const trimmed = message.trim();
      if (!trimmed) return;

      const slashMatch = trimmed.match(/^(\/\w+)\s*([\s\S]*)$/);
      const commandName = slashMatch?.[1];
      const commandArgs = (slashMatch?.[2] ?? "").trim();
      const matchedCommand = commandName
        ? getSlashCommandRegistry().find((c) => c.name === commandName)
        : undefined;

      // Client-side slash command handling. A host-provided interceptor runs first
      // and, by returning true, can fully handle a command (e.g. UI/local-storage
      // only commands) so it never reaches the backend. The built-in `/help` command
      // is the SDK's default handler when the host does not claim the command.
      //
      // This MUST run before session creation: a fully-handled local command must not
      // create a backend session or fire onSessionChange. A command whose handler
      // itself navigates/remounts the chat (e.g. the host's `/meta` mode switch) would
      // otherwise race the spurious session-change navigation and lose on the first try
      // — the well-known "`/meta` only works the second time" bug.
      if (commandName) {
        const appendedMessages: string[] = [];
        const slashCtx = {
          appendAssistantMessage: (markdown: string) => {
            appendedMessages.push(markdown);
          },
        };

        let handled = false;

        if (onSlashCommandRef.current) {
          handled = (await onSlashCommandRef.current(commandName, commandArgs, slashCtx)) === true;
        }

        if (!handled && matchedCommand?.slashCommandId === "help") {
          const commands = getSlashCommandRegistry();
          const helpContent = `### Available Commands\n\n| Command | Description | Example |\n| :--- | :--- | :--- |\n${commands
            .map((c) => `| **${c.name}** | ${c.description} | \`${c.exampleUsage || ""}\` |`)
            .join("\n")}\n\nType \`/\` in the chat box to see the command menu.`;
          appendedMessages.push(helpContent);
          handled = true;
        }

        if (handled) {
          const commandMessage: ChatMessage = {
            id: generateMessageId(),
            content: trimmed,
            role: "command",
            timestamp: new Date(),
          };

          const assistantMessages: ChatMessage[] = appendedMessages.map((content) => ({
            ...createAssistantMessage(),
            content,
            isStreaming: false,
          }));

          setMessages((prev) => [...prev, commandMessage, ...assistantMessages]);
          return;
        }
      }

      // Not a locally-handled command — forward to the backend, resolving/creating the
      // session now (only past this point do we touch session state or the controller).
      let sessionId = overrideSessionId ?? currentSession?.sessionId;
      if (!sessionId) {
        sessionId = await adapter.createSession({
          organizationId,
          contextId: activeContextIdRef.current,
        });
      }
      if (!currentSession?.sessionId) {
        setCurrentSession({
          sessionId,
          title: "New conversation",
          updatedAt: new Date().toISOString(),
          status: "active",
          contextId: activeContextIdRef.current,
        });
      }

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      activeExecutionIdRef.current = null;

      const userMessage = createUserMessage(trimmed);
      const assistantMessage = createAssistantMessage();
      accumContentRef.current = "";
      stepSeqRef.current = 0;
      // Remember the turn so retryLastMessage() can re-send it, and supersede any pending
      // resume affordance — a new run replaces whatever the crashed one would have offered.
      lastUserMessageRef.current = trimmed;
      resumableExecutionIdRef.current = null;
      setResumeState(null);

      const messagesToInsert: ChatMessage[] = matchedCommand
        ? [
            {
              id: generateMessageId(),
              content: matchedCommand.name,
              role: "command",
              timestamp: new Date(),
            },
            assistantMessage,
          ]
        : [userMessage, assistantMessage];

      setMessages((prev) => [...prev, ...messagesToInsert]);
      setStreamingState({
        isStreaming: true,
        currentMessageId: assistantMessage.id,
      });
      setIsLoading(true);

      try {
        const finalMessage =
          matchedCommand && trimmed === matchedCommand.name
            ? `Execute ${matchedCommand.name}`
            : trimmed;

        const stream = await adapter.sendMessage(
          {
            organizationId,
            sessionId,
            message: finalMessage,
            ...(attachedFileIds?.length ? { attachedFileIds } : {}),
            contextVariables: {
              ...persistentContextVariablesRef.current,
              ...(activeContextIdRef.current ? { contextId: activeContextIdRef.current } : {}),
              ...(matchedCommand ? { slashCommand: matchedCommand.slashCommandId } : {}),
              ...(contextReferencesRef.current.length > 0
                ? { pageContext: JSON.stringify(contextReferencesRef.current) }
                : {}),
              ...extraContextVariables,
            },
          },
          { signal: controller.signal },
        );

        const reader = stream.getReader();
        await consumeStream(reader, assistantMessage.id, controller.signal);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          setStreamingState({ isStreaming: false });
          setIsLoading(false);
          return;
        }

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessage.id
              ? {
                  ...msg,
                  isStreaming: false,
                  error: error instanceof Error ? error.message : "Unexpected error",
                }
              : msg,
          ),
        );

        setStreamingState({
          isStreaming: false,
          error: error instanceof Error ? error.message : "Unexpected error",
        });
        setIsLoading(false);
      } finally {
        abortControllerRef.current = null;
        activeExecutionIdRef.current = null;
      }
    },
    [adapter, currentSession?.sessionId, organizationId, setCurrentSession, consumeStream],
  );

  const retryLastMessage = useCallback(async () => {
    if (!lastUserMessageRef.current) return;

    // Remove both the errored assistant message AND the preceding user message
    // so sendMessage can re-create them fresh without duplication.
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant" && last.error) {
        const withoutAssistant = prev.slice(0, -1);
        const secondToLast = withoutAssistant[withoutAssistant.length - 1];
        if (secondToLast?.role === "user") {
          return withoutAssistant.slice(0, -1);
        }
        return withoutAssistant;
      }
      return prev;
    });

    await sendMessage(lastUserMessageRef.current);
  }, [sendMessage]);

  const retryMessage = useCallback(
    async (messageId: string) => {
      // Read the target content from the current list up front — never from a
      // setMessages updater's side effect, which would leave it undefined (and
      // still truncate the list) whenever the updater is deferred.
      const current = messagesRef.current;
      const target = current.find((m) => m.id === messageId && m.role === "user");
      const targetContent = target?.content;
      if (!targetContent) return;

      // Remove the target user message and everything after it (located in the
      // freshest list at flush time), then re-send the same content so it
      // doesn't duplicate.
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === messageId);
        return idx < 0 ? prev : prev.slice(0, idx);
      });

      lastUserMessageRef.current = targetContent;
      await sendMessage(targetContent);
    },
    [sendMessage],
  );

  /**
   * The composer Resume/Retry action. When the last run is checkpoint-resumable
   * (`resumeState === "resumable"`, an execution id + an adapter that can resume), it
   * continues that run from the server-side checkpoint and streams the remainder.
   * Otherwise — or if the backend turns out not to be able to resume after all (e.g. a
   * 409 telling us to retry) — it falls back to re-sending the last user message.
   */
  const resumeRun = useCallback(async () => {
    const executionId = resumableExecutionIdRef.current;
    const resume = adapter.resumeExecution?.bind(adapter);
    if (!executionId || !resume) {
      await retryLastMessage();
      return;
    }

    // Clear the affordance and drop a trailing errored assistant bubble (mirrors retry).
    setResumeState(null);
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      return last?.role === "assistant" && last.error ? prev.slice(0, -1) : prev;
    });

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    activeExecutionIdRef.current = executionId;

    const assistantMessage = createAssistantMessage();
    setMessages((prev) => [...prev, assistantMessage]);
    setStreamingState({ isStreaming: true, currentMessageId: assistantMessage.id, executionId });
    setIsLoading(true);

    let stream: ReadableStream<Uint8Array>;
    try {
      stream = await resume(executionId, { signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      // Not resumable after all (or the open failed): drop the placeholder and retry the
      // last turn from scratch so the user still gets an answer.
      resumableExecutionIdRef.current = null;
      setMessages((prev) => prev.filter((msg) => msg.id !== assistantMessage.id));
      setStreamingState({ isStreaming: false });
      setIsLoading(false);
      await retryLastMessage();
      return;
    }

    try {
      await consumeStream(stream.getReader(), assistantMessage.id, controller.signal);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessage.id
            ? {
                ...msg,
                isStreaming: false,
                error: error instanceof Error ? error.message : "Unexpected error",
              }
            : msg,
        ),
      );
      setStreamingState({ isStreaming: false });
      setIsLoading(false);
    }
  }, [adapter, consumeStream, retryLastMessage]);

  /**
   * Stop the in-flight response (the composer Stop button). Cancels the run
   * server-side via the adapter (best-effort, fire-and-forget — the runner also
   * cancels on disconnect), aborts the local stream immediately, and marks the
   * streaming message as stopped by the user.
   */
  const stopStreaming = useCallback(() => {
    if (!abortControllerRef.current) return;

    const executionId = activeExecutionIdRef.current;
    const sessionId = currentSession?.sessionId;
    if (adapter.cancelRun && executionId && sessionId) {
      void adapter.cancelRun({ sessionId, executionId }).catch(() => {
        // Best-effort: the stream abort below disconnects the run, and the
        // backend records the execution as canceled on disconnect.
      });
    }

    abortControllerRef.current.abort();
    abortControllerRef.current = null;
    activeExecutionIdRef.current = null;

    setMessages((prev) =>
      prev.map((msg) =>
        msg.isStreaming
          ? {
              ...msg,
              isStreaming: false,
              stoppedByUser: true,
              elapsedMs: msg.startedAt ? Date.now() - msg.startedAt : msg.elapsedMs,
            }
          : msg,
      ),
    );
    setStreamingState({ isStreaming: false });
    setIsLoading(false);
  }, [adapter, currentSession?.sessionId]);

  const loadSession = useCallback(
    (session: SessionWithMessages) => {
      abortControllerRef.current?.abort();
      onClearArtifactsRef.current?.();
      setCurrentSession({
        sessionId: session.sessionId,
        title: session.title,
        updatedAt: session.updatedAt,
        status: session.status,
        contextId: session.contextId,
        model: session.model,
      });
      setActiveContext(session.contextId);

      const allExtractedArtifacts: Artifact[] = [];
      const cleanedMessages = session.messages.map((msg) => {
        if (msg.role !== "assistant" || !msg.content) {
          return { ...msg, timestamp: new Date(msg.timestamp) };
        }

        const { cleanedContent: afterArtifacts, artifacts } = extractArtifactsFromContent(
          msg.content,
          msg.id,
        );
        if (artifacts.length > 0) allExtractedArtifacts.push(...artifacts);

        const { cleanedContent: afterCitations, citations } = extractCitationsFromContent(
          afterArtifacts,
          msg.sources ?? [],
        );

        const { cleanedContent: afterRecords, records } =
          extractRecordTagsFromContent(afterCitations);

        const { cleanedContent } = extractSuggestionsFromContent(afterRecords);

        return {
          ...msg,
          content: cleanedContent,
          timestamp: new Date(msg.timestamp),
          sources: citations.length > 0 ? citations : msg.sources,
          records: records.length > 0 ? records : msg.records,
          ...(artifacts.length > 0
            ? {
                artifactIds: [...(msg.artifactIds ?? []), ...artifacts.map((a) => a.artifactId)],
              }
            : {}),
        };
      });

      // Seed the retry source and resume affordance from the loaded session so the
      // composer's Retry/Resume control works after a fresh page load (before any
      // in-session send has populated these). `resumeState: "live"` means a run is in
      // flight and the reconnect path below takes over — no manual control is offered.
      const lastUserMsg = [...session.messages]
        .reverse()
        .find((m) => m.role === "user" && typeof m.content === "string" && m.content.length > 0);
      lastUserMessageRef.current = lastUserMsg?.content ?? "";
      resumableExecutionIdRef.current = session.resumableExecutionId ?? null;
      setResumeState(session.resumeState ?? null);

      if (session.activeExecutionId && typeof adapter.getExecutionStream === "function") {
        const controller = new AbortController();
        abortControllerRef.current = controller;
        activeExecutionIdRef.current = session.activeExecutionId;

        const assistantMessage = createAssistantMessage();

        setMessages([...cleanedMessages, assistantMessage]);
        setStreamingState({
          isStreaming: true,
          currentMessageId: assistantMessage.id,
          executionId: session.activeExecutionId,
        });
        setIsLoading(true);

        void adapter
          .getExecutionStream(session.activeExecutionId, 0, { signal: controller.signal })
          .then((stream) => {
            return consumeStream(stream.getReader(), assistantMessage.id, controller.signal);
          })
          .catch((error) => {
            if (error instanceof Error && error.name === "AbortError") {
              return;
            }
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessage.id
                  ? {
                      ...msg,
                      isStreaming: false,
                      error: error instanceof Error ? error.message : "Unexpected error",
                    }
                  : msg,
              ),
            );
            setStreamingState({ isStreaming: false });
            setIsLoading(false);
          });
      } else {
        setMessages(cleanedMessages);
        setStreamingState({ isStreaming: false });
        setIsLoading(false);
      }

      if (allExtractedArtifacts.length > 0) {
        onArtifactsReadyRef.current?.(allExtractedArtifacts);
      }
      if (session.artifacts?.length) {
        onArtifactsReadyRef.current?.(session.artifacts);
      }
    },
    [setCurrentSession, setActiveContext, adapter, consumeStream],
  );

  const switchSession = useCallback(
    async (sessionId: string) => {
      setIsSessionLoading(true);
      try {
        const full = await adapter.loadSession(sessionId);
        loadSession(full);
        return full;
      } finally {
        setIsSessionLoading(false);
      }
    },
    [adapter, loadSession],
  );

  const canResolveToolApprovals = typeof adapter.resolveToolApproval === "function";

  const patchToolApproval = useCallback(
    (approvalId: string, patch: (approval: ToolApproval) => ToolApproval) => {
      setMessages((prev) =>
        prev.map((msg) => {
          if (!msg.toolApprovals?.some((a) => a.approvalId === approvalId)) return msg;
          return {
            ...msg,
            toolApprovals: msg.toolApprovals.map((a) =>
              a.approvalId === approvalId ? patch(a) : a,
            ),
          };
        }),
      );
    },
    [],
  );

  const resolveToolApproval = useCallback(
    async (approval: ToolApproval, decision: "approved" | "denied", reason?: string) => {
      const resolve = adapter.resolveToolApproval?.bind(adapter);
      if (!resolve) return;

      // Optimistic: the server's tool_approval_resolved event is authoritative
      // and will land on top of this with the persisted decision/reason.
      patchToolApproval(approval.approvalId, (a) => ({
        ...a,
        status: decision,
        reason: reason ?? a.reason ?? null,
        error: undefined,
      }));

      try {
        await resolve({
          sessionId: currentSession?.sessionId ?? "",
          approval,
          decision,
          ...(reason ? { reason } : {}),
        });
      } catch (error) {
        // Re-open the card so the user can retry (or resolve via another channel).
        patchToolApproval(approval.approvalId, (a) => ({
          ...a,
          status: "pending",
          error: error instanceof Error ? error.message : "Failed to resolve the approval",
        }));
      }
    },
    [adapter, currentSession?.sessionId, patchToolApproval],
  );

  return useMemo(
    () => ({
      messages,
      streamingState,
      isStreaming: streamingState.isStreaming,
      isLoading,
      error: streamingState.error,
      currentSessionId: currentSession?.sessionId,
      currentSessionTitle: currentSession?.title,
      adapter,
      sendMessage,
      stopStreaming,
      clearMessages,
      retryLastMessage,
      retryMessage,
      resumeState,
      resumeRun,
      loadSession,
      isSessionLoading,
      switchSession,
      canResolveToolApprovals,
      resolveToolApproval,
    }),
    [
      messages,
      streamingState,
      isLoading,
      currentSession?.sessionId,
      currentSession?.title,
      adapter,
      sendMessage,
      stopStreaming,
      clearMessages,
      retryLastMessage,
      retryMessage,
      resumeState,
      resumeRun,
      loadSession,
      isSessionLoading,
      switchSession,
      canResolveToolApprovals,
      resolveToolApproval,
    ],
  );
}

export function ChatStateProvider({
  children,
  onArtifactsReady,
  onClearArtifacts,
}: {
  children: ReactNode;
  onArtifactsReady?: (artifacts: Artifact[]) => void;
  onClearArtifacts?: () => void;
}) {
  const chatState = useProvideChat(onArtifactsReady, onClearArtifacts);
  return createElement(ChatStateContext.Provider, { value: chatState }, children);
}

export function useChat(): UseChatReturn {
  const context = useContext(ChatStateContext);
  return context ?? useProvideChat();
}
