import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { CitationModal } from "./citation-modal";
import type { MessageSource } from "../../headless/types/chat";
import "@testing-library/jest-dom";

jest.mock("../../headless/context/chat-provider", () => ({
  useChatContext: () => ({ config: { theme: "light" } }),
}));

const mockSource: MessageSource = {
  id: "src_1",
  title: "Employee Handbook.pdf",
  snippet: "Employees may work remotely 2 days per week.",
  page: 14,
  url: "https://example.com/handbook.pdf",
  metadata: {
    tags: "HR, Remote",
    classification: "Internal",
  },
};

describe("CitationModal", () => {
  it("renders nothing when source is null", () => {
    const { container } = render(<CitationModal source={null} onClose={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders source title, snippet, metadata, and link", () => {
    const onClose = jest.fn();
    render(<CitationModal source={mockSource} onClose={onClose} />);

    expect(screen.getByText("Employee Handbook.pdf")).toBeInTheDocument();
    expect(
      screen.getByText('"Employees may work remotely 2 days per week."'),
    ).toBeInTheDocument();
    expect(screen.getByText("HR, Remote")).toBeInTheDocument();
    expect(screen.getByText("Internal")).toBeInTheDocument();
    expect(screen.getByText("Page 14")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open external document/ })).toHaveAttribute(
      "href",
      "https://example.com/handbook.pdf",
    );
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = jest.fn();
    render(<CitationModal source={mockSource} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape key is pressed", () => {
    const onClose = jest.fn();
    render(<CitationModal source={mockSource} onClose={onClose} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when clicking overlay backdrop", () => {
    const onClose = jest.fn();
    const { container } = render(<CitationModal source={mockSource} onClose={onClose} />);

    const overlay = document.querySelector(".ais-citation-modal-overlay")!;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
