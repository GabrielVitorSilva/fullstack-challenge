import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LiveBets } from "@/components/game/LiveBets";
import type { LiveBet } from "@/hooks/useGame";

const activeBet: LiveBet = {
  betId: "b-1",
  playerId: "player-abc123",
  amountCents: 1000n,
  status: "active",
};

const cashedOutBet: LiveBet = {
  betId: "b-2",
  playerId: "player-xyz",
  amountCents: 2000n,
  status: "cashed_out",
  cashoutMultiplier: 3.5,
  payoutCents: 7000n,
};

const lostBet: LiveBet = {
  betId: "b-3",
  playerId: "player-short",
  amountCents: 500n,
  status: "lost",
};

describe("LiveBets", () => {
  it("renders nothing when list is empty", () => {
    const { container } = render(<LiveBets liveBets={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the accessible section label", () => {
    render(<LiveBets liveBets={[activeBet]} />);
    expect(screen.getByRole("region", { name: /live bets/i })).toBeInTheDocument();
  });

  it("renders one listitem per bet", () => {
    render(<LiveBets liveBets={[activeBet, cashedOutBet, lostBet]} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("displays amount formatted in dollars for an active bet", () => {
    render(<LiveBets liveBets={[activeBet]} />);
    expect(screen.getByText("$10.00")).toBeInTheDocument();
  });

  it("shows Active badge for active bet", () => {
    render(<LiveBets liveBets={[activeBet]} />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows Lost badge for lost bet", () => {
    render(<LiveBets liveBets={[lostBet]} />);
    expect(screen.getByText("Lost")).toBeInTheDocument();
  });

  it("shows payout info for cashed_out bet", () => {
    render(<LiveBets liveBets={[cashedOutBet]} />);
    expect(screen.getByText(/3\.50×/)).toBeInTheDocument();
    expect(screen.getByText(/\$70\.00/)).toBeInTheDocument();
  });

  it("truncates long player IDs", () => {
    const longIdBet: LiveBet = {
      betId: "b-long",
      playerId: "abcdef1234567890",
      amountCents: 100n,
      status: "active",
    };
    render(<LiveBets liveBets={[longIdBet]} />);
    expect(screen.getByText("abcdef…7890")).toBeInTheDocument();
  });

  it("does not truncate short player IDs", () => {
    render(<LiveBets liveBets={[lostBet]} />);
    expect(screen.getByText("player-short")).toBeInTheDocument();
  });
});
