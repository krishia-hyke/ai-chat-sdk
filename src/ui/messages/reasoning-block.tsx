"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/cn";
import type { AgentPlanPhase, AgentStepEvent } from "../../headless/types/chat";

interface ReasoningBlockProps {
  steps: AgentStepEvent[];
  plan?: AgentPlanPhase[];
  isStreaming: boolean;
  elapsedMs?: number;
}

type SkillGroup = {
  skill: AgentStepEvent;
  steps: AgentStepEvent[];
};

export function cleanStepLabel(label: string): string {
  return (label || "").replace(/[\s.]+$/, "");
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * ReasoningBlock displays the internal "thinking" process of the AI agent.
 *
 * NOTE ON STYLING:
 * Every element here carries an `ais-`-prefixed class backed by real CSS in
 * `src/styles/styles-no-base.css`. Do not lay this component out with Tailwind
 * utilities — the SDK ships static CSS only, so utilities are dead classes in
 * any host that does not compile Tailwind over `node_modules` (which Tailwind v4
 * does not do by default, since `node_modules` is typically gitignored).
 *
 * NOTE ON DUPLICATE LABELS:
 * You may see multiple occurrences of the same label (e.g., "Recalling context...") in the timeline.
 * This is expected behavior due to the backend's execution architecture:
 *
 * 1. Dual Event Emission: The backend often emits both a general "status" event and a specific
 *    "tool_call" event for the same action. Both are rendered as distinct steps.
 * 2. ReAct Loop Iterations: The agent operates in a Reason+Act loop. If it needs more info,
 *    it will run another cycle, generating a new set of steps even if the labels are similar.
 * 3. Randomized Phrase Pool: Labels are picked from a pool of phrases for each tool.
 *    Small pools or repeated actions can lead to phrase repetition.
 * 4. Distinct Execution Events: Every line represents a unique event with its own tracking ID
 *    and duration, even if the user-facing label is identical.
 */
export function ReasoningBlock({ steps, plan, isStreaming, elapsedMs }: ReasoningBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set());
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  // Group steps by handoff events (triage → skill boundary).
  // Steps before the first handoff are triage internals and are dropped.
  // Returns null when no handoff events exist (flat fallback mode).
  const skillGroups = useMemo<SkillGroup[] | null>(() => {
    const hasHandoff = steps.some((s) => s.type === "handoff");
    if (!hasHandoff) return null;

    const groups: SkillGroup[] = [];
    let current: SkillGroup | null = null;
    for (const step of steps) {
      if (step.type === "handoff") {
        if (current) groups.push(current);
        current = { skill: step, steps: [] };
      } else if (current) {
        current.steps.push(step);
      }
    }
    if (current) groups.push(current);
    return groups;
  }, [steps]);

  const headerLabel = useMemo(() => {
    if (isStreaming) {
      const last = steps[steps.length - 1];
      const clean = cleanStepLabel(last?.label || "Thinking");
      return `${clean}...`;
    }
    return expanded ? "Hide reasoning" : "Show reasoning";
  }, [isStreaming, steps, expanded]);

  // Persist after a completed stream (elapsedMs is set) so the user can still review
  // the reasoning. Only fully hide when there's nothing to show and it never ran
  // (e.g. assistant messages loaded from history, which carry no steps).
  if (!isStreaming && !steps.length && !plan?.length && typeof elapsedMs !== "number") {
    return null;
  }

  const seconds =
    !isStreaming && typeof elapsedMs === "number"
      ? Math.max(1, Math.round(elapsedMs / 1000))
      : null;

  const toggleSkill = (id: string) =>
    setExpandedSkills((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleStep = (id: string) =>
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="ais-reasoning-root">
      {/* Header bar */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="ais-reasoning-header"
        aria-expanded={expanded}
      >
        <SparkleIcon spinning={isStreaming} className="ais-reasoning-sparkle" />
        <span className="ais-reasoning-title">{headerLabel}</span>
        {seconds !== null && <span className="ais-reasoning-seconds">Thought for {seconds}s</span>}
        <ChevronDown
          className={cn("ais-reasoning-chevron", !expanded && "ais-reasoning-chevron--collapsed")}
          aria-hidden
        />
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="ais-reasoning-content">
          <div className="ais-reasoning-body">
            {/* Plan phases */}
            {plan?.length ? (
              <ol className="ais-reasoning-plan">
                {plan.map((phase) => (
                  <li key={phase.id} className="ais-reasoning-plan-item">
                    <span className="ais-reasoning-plan-dot" aria-hidden />
                    {phase.label}
                  </li>
                ))}
              </ol>
            ) : null}

            {skillGroups ? (
              /* Two-level view: skill groups from triage */
              <ol className="ais-reasoning-groups">
                {skillGroups.map((group, groupIdx) => {
                  const isLastGroup = groupIdx === skillGroups.length - 1;
                  // Auto-expand the active skill while streaming; otherwise respect toggle state
                  const isSkillOpen =
                    isStreaming && isLastGroup ? true : expandedSkills.has(group.skill.step_id);
                  // Skill header pulses only while streaming and no tool steps have arrived yet
                  const isSkillCurrent = isStreaming && isLastGroup && group.steps.length === 0;

                  return (
                    <li key={group.skill.step_id} className="ais-reasoning-skill">
                      {/* Level 1: Skill name. A soft vertical guide line (CSS) replaces the
                          expand chevron; the row stays clickable to toggle its steps. */}
                      <button
                        type="button"
                        onClick={() => toggleSkill(group.skill.step_id)}
                        className="ais-reasoning-skill-toggle"
                        aria-expanded={isSkillOpen}
                      >
                        <span
                          className={cn(
                            "ais-reasoning-label",
                            isSkillCurrent && "ais-reasoning-label--active",
                          )}
                        >
                          {cleanStepLabel(group.skill.label)}
                        </span>
                      </button>

                      {/* Level 2: Tool steps within the skill. The inner timeline line is
                          the ::before guide on the wrapper below. */}
                      {isSkillOpen && group.steps.length > 0 && (
                        <div className="ais-reasoning-substeps">
                          <ol className="ais-reasoning-steps">
                            {group.steps.map((step, stepIdx) => {
                              const isCurrentStep =
                                isStreaming && isLastGroup && stepIdx === group.steps.length - 1;
                              const hasDetail = !!step.detail;
                              const isStepOpen = expandedSteps.has(step.step_id);

                              return (
                                <li key={step.step_id} className="ais-reasoning-step">
                                  {hasDetail ? (
                                    /* Collapsible step (has Level 3 detail) */
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => toggleStep(step.step_id)}
                                        className="ais-reasoning-row ais-reasoning-row--button"
                                        aria-expanded={isStepOpen}
                                      >
                                        <ChevronDown
                                          className={cn(
                                            "ais-reasoning-chevron",
                                            !isStepOpen && "ais-reasoning-chevron--collapsed",
                                          )}
                                          aria-hidden
                                        />
                                        <span
                                          className={cn(
                                            "ais-reasoning-step-label",
                                            isCurrentStep && "ais-reasoning-step-label--current",
                                          )}
                                        >
                                          {cleanStepLabel(step.label)}
                                        </span>
                                        {typeof step.duration_ms === "number" && !isStreaming && (
                                          <span className="ais-reasoning-duration">
                                            {formatDuration(step.duration_ms)}
                                          </span>
                                        )}
                                      </button>
                                      {/* Level 3: detail lines */}
                                      {isStepOpen && (
                                        <div className="ais-reasoning-detail">
                                          {step.detail!.split("\n").map((line, i) => (
                                            <div key={i}>{line}</div>
                                          ))}
                                        </div>
                                      )}
                                    </>
                                  ) : (
                                    /* Non-collapsible step */
                                    <div className="ais-reasoning-row">
                                      <div className="ais-reasoning-chevron-spacer" aria-hidden />
                                      <span
                                        className={cn(
                                          "ais-reasoning-step-label",
                                          isCurrentStep && "ais-reasoning-step-label--current",
                                        )}
                                      >
                                        {cleanStepLabel(step.label)}
                                      </span>
                                      {typeof step.duration_ms === "number" && !isStreaming && (
                                        <span className="ais-reasoning-duration">
                                          {formatDuration(step.duration_ms)}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </li>
                              );
                            })}
                          </ol>
                        </div>
                      )}
                    </li>
                  );
                })}

                {!isStreaming && steps.length > 0 && (
                  <li className="ais-reasoning-done">
                    <span className="ais-reasoning-step-label">Reasoning complete</span>
                  </li>
                )}
              </ol>
            ) : (
              /* Flat fallback — no triage / no handoff events */
              <ol className="ais-reasoning-steps ais-reasoning-steps--flat">
                {steps.map((step, index) => {
                  const isCurrentStep = isStreaming && index === steps.length - 1;
                  return (
                    <li
                      key={step.step_id}
                      className={cn(
                        "ais-reasoning-step ais-reasoning-step--flat",
                        !isCurrentStep && !isStreaming && "ais-reasoning-step--past",
                      )}
                    >
                      <div className="ais-reasoning-step-body">
                        <div className="ais-reasoning-row">
                          <span
                            className={cn(
                              "ais-reasoning-step-label",
                              isCurrentStep && "ais-reasoning-step-label--current",
                            )}
                          >
                            {cleanStepLabel(step.label)}
                          </span>
                          {typeof step.duration_ms === "number" && !isStreaming && (
                            <span className="ais-reasoning-duration">
                              {formatDuration(step.duration_ms)}
                            </span>
                          )}
                        </div>
                        {step.detail && (
                          <span className="ais-reasoning-detail--inline">{step.detail}</span>
                        )}
                      </div>
                    </li>
                  );
                })}
                {!isStreaming && (
                  <li className="ais-reasoning-step ais-reasoning-done">
                    <span className="ais-reasoning-step-label">Reasoning complete</span>
                  </li>
                )}
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SparkleIcon({ spinning, className }: { spinning: boolean; className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={cn(spinning && "ais-spin", className)}
    >
      <path d="M12 1L9.5 9.5L1 12L9.5 14.5L12 23L14.5 14.5L23 12L14.5 9.5Z" />
    </svg>
  );
}
