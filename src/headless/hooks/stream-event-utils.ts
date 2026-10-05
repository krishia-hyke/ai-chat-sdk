import type { AgentStepEvent, ToolApproval, ToolApprovalStatus } from "../types/chat";

export interface StreamEventShape {
  content?: string;
  error?: string;
  message?: string;
  event?: string;
  type?: string;
  label?: string;
  detail?: string;
  status?: string;
  phase?: string;
  step_id?: string;
  id?: string;
  duration_ms?: number;
  tokens_used?: number;
  step?: Partial<AgentStepEvent>;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

export function resolveEventType(
  transportEvent: string | undefined,
  parsed: StreamEventShape,
): string {
  if (!transportEvent || transportEvent === "message") {
    if (typeof parsed.event === "string" && parsed.event.trim()) {
      return parsed.event;
    }
    if (typeof parsed.type === "string" && parsed.type.trim()) {
      return parsed.type;
    }
    const payloadEvent = parsed.payload?.event;
    if (typeof payloadEvent === "string" && payloadEvent.trim()) {
      return payloadEvent;
    }
    const payloadType = parsed.payload?.type;
    if (typeof payloadType === "string" && payloadType.trim()) {
      return payloadType;
    }
    return "message";
  }

  return transportEvent;
}

export function extractContent(parsed: StreamEventShape): string {
  if (typeof parsed.content === "string") {
    return parsed.content;
  }

  const payload = parsed.payload;
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const payloadText = payload.text;
  if (typeof payloadText === "string") {
    return payloadText;
  }

  const payloadContent = payload.content;
  if (typeof payloadContent === "string") {
    return payloadContent;
  }

  return "";
}

export function extractError(parsed: StreamEventShape): string | undefined {
  if (typeof parsed.error === "string" && parsed.error.trim()) {
    return parsed.error;
  }

  const payloadError = parsed.payload?.error;
  if (typeof payloadError === "string" && payloadError.trim()) {
    return payloadError;
  }

  // The agent-runner emits errors as { type: "error", payload: { message } } (single-agent)
  // or { message, executionId } (multi-agent transport). Fall back to those before going generic.
  const payloadMessage = parsed.payload?.message;
  if (typeof payloadMessage === "string" && payloadMessage.trim()) {
    return payloadMessage;
  }
  if (typeof parsed.message === "string" && parsed.message.trim()) {
    return parsed.message;
  }

  return undefined;
}

/**
 * The agent-runner stream emits "control" events distinct from text content:
 *   - single-agent (data.type): thought, tool_call, tool_result, status
 *   - multi-agent (transport event name): handoff, agent_step_started, delegation_return
 * These must never be accumulated as visible message content (notably `thought`,
 * whose payload.text is the model's reasoning). They are surfaced as step chips instead.
 */
export function isRunnerControlEvent(eventType: string): boolean {
  switch (eventType) {
    case "thought":
    case "tool_call":
    case "tool_result":
    case "status":
    case "handoff":
    case "agent_step_started":
    case "delegation_return":
    case "tool_approval_request":
    case "tool_approval_resolved":
      return true;
    default:
      return false;
  }
}

/** True when a runner `status` event signals the run has completed. */
export function isRunnerCompletion(eventType: string, parsed: StreamEventShape): boolean {
  if (eventType !== "status") return false;
  const state = parsed.payload?.state;
  return state === "completed";
}

/**
 * True when a runner `status` event signals the run was stopped. The runner emits
 * `{status:"Stopped", state:"canceled"}` for a cancel from ANY channel — this client's
 * Stop button, another device, or an operator forcing a wedged run terminal server-side.
 * It is a deliberate clean end of stream (not an `error` frame), so a client that fails
 * to recognize it mistakes the stop for a dropped socket and reports a network failure.
 */
export function isRunnerCancellation(eventType: string, parsed: StreamEventShape): boolean {
  if (eventType !== "status") return false;
  return parsed.payload?.state === "canceled";
}

const truncate = (value: string, max = 160): string =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

const asString = (value: unknown): string => (typeof value === "string" ? value : "");

/**
 * Translate a runner control event into a chat step chip, or null when the event
 * produces no visible step (status:completed, agent_step_started, delegation_return).
 *
 * `stepSeq` is a per-stream counter used to give repeatable events (tool calls,
 * handoffs) unique step ids. Reasoning ("Thinking…") uses a stable id so repeated
 * reasoning deltas collapse into a single step rather than flooding the timeline.
 */
export function runnerEventToStep(
  eventType: string,
  parsed: StreamEventShape,
  stepSeq: number,
): AgentStepEvent | null {
  const payload = (parsed.payload ?? {}) as Record<string, unknown>;

  switch (eventType) {
    case "thought":
      return {
        type: "reasoning",
        label: "Thinking…",
        status: "in_progress",
        step_id: "runner_reasoning",
      };
    case "status": {
      const state = asString(payload["state"]);
      if (state === "completed" || state === "canceled") {
        return null;
      }
      if (state === "analyzing" || state === "acting") {
        return {
          type: "reasoning",
          label: asString(payload["status"]) || "Working…",
          status: "in_progress",
          step_id: "runner_reasoning",
        };
      }

      // Support simple/general status events:
      // { type: "status", label: "Searching..." }
      // { type: "status", payload: { label: "Searching..." } }
      // { type: "status", label: "Searching...", phase: "start" | "done" }
      const rawLabel =
        asString(parsed["label"]) ||
        asString(payload["label"]) ||
        asString(payload["status"]) ||
        asString(parsed["status"]) ||
        asString(parsed["message"]) ||
        asString(payload["message"]);

      if (rawLabel && rawLabel !== "completed" && rawLabel !== "canceled") {
        const phase = asString(parsed["phase"]) || asString(payload["phase"]);
        const isDone = phase === "done" || phase === "completed";
        const explicitId =
          asString(parsed["step_id"]) ||
          asString(payload["step_id"]) ||
          asString(parsed["id"]) ||
          asString(payload["id"]);
        const labelForId = rawLabel.toLowerCase().replace(/[^a-z0-9_]/g, "_");
        const stepId = explicitId || `runner_status_${labelForId}`;
        const duration =
          typeof parsed["duration_ms"] === "number"
            ? (parsed["duration_ms"] as number)
            : typeof payload["duration_ms"] === "number"
              ? (payload["duration_ms"] as number)
              : undefined;

        return {
          type: "reasoning",
          label: rawLabel,
          status: isDone ? "done" : "in_progress",
          step_id: stepId,
          ...(duration !== undefined ? { duration_ms: duration } : {}),
        };
      }
      return null;
    }
    case "tool_call": {
      const name = asString(payload["name"]) || "tool";
      // Parity with the legacy runner: the internal llm_chat tool is not surfaced.
      if (name === "llm_chat") return null;
      return {
        type: "tool_call",
        label: `Using ${name}…`,
        status: "in_progress",
        step_id: `runner_tool_call_${stepSeq}`,
      };
    }
    case "tool_result": {
      const name = asString(payload["name"]) || "tool";
      const output = asString(payload["output"]);
      return {
        type: "tool_result",
        label: `${name} result`,
        ...(output ? { detail: truncate(output) } : {}),
        status: "done",
        step_id: `runner_tool_result_${stepSeq}`,
      };
    }
    case "handoff": {
      // Multi-agent handoff frames carry their fields at the top level (data was
      // JSON-stringified directly), not under `payload`.
      const frame = parsed as Record<string, unknown>;
      const to = asString(frame["toAlias"]) || asString(frame["toSubAgentId"]) || "agent";
      const kind = asString(frame["type"]) || "transfer";
      return {
        type: "handoff",
        label: to,
        detail: kind,
        status: "in_progress",
        step_id: `runner_handoff_${stepSeq}`,
      };
    }
    default:
      // agent_step_started / delegation_return: bookkeeping only, no chip.
      return null;
  }
}

/** Whether a runner step type uses a stable id (collapses) vs. a per-occurrence id. */
export function runnerStepConsumesSeq(eventType: string): boolean {
  return eventType === "tool_call" || eventType === "tool_result" || eventType === "handoff";
}

/**
 * Parse a `tool_approval_request` frame into a pending {@link ToolApproval},
 * or null when the payload is malformed. The runner emits these as data-only
 * frames: `{ type: "tool_approval_request", payload: { approvalId, toolCallId,
 * toolName, args, riskCategory, expiresAt, executionId, … } }`.
 */
export function toolApprovalFromRequestEvent(parsed: StreamEventShape): ToolApproval | null {
  const payload = (parsed.payload ?? parsed) as Record<string, unknown>;
  const approvalId = asString(payload["approvalId"]);
  const toolCallId = asString(payload["toolCallId"]);
  if (!approvalId || !toolCallId) return null;

  const riskCategory = asString(payload["riskCategory"]);
  const expiresAt = asString(payload["expiresAt"]);
  const executionId = asString(payload["executionId"]);
  return {
    approvalId,
    toolCallId,
    toolName: asString(payload["toolName"]) || "tool",
    ...(payload["args"] !== undefined ? { args: payload["args"] } : {}),
    ...(riskCategory ? { riskCategory } : {}),
    ...(expiresAt ? { expiresAt } : {}),
    ...(executionId ? { executionId } : {}),
    status: "pending",
  };
}

export interface ToolApprovalResolution {
  approvalId: string;
  status: ToolApprovalStatus;
  reason: string | null;
}

const RESOLVED_APPROVAL_STATUSES: ToolApprovalStatus[] = [
  "approved",
  "denied",
  "expired",
  "canceled",
];

/**
 * Parse a `tool_approval_resolved` frame (`payload.decision` carries the final
 * status, `payload.reason` an optional deny reason). A "timeout" decision maps
 * to "expired"; unknown decisions map to "canceled" so the card never sticks
 * in a pending state after resolution.
 */
export function toolApprovalResolutionFromEvent(
  parsed: StreamEventShape,
): ToolApprovalResolution | null {
  const payload = (parsed.payload ?? parsed) as Record<string, unknown>;
  const approvalId = asString(payload["approvalId"]);
  if (!approvalId) return null;

  const decision = asString(payload["decision"]);
  const reason = asString(payload["reason"]);
  return {
    approvalId,
    status:
      decision === "timeout"
        ? "expired"
        : RESOLVED_APPROVAL_STATUSES.includes(decision as ToolApprovalStatus)
          ? (decision as ToolApprovalStatus)
          : "canceled",
    reason: reason || null,
  };
}
