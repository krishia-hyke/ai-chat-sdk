import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChatEmptyState } from "./chat-empty-state";
import type { StarterCard } from "./chat-empty-state";
import "@testing-library/jest-dom";

const MOCK_CARDS: StarterCard[] = [
  {
    icon: <span>icon1</span>,
    iconColor: "#blue",
    title: "First card",
    description: "Do the first thing",
    prompt: "First card prompt",
  },
  {
    icon: <span>icon2</span>,
    iconColor: "#red",
    title: "Second card",
    description: "Do the second thing",
    prompt: "Second card prompt",
  },
];

describe("ChatEmptyState", () => {
  const mockOnSendMessage = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the default heading when no heading prop provided", () => {
    render(<ChatEmptyState onSendMessage={mockOnSendMessage} />);
    expect(screen.getByText("What would you like to work on today?")).toBeInTheDocument();
  });

  it("renders a custom heading when provided", () => {
    render(<ChatEmptyState onSendMessage={mockOnSendMessage} heading="Welcome! How can I help?" />);
    expect(screen.getByText("Welcome! How can I help?")).toBeInTheDocument();
  });

  it("renders starter card titles and descriptions", () => {
    render(<ChatEmptyState onSendMessage={mockOnSendMessage} starterCards={MOCK_CARDS} />);
    expect(screen.getByText("First card")).toBeInTheDocument();
    expect(screen.getByText("Do the first thing")).toBeInTheDocument();
    expect(screen.getByText("Second card")).toBeInTheDocument();
    expect(screen.getByText("Do the second thing")).toBeInTheDocument();
  });

  it("calls onSendMessage with the card prompt when a card is clicked", () => {
    render(<ChatEmptyState onSendMessage={mockOnSendMessage} starterCards={MOCK_CARDS} />);
    fireEvent.click(screen.getByText("First card"));
    expect(mockOnSendMessage).toHaveBeenCalledWith("First card prompt");
  });

  it("renders no starter grid when starterCards is empty", () => {
    render(<ChatEmptyState onSendMessage={mockOnSendMessage} starterCards={[]} />);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("renders subheading when provided", () => {
    render(<ChatEmptyState onSendMessage={mockOnSendMessage} subheading="Powered by AI" />);
    expect(screen.getByText("Powered by AI")).toBeInTheDocument();
  });

  it("renders with is-compact class when compact prop is true", () => {
    const { container } = render(
      <ChatEmptyState onSendMessage={mockOnSendMessage} compact={true} />,
    );
    expect(container.querySelector(".ais-empty-state")).toHaveClass("is-compact");
  });
});
