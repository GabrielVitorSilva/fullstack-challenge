import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RoundHistory } from "@/components/game/RoundHistory";
import type { RoundSummary } from "@/hooks/useGame";

const history: RoundSummary[] = [
  { id: "r-1", crashMultiplier: 1.5 },
  { id: "r-2", crashMultiplier: 3.0 },
  { id: "r-3", crashMultiplier: 8.0 },
];

describe("RoundHistory", () => {
  it("renders a formatted badge for each round", () => {
    render(<RoundHistory history={history} />);
    expect(screen.getByText("1.50×")).toBeInTheDocument();
    expect(screen.getByText("3.00×")).toBeInTheDocument();
    expect(screen.getByText("8.00×")).toBeInTheDocument();
  });

  it("renders the accessible section label", () => {
    render(<RoundHistory history={history} />);
    expect(screen.getByRole("region", { name: /recent rounds/i })).toBeInTheDocument();
  });

  it("renders nothing when history is empty", () => {
    const { container } = render(<RoundHistory history={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders one listitem per round", () => {
    render(<RoundHistory history={history} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(history.length);
  });
});
