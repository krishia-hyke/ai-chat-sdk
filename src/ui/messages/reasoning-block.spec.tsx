import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReasoningBlock, cleanStepLabel } from "./reasoning-block";
import type { AgentStepEvent } from "../../headless/types/chat";
import "@testing-library/jest-dom";

const step = (
  over: Partial<AgentStepEvent> & { step_id: string; label: string },
): AgentStepEvent => ({
  type: "tool_call",
  status: "done",
  ...over,
});

const groupedSteps: AgentStepEvent[] = [
  step({ step_id: "h1", label: "thread-scout", type: "handoff" }),
  step({ step_id: "s1", label: "Searching subreddits", duration_ms: 1400 }),
  step({ step_id: "s2", label: "Ranking threads", detail: "line one\nline two" }),
  step({ step_id: "h2", label: "rules-brief", type: "handoff" }),
  step({ step_id: "s3", label: "Reading rules" }),
];

/**
 * The SDK ships static CSS only — Tailwind utilities are dead classes in hosts
 * that do not compile Tailwind over `node_modules` (Tailwind v4 skips it by
 * default). Every class this component renders must therefore be `ais-`
 * prefixed, with `lucide*` allowed for the icon library's own classes.
 */
function assertOnlySdkClasses(container: HTMLElement) {
  const offenders: string[] = [];
  for (const el of Array.from(container.querySelectorAll<HTMLElement>("[class]"))) {
    const classes = (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
    for (const cls of classes) {
      if (!cls.startsWith("ais-") && !cls.startsWith("lucide")) {
        offenders.push(`<${el.tagName.toLowerCase()} class="${cls}">`);
      }
    }
  }
  expect(offenders).toEqual([]);
}

describe("ReasoningBlock", () => {
  it("renders nothing for a history message that never streamed", () => {
    const { container } = render(<ReasoningBlock steps={[]} isStreaming={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("expands into skill groups and their steps", () => {
    render(<ReasoningBlock steps={groupedSteps} isStreaming={false} elapsedMs={4200} />);

    fireEvent.click(screen.getByRole("button", { name: /Show reasoning/ }));

    expect(screen.getByRole("button", { name: "thread-scout" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "rules-brief" })).toBeInTheDocument();
    expect(screen.getByText("Reasoning complete")).toBeInTheDocument();

    // Groups are collapsed until clicked (nothing is streaming).
    expect(screen.queryByText("Searching subreddits")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "thread-scout" }));
    expect(screen.getByText("Searching subreddits")).toBeInTheDocument();
    expect(screen.getByText("1.4s")).toBeInTheDocument();
  });

  it("reveals level-3 detail lines for a step that carries them", () => {
    render(<ReasoningBlock steps={groupedSteps} isStreaming={false} elapsedMs={4200} />);

    fireEvent.click(screen.getByRole("button", { name: /Show reasoning/ }));
    fireEvent.click(screen.getByRole("button", { name: "thread-scout" }));

    const stepToggle = screen.getByRole("button", { name: /Ranking threads/ });
    expect(screen.queryByText("line one")).not.toBeInTheDocument();
    fireEvent.click(stepToggle);
    expect(screen.getByText("line one")).toBeInTheDocument();
    expect(screen.getByText("line two")).toBeInTheDocument();
  });

  it("styles the whole expanded tree with ais- classes only (no Tailwind reliance)", () => {
    const { container } = render(
      <ReasoningBlock
        steps={groupedSteps}
        plan={[{ id: "p1", label: "Find candidate threads" }]}
        isStreaming={false}
        elapsedMs={4200}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Show reasoning/ }));
    fireEvent.click(screen.getByRole("button", { name: "thread-scout" }));
    fireEvent.click(screen.getByRole("button", { name: /Ranking threads/ }));

    assertOnlySdkClasses(container);
  });

  it("styles the flat fallback (no handoffs) with ais- classes only", () => {
    const { container } = render(
      <ReasoningBlock
        steps={[step({ step_id: "s1", label: "Thinking it through", detail: "some detail" })]}
        isStreaming={false}
        elapsedMs={1200}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Show reasoning/ }));

    expect(screen.getByText("Thinking it through")).toBeInTheDocument();
    assertOnlySdkClasses(container);
  });

  it("strips trailing dots from step labels and header to prevent duplicate ellipsis", () => {
    expect(cleanStepLabel("Searching documents...")).toBe("Searching documents");
    expect(cleanStepLabel("Evaluating policy... ")).toBe("Evaluating policy");
    expect(cleanStepLabel("Thinking")).toBe("Thinking");

    const dottedSteps: AgentStepEvent[] = [
      step({ step_id: "s1", label: "Searching documents..." }),
      step({ step_id: "s2", label: "Evaluating policy... " }),
    ];

    render(<ReasoningBlock steps={dottedSteps} isStreaming={true} />);

    // Header cleans trailing dots and appends exactly one "..."
    expect(screen.getByText("Evaluating policy...")).toBeInTheDocument();

    // Inside the tree
    fireEvent.click(screen.getByRole("button", { name: /Evaluating policy/ }));
    expect(screen.getByText("Searching documents")).toBeInTheDocument();
    expect(screen.getByText("Evaluating policy")).toBeInTheDocument();
  });
});
