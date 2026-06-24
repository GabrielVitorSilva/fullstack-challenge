/**
 * End-to-end tests for the main game flow.
 *
 * Renders GamePage with all real child components; mocks only at system
 * boundaries:
 *   - WebSocket (GameSocketService)
 *   - Auth (react-oidc-context via @/auth/useAuth)
 *   - REST calls (wallets service, game service)
 *
 * These tests validate what the user sees across the full component stack:
 * connection state UI, placing a bet, multiplier ticks, cashout, round history,
 * reconnect reconciliation, and page-reload mid-round reconstruction.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, within } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { GamePage } from "@/pages/GamePage";
import type { GameSocketListener, ConnectionStateListener } from "@/services/gameSocket";
import type { GameServerEvent } from "@/services/ws-events";

// ---------------------------------------------------------------------------
// WebSocket boundary mock
// ---------------------------------------------------------------------------

const mockEventListeners = new Set<GameSocketListener>();
const mockStateListeners = new Set<ConnectionStateListener>();

const mockSocketInstance = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  onEvent: vi.fn((fn: GameSocketListener) => {
    mockEventListeners.add(fn);
    return () => mockEventListeners.delete(fn);
  }),
  onConnectionState: vi.fn((fn: ConnectionStateListener) => {
    mockStateListeners.add(fn);
    return () => mockStateListeners.delete(fn);
  }),
};

vi.mock("@/services/gameSocket", () => ({
  GameSocketService: vi.fn(() => mockSocketInstance),
}));

vi.mock("@/auth/useAuth", () => ({
  useAuth: () => ({
    user: {
      access_token: "test-token",
      profile: { sub: "user-42", preferred_username: "testplayer" },
    },
    signoutRedirect: vi.fn(),
  }),
}));

vi.mock("@/services/wallets", () => ({
  // balanceCents is a plain number (as returned by the real API and typed in WalletResponse)
  getWallet: vi.fn().mockResolvedValue({ balanceCents: 100_000 }),
}));

vi.mock("@/services/game", () => ({
  placeBet: vi.fn().mockResolvedValue(undefined),
  cashout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/services/buildWsUrl", () => ({
  buildWsUrl: () => "ws://localhost:8000/ws",
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emitEvent(event: GameServerEvent) {
  mockEventListeners.forEach((l) => l(event));
}

function emitConnectionState(state: "connecting" | "connected" | "disconnected") {
  mockStateListeners.forEach((l) => l(state));
}

function bettingEvent(roundId = "r-1") {
  return {
    type: "round.betting" as const,
    roundId,
    bettingEndsAt: new Date(Date.now() + 10_000).toISOString(),
    hashedServerSeed: "a".repeat(64),
  };
}

function startedEvent(roundId = "r-1") {
  return { type: "round.started" as const, roundId, startedAt: new Date().toISOString() };
}

function crashedEvent(roundId = "r-1", crashMultiplier = 2.5) {
  return { type: "round.crashed" as const, roundId, crashMultiplier };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockEventListeners.clear();
  mockStateListeners.clear();
  vi.clearAllMocks();
  // Re-attach implementations; vi.clearAllMocks() only clears call history
  // but we re-set explicitly so the Set-based pattern survives any future
  // change to how mocks are reset between tests.
  mockSocketInstance.onEvent.mockImplementation((fn: GameSocketListener) => {
    mockEventListeners.add(fn);
    return () => mockEventListeners.delete(fn);
  });
  mockSocketInstance.onConnectionState.mockImplementation((fn: ConnectionStateListener) => {
    mockStateListeners.add(fn);
    return () => mockStateListeners.delete(fn);
  });
});

// ---------------------------------------------------------------------------
// Connection state
// ---------------------------------------------------------------------------

describe("GamePage — connection state", () => {
  it("shows 'Connecting to game server…' banner while connecting", () => {
    render(<GamePage />);
    expect(screen.getByRole("status")).toHaveTextContent(/connecting to game server/i);
  });

  it("hides the connection banner once connected", () => {
    render(<GamePage />);
    act(() => emitConnectionState("connected"));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows 'Connection lost. Reconnecting…' banner when disconnected after connect", () => {
    render(<GamePage />);
    act(() => emitConnectionState("connected"));
    act(() => emitConnectionState("disconnected"));
    expect(screen.getByRole("status")).toHaveTextContent(/connection lost/i);
  });

  it("hides the connection banner again after reconnecting", () => {
    render(<GamePage />);
    act(() => emitConnectionState("connected"));
    act(() => emitConnectionState("disconnected"));
    act(() => emitConnectionState("connected"));
    expect(screen.queryByRole("status")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// BETTING phase UI
// ---------------------------------------------------------------------------

describe("GamePage — BETTING phase UI", () => {
  beforeEach(() => {
    render(<GamePage />);
    act(() => emitConnectionState("connected"));
    act(() => emitEvent(bettingEvent()));
  });

  it("shows 'Accepting Bets' badge", () => {
    expect(screen.getByText(/accepting bets/i)).toBeInTheDocument();
  });

  it("shows a countdown for the betting window", () => {
    expect(screen.getByText(/starting in/i)).toBeInTheDocument();
  });

  it("bet amount input is enabled", () => {
    expect(screen.getByLabelText(/bet amount in dollars/i)).not.toBeDisabled();
  });

  it("auto-cashout input is enabled", () => {
    expect(screen.getByLabelText(/auto cashout multiplier/i)).not.toBeDisabled();
  });

  it("'Place Bet' button is enabled", () => {
    expect(screen.getByRole("button", { name: /place bet/i })).not.toBeDisabled();
  });

  it("'Cash Out' button is disabled during BETTING phase", () => {
    expect(screen.getByRole("button", { name: /cash out/i })).toBeDisabled();
  });

  it("multiplier display starts at 1.00×", () => {
    expect(screen.getByLabelText(/current multiplier/i)).toHaveTextContent("1.00×");
  });

  it("shows wallet balance loaded from the API", async () => {
    await screen.findByText("$1000.00");
  });

  it("LiveBets section renders its label", () => {
    expect(screen.getByRole("region", { name: /live bets/i })).toBeInTheDocument();
  });

  it("RoundHistory section renders its label", () => {
    expect(screen.getByRole("region", { name: /recent rounds/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Placing a bet
// ---------------------------------------------------------------------------

describe("GamePage — placing a bet", () => {
  beforeEach(() => {
    render(<GamePage />);
    act(() => emitConnectionState("connected"));
    act(() => emitEvent(bettingEvent()));
  });

  it("shows 'Bet placed — waiting for round to start' banner after clicking Place Bet", () => {
    fireEvent.click(screen.getByRole("button", { name: /place bet/i }));
    expect(screen.getByRole("status")).toHaveTextContent(/bet placed/i);
  });

  it("bet button label changes to 'Bet Placed' and becomes disabled", () => {
    fireEvent.click(screen.getByRole("button", { name: /place bet/i }));
    expect(screen.getByRole("button", { name: /bet placed/i })).toBeDisabled();
  });

  it("bet amount input is disabled after placing a bet", () => {
    fireEvent.click(screen.getByRole("button", { name: /place bet/i }));
    expect(screen.getByLabelText(/bet amount in dollars/i)).toBeDisabled();
  });

  it("auto-cashout input is disabled after placing a bet", () => {
    fireEvent.click(screen.getByRole("button", { name: /place bet/i }));
    expect(screen.getByLabelText(/auto cashout multiplier/i)).toBeDisabled();
  });

  it("quick-add buttons are disabled after placing a bet", () => {
    fireEvent.click(screen.getByRole("button", { name: /place bet/i }));
    screen.getAllByRole("button", { name: /^\+\$/ }).forEach((btn) =>
      expect(btn).toBeDisabled(),
    );
  });

  it("the bet appears in LiveBets when a bet.placed event arrives", () => {
    fireEvent.click(screen.getByRole("button", { name: /place bet/i }));
    act(() => {
      emitEvent({
        type: "bet.placed",
        roundId: "r-1",
        betId: "b-1",
        playerId: "user-42",
        amountCents: "1000",
      });
    });
    const liveBetsRegion = screen.getByRole("region", { name: /live bets/i });
    expect(within(liveBetsRegion).getByText("$10.00")).toBeInTheDocument();
    expect(within(liveBetsRegion).getByText(/active/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// IN_PROGRESS phase
// ---------------------------------------------------------------------------

describe("GamePage — IN_PROGRESS phase", () => {
  beforeEach(() => {
    render(<GamePage />);
    act(() => emitConnectionState("connected"));
    act(() => emitEvent(bettingEvent()));
    fireEvent.click(screen.getByRole("button", { name: /place bet/i }));
    act(() => emitEvent(startedEvent()));
  });

  it("shows 'Live' badge when the round is in progress", () => {
    expect(screen.getByText(/^live$/i)).toBeInTheDocument();
  });

  it("'Cash Out' button is enabled when the player has an active bet", () => {
    expect(screen.getByRole("button", { name: /cash out/i })).not.toBeDisabled();
  });

  it("'Place Bet' button is disabled with 'Bet Placed' label when a pending bet exists", () => {
    // beforeEach places a bet, so hasPendingBet=true → label is "Bet Placed"
    expect(screen.getByRole("button", { name: /bet placed/i })).toBeDisabled();
  });

  it("multiplier display updates on round.tick", () => {
    act(() => {
      emitEvent({ type: "round.tick", roundId: "r-1", multiplier: 1.42, elapsedMs: 3000 });
    });
    expect(screen.getByLabelText(/current multiplier/i)).toHaveTextContent("1.42×");
  });

  it("shows potential win based on current multiplier and bet amount", () => {
    act(() => {
      emitEvent({ type: "round.tick", roundId: "r-1", multiplier: 2.0, elapsedMs: 5000 });
    });
    // Default bet amount is $10.00, multiplier 2.0 → potential win $20.00
    expect(screen.getByText("$20.00")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Cashout
// ---------------------------------------------------------------------------

describe("GamePage — cashout", () => {
  beforeEach(() => {
    render(<GamePage />);
    act(() => emitConnectionState("connected"));
    act(() => emitEvent(bettingEvent()));
    fireEvent.click(screen.getByRole("button", { name: /place bet/i }));
    act(() => emitEvent(startedEvent()));
  });

  it("'Cash Out' button is disabled immediately after clicking (optimistic update)", () => {
    fireEvent.click(screen.getByRole("button", { name: /cash out/i }));
    expect(screen.getByRole("button", { name: /cash out/i })).toBeDisabled();
  });

  it("cashed-out bet shows payout info in LiveBets when bet.cashedout event arrives", () => {
    act(() => {
      emitEvent({
        type: "bet.placed",
        roundId: "r-1",
        betId: "b-1",
        playerId: "user-42",
        amountCents: "1000",
      });
    });
    act(() => {
      emitEvent({
        type: "bet.cashedout",
        roundId: "r-1",
        betId: "b-1",
        playerId: "user-42",
        multiplier: 2.5,
        payoutCents: "2500",
      });
    });
    const liveBetsRegion = screen.getByRole("region", { name: /live bets/i });
    expect(within(liveBetsRegion).getByText(/2\.50×/)).toBeInTheDocument();
    expect(within(liveBetsRegion).getByText(/\$25\.00/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Round crashed → history update
// ---------------------------------------------------------------------------

describe("GamePage — round.crashed", () => {
  beforeEach(() => {
    render(<GamePage />);
    act(() => emitConnectionState("connected"));
    act(() => emitEvent(bettingEvent()));
    // Another player places a bet so we can verify the "Lost" transition
    act(() => {
      emitEvent({
        type: "bet.placed",
        roundId: "r-1",
        betId: "b-other",
        playerId: "other-player",
        amountCents: "500",
      });
    });
    act(() => emitEvent(startedEvent()));
    act(() => emitEvent(crashedEvent("r-1", 3.14)));
  });

  it("shows 'Crashed' badge", () => {
    expect(screen.getByText(/^crashed$/i)).toBeInTheDocument();
  });

  it("multiplier display shows the crash value", () => {
    expect(screen.getByLabelText(/current multiplier/i)).toHaveTextContent("3.14×");
  });

  it("crashed multiplier appears in the RoundHistory section", () => {
    const historySection = screen.getByRole("region", { name: /recent rounds/i });
    expect(within(historySection).getByText("3.14×")).toBeInTheDocument();
  });

  it("'Place Bet' button shows 'Round Ended' and is disabled", () => {
    expect(screen.getByRole("button", { name: /round ended/i })).toBeDisabled();
  });

  it("active bets in LiveBets are shown as 'Lost' after round crash", () => {
    const liveBetsRegion = screen.getByRole("region", { name: /live bets/i });
    expect(within(liveBetsRegion).getByText(/lost/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Full round lifecycle — happy path
// ---------------------------------------------------------------------------

describe("GamePage — full round lifecycle", () => {
  it("flows BETTING → place bet → IN_PROGRESS → cashout → CRASHED → history → next round", () => {
    render(<GamePage />);

    // Connect and enter BETTING phase
    act(() => emitConnectionState("connected"));
    act(() => emitEvent(bettingEvent("r-1")));
    expect(screen.getByText(/accepting bets/i)).toBeInTheDocument();

    // Place a bet
    fireEvent.click(screen.getByRole("button", { name: /place bet/i }));
    expect(screen.getByRole("status")).toHaveTextContent(/bet placed/i);

    // Round starts
    act(() => emitEvent(startedEvent("r-1")));
    expect(screen.getByText(/^live$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cash out/i })).not.toBeDisabled();

    // Multiplier ticks
    act(() => emitEvent({ type: "round.tick", roundId: "r-1", multiplier: 1.75, elapsedMs: 4000 }));
    expect(screen.getByLabelText(/current multiplier/i)).toHaveTextContent("1.75×");

    // User cashes out (optimistic: button becomes disabled)
    fireEvent.click(screen.getByRole("button", { name: /cash out/i }));
    expect(screen.getByRole("button", { name: /cash out/i })).toBeDisabled();

    // Round crashes
    act(() => emitEvent(crashedEvent("r-1", 2.0)));
    expect(screen.getByText(/^crashed$/i)).toBeInTheDocument();
    const history = screen.getByRole("region", { name: /recent rounds/i });
    expect(within(history).getByText("2.00×")).toBeInTheDocument();

    // New round starts — history is preserved, panel resets to BETTING
    act(() => emitEvent(bettingEvent("r-2")));
    expect(screen.getByText(/accepting bets/i)).toBeInTheDocument();
    expect(within(history).getByText("2.00×")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /place bet/i })).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Reconnect with server snapshot
// ---------------------------------------------------------------------------

describe("GamePage — reconnect with server snapshot", () => {
  it("reconciles LiveBets state from snapshot when reconnecting mid-round", () => {
    render(<GamePage />);
    act(() => emitConnectionState("connected"));
    act(() => emitEvent(bettingEvent("r-1")));
    fireEvent.click(screen.getByRole("button", { name: /place bet/i }));
    act(() => emitEvent(startedEvent("r-1")));

    // Simulate disconnect then reconnect with a snapshot from the server
    act(() => emitConnectionState("disconnected"));
    expect(screen.getByRole("status")).toHaveTextContent(/connection lost/i);

    act(() => emitConnectionState("connected"));
    act(() => {
      emitEvent({
        type: "round.state",
        roundId: "r-1",
        phase: "IN_PROGRESS",
        multiplier: 2.1,
        bets: [
          { betId: "snap-b-1", playerId: "user-42", amountCents: "1000", status: "active" },
        ],
      });
    });

    // Connection banner gone
    expect(screen.queryByRole("status")).toBeNull();

    // Snapshot bet appears in LiveBets
    const liveBetsRegion = screen.getByRole("region", { name: /live bets/i });
    expect(within(liveBetsRegion).getByText("$10.00")).toBeInTheDocument();
  });

  it("shows missed cashout details from snapshot after reconnect", () => {
    render(<GamePage />);
    act(() => emitConnectionState("connected"));
    act(() => emitEvent(bettingEvent("r-1")));
    fireEvent.click(screen.getByRole("button", { name: /place bet/i }));
    act(() => emitEvent(startedEvent("r-1")));

    act(() => emitConnectionState("disconnected"));
    act(() => emitConnectionState("connected"));
    act(() => {
      emitEvent({
        type: "round.state",
        roundId: "r-1",
        phase: "IN_PROGRESS",
        multiplier: 3.0,
        bets: [
          {
            betId: "snap-b-2",
            playerId: "user-42",
            amountCents: "1000",
            status: "cashed_out",
            cashoutMultiplier: 2.5,
            payoutCents: "2500",
          },
        ],
      });
    });

    const liveBetsRegion = screen.getByRole("region", { name: /live bets/i });
    expect(within(liveBetsRegion).getByText(/2\.50×/)).toBeInTheDocument();
    expect(within(liveBetsRegion).getByText(/\$25\.00/)).toBeInTheDocument();
  });

  it("snapshot from a crashed round shows lost bets and adds to history", () => {
    render(<GamePage />);
    act(() => emitConnectionState("connected"));
    // Reconnect to an already-crashed round
    act(() => {
      emitEvent({
        type: "round.state",
        roundId: "r-old",
        phase: "CRASHED",
        multiplier: 1.5,
        bets: [
          { betId: "b-old", playerId: "other-player", amountCents: "500", status: "lost" },
        ],
      });
    });

    const liveBetsRegion = screen.getByRole("region", { name: /live bets/i });
    expect(within(liveBetsRegion).getByText(/lost/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Page reload — activeBet reconstruction from snapshot
// ---------------------------------------------------------------------------

describe("GamePage — page reload mid-round", () => {
  it("reconstructs activeBet and enables Cashout when rejoining IN_PROGRESS with own bet", () => {
    render(<GamePage />);
    act(() => emitConnectionState("connected"));

    // Fresh connect mid-round — no prior local state (simulates page reload)
    act(() => {
      emitEvent({
        type: "round.state",
        roundId: "r-3",
        phase: "IN_PROGRESS",
        multiplier: 1.8,
        bets: [
          { betId: "b-reload", playerId: "user-42", amountCents: "1000", status: "active" },
        ],
      });
    });

    expect(screen.getByText(/^live$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cash out/i })).not.toBeDisabled();
  });

  it("does not enable Cashout when the snapshot has only other players' bets", () => {
    render(<GamePage />);
    act(() => emitConnectionState("connected"));

    act(() => {
      emitEvent({
        type: "round.state",
        roundId: "r-3",
        phase: "IN_PROGRESS",
        multiplier: 1.8,
        bets: [
          { betId: "b-other", playerId: "other-player", amountCents: "500", status: "active" },
        ],
      });
    });

    expect(screen.getByRole("button", { name: /cash out/i })).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// LiveBets — empty and accumulation
// ---------------------------------------------------------------------------

describe("GamePage — LiveBets", () => {
  it("shows 'No bets this round' before any bet.placed event arrives", () => {
    render(<GamePage />);
    act(() => emitConnectionState("connected"));
    act(() => emitEvent(bettingEvent()));
    expect(screen.getByText(/no bets this round/i)).toBeInTheDocument();
  });

  it("shows multiple bets when multiple players place bets", () => {
    render(<GamePage />);
    act(() => emitConnectionState("connected"));
    act(() => emitEvent(bettingEvent()));
    act(() => {
      emitEvent({ type: "bet.placed", roundId: "r-1", betId: "b-1", playerId: "p-1", amountCents: "1000" });
      emitEvent({ type: "bet.placed", roundId: "r-1", betId: "b-2", playerId: "p-2", amountCents: "500" });
    });
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// IN_PROGRESS without a pending bet (user didn't place before round started)
// ---------------------------------------------------------------------------

describe("GamePage — IN_PROGRESS without a pending bet", () => {
  beforeEach(() => {
    render(<GamePage />);
    act(() => emitConnectionState("connected"));
    act(() => emitEvent(bettingEvent()));
    // Do NOT place a bet — let the round start without one
    act(() => emitEvent(startedEvent()));
  });

  it("'Place Bet' button shows 'Betting Closed' and is disabled", () => {
    expect(screen.getByRole("button", { name: /betting closed/i })).toBeDisabled();
  });

  it("'Cash Out' button is disabled when player has no bet", () => {
    expect(screen.getByRole("button", { name: /cash out/i })).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// RoundHistory — empty and accumulation
// ---------------------------------------------------------------------------

describe("GamePage — RoundHistory", () => {
  it("shows 'No rounds yet' when history is empty on first connect", () => {
    render(<GamePage />);
    expect(screen.getByText(/no rounds yet/i)).toBeInTheDocument();
  });

  it("accumulates history across multiple rounds", () => {
    render(<GamePage />);
    act(() => emitConnectionState("connected"));

    for (const [roundId, mult] of [["r-1", 1.5], ["r-2", 3.0], ["r-3", 10.0]] as const) {
      act(() => {
        emitEvent(bettingEvent(roundId));
        emitEvent(startedEvent(roundId));
        emitEvent(crashedEvent(roundId, mult));
      });
    }

    const history = screen.getByRole("region", { name: /recent rounds/i });
    expect(within(history).getByText("1.50×")).toBeInTheDocument();
    expect(within(history).getByText("3.00×")).toBeInTheDocument();
    expect(within(history).getByText("10.00×")).toBeInTheDocument();
  });
});
