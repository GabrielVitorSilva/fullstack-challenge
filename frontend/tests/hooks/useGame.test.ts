import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mock GameSocketService before importing useGame
// ---------------------------------------------------------------------------

import type { GameSocketListener, ConnectionStateListener } from "@/services/gameSocket";

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

// Mock auth so useGame can call useAuth()
vi.mock("@/auth/useAuth", () => ({
  useAuth: () => ({
    user: {
      access_token: "test-token",
      profile: { sub: "user-42" },
    },
  }),
}));

// Mock REST game service
vi.mock("@/services/game", () => ({
  placeBet: vi.fn().mockResolvedValue(undefined),
  cashout: vi.fn().mockResolvedValue(undefined),
}));

import { useGame } from "@/hooks/useGame";
import type { GameServerEvent } from "@/services/ws-events";

function emitEvent(event: GameServerEvent) {
  mockEventListeners.forEach((l) => l(event));
}

function emitConnectionState(state: "connecting" | "connected" | "disconnected") {
  mockStateListeners.forEach((l) => l(state));
}

describe("useGame — shape and initial state", () => {
  beforeEach(() => {
    mockEventListeners.clear();
    mockStateListeners.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("starts in BETTING phase", () => {
    const { result } = renderHook(() => useGame());
    expect(result.current.phase).toBe("BETTING");
  });

  it("starts with multiplier 1.0", () => {
    const { result } = renderHook(() => useGame());
    expect(result.current.multiplier).toBe(1.0);
  });

  it("starts with connectionState = connecting", () => {
    const { result } = renderHook(() => useGame());
    expect(result.current.connectionState).toBe("connecting");
  });

  it("exposes placeBet and cashout as functions", () => {
    const { result } = renderHook(() => useGame());
    expect(typeof result.current.placeBet).toBe("function");
    expect(typeof result.current.cashout).toBe("function");
  });

  it("starts with no activeBet", () => {
    const { result } = renderHook(() => useGame());
    expect(result.current.activeBet).toBeNull();
  });

  it("history starts empty (no mock data)", () => {
    const { result } = renderHook(() => useGame());
    expect(result.current.history).toHaveLength(0);
  });
});

describe("useGame — WebSocket events", () => {
  beforeEach(() => {
    mockEventListeners.clear();
    mockStateListeners.clear();
    vi.clearAllMocks();
  });

  it("updates phase and roundId on round.betting", () => {
    const { result } = renderHook(() => useGame());
    act(() => {
      emitEvent({
        type: "round.betting",
        roundId: "r-1",
        bettingEndsAt: new Date(Date.now() + 10_000).toISOString(),
        hashedServerSeed: "a".repeat(64),
      });
    });
    expect(result.current.roundId).toBe("r-1");
    expect(result.current.phase).toBe("BETTING");
  });

  it("bettingCountdown is positive after round.betting", () => {
    const { result } = renderHook(() => useGame());
    act(() => {
      emitEvent({
        type: "round.betting",
        roundId: "r-1",
        bettingEndsAt: new Date(Date.now() + 8_000).toISOString(),
        hashedServerSeed: "a".repeat(64),
      });
    });
    expect(result.current.bettingCountdown).toBeGreaterThan(0);
  });

  it("transitions to IN_PROGRESS on round.started", () => {
    const { result } = renderHook(() => useGame());
    act(() => {
      emitEvent({ type: "round.started", roundId: "r-1", startedAt: new Date().toISOString() });
    });
    expect(result.current.phase).toBe("IN_PROGRESS");
  });

  it("updates multiplier on round.tick", () => {
    const { result } = renderHook(() => useGame());
    act(() => {
      emitEvent({ type: "round.betting", roundId: "r-1", bettingEndsAt: new Date(Date.now() + 5000).toISOString(), hashedServerSeed: "a".repeat(64) });
    });
    act(() => {
      emitEvent({ type: "round.started", roundId: "r-1", startedAt: new Date().toISOString() });
    });
    act(() => {
      emitEvent({ type: "round.tick", roundId: "r-1", multiplier: 1.42, elapsedMs: 5000 });
    });
    expect(result.current.multiplier).toBe(1.42);
  });

  it("ignores round.tick for a different roundId", () => {
    const { result } = renderHook(() => useGame());
    act(() => {
      emitEvent({ type: "round.betting", roundId: "r-1", bettingEndsAt: new Date(Date.now() + 5000).toISOString(), hashedServerSeed: "a".repeat(64) });
      emitEvent({ type: "round.started", roundId: "r-1", startedAt: new Date().toISOString() });
    });
    act(() => {
      emitEvent({ type: "round.tick", roundId: "r-DIFFERENT", multiplier: 99.0, elapsedMs: 5000 });
    });
    expect(result.current.multiplier).toBe(1.0);
  });

  it("transitions to CRASHED and prepends history on round.crashed", () => {
    const { result } = renderHook(() => useGame());
    act(() => {
      emitEvent({ type: "round.betting", roundId: "r-1", bettingEndsAt: new Date(Date.now() + 5000).toISOString(), hashedServerSeed: "a".repeat(64) });
      emitEvent({ type: "round.started", roundId: "r-1", startedAt: new Date().toISOString() });
    });
    act(() => {
      emitEvent({ type: "round.crashed", roundId: "r-1", crashMultiplier: 2.34 });
    });
    expect(result.current.phase).toBe("CRASHED");
    expect(result.current.multiplier).toBe(2.34);
    expect(result.current.history[0]).toEqual({ id: "r-1", crashMultiplier: 2.34 });
  });

  it("syncs state immediately on round.state (new client)", () => {
    const { result } = renderHook(() => useGame());
    act(() => {
      emitEvent({
        type: "round.state",
        roundId: "r-5",
        phase: "IN_PROGRESS",
        multiplier: 1.75,
      });
    });
    expect(result.current.roundId).toBe("r-5");
    expect(result.current.phase).toBe("IN_PROGRESS");
    expect(result.current.multiplier).toBe(1.75);
  });

  it("updates connectionState from socket events", () => {
    const { result } = renderHook(() => useGame());
    act(() => {
      emitConnectionState("connected");
    });
    expect(result.current.connectionState).toBe("connected");
  });
});

describe("useGame — bet tracking", () => {
  beforeEach(() => {
    mockEventListeners.clear();
    mockStateListeners.clear();
    vi.clearAllMocks();
  });

  it("sets activeBet after placeBet is called", () => {
    const { result } = renderHook(() => useGame());
    act(() => {
      emitEvent({
        type: "round.betting",
        roundId: "r-1",
        bettingEndsAt: new Date(Date.now() + 5000).toISOString(),
        hashedServerSeed: "a".repeat(64),
      });
    });
    act(() => {
      result.current.placeBet(1000n);
    });
    expect(result.current.activeBet).not.toBeNull();
    expect(result.current.activeBet?.amountCents).toBe(1000n);
    expect(result.current.activeBet?.cashedOut).toBe(false);
  });

  it("marks activeBet.cashedOut = true after cashout is called", () => {
    const { result } = renderHook(() => useGame());
    act(() => {
      emitEvent({
        type: "round.betting",
        roundId: "r-1",
        bettingEndsAt: new Date(Date.now() + 5000).toISOString(),
        hashedServerSeed: "a".repeat(64),
      });
    });
    act(() => {
      result.current.placeBet(1000n);
    });
    act(() => {
      emitEvent({ type: "round.started", roundId: "r-1", startedAt: new Date().toISOString() });
    });
    act(() => {
      result.current.cashout();
    });
    expect(result.current.activeBet?.cashedOut).toBe(true);
  });

  it("clears activeBet when a new round.betting is received", () => {
    const { result } = renderHook(() => useGame());
    act(() => {
      emitEvent({
        type: "round.betting",
        roundId: "r-1",
        bettingEndsAt: new Date(Date.now() + 5000).toISOString(),
        hashedServerSeed: "a".repeat(64),
      });
    });
    act(() => {
      result.current.placeBet(500n);
    });
    act(() => {
      emitEvent({
        type: "round.betting",
        roundId: "r-2",
        bettingEndsAt: new Date(Date.now() + 5000).toISOString(),
        hashedServerSeed: "b".repeat(64),
      });
    });
    expect(result.current.activeBet).toBeNull();
  });

  it("history is capped at 20 entries", () => {
    const { result } = renderHook(() => useGame());

    for (let i = 0; i < 25; i++) {
      act(() => {
        emitEvent({ type: "round.betting", roundId: `r-${i}`, bettingEndsAt: new Date(Date.now() + 5000).toISOString(), hashedServerSeed: "a".repeat(64) });
        emitEvent({ type: "round.started", roundId: `r-${i}`, startedAt: new Date().toISOString() });
        emitEvent({ type: "round.crashed", roundId: `r-${i}`, crashMultiplier: 1.5 });
      });
    }

    expect(result.current.history.length).toBeLessThanOrEqual(20);
  });
});

describe("useGame — live bets", () => {
  beforeEach(() => {
    mockEventListeners.clear();
    mockStateListeners.clear();
    vi.clearAllMocks();
  });

  function setupRound(roundId = "r-1") {
    emitEvent({
      type: "round.betting",
      roundId,
      bettingEndsAt: new Date(Date.now() + 5000).toISOString(),
      hashedServerSeed: "a".repeat(64),
    });
  }

  it("liveBets starts empty", () => {
    const { result } = renderHook(() => useGame());
    expect(result.current.liveBets).toHaveLength(0);
  });

  it("adds a bet to liveBets on bet.placed", () => {
    const { result } = renderHook(() => useGame());
    act(() => { setupRound(); });
    act(() => {
      emitEvent({ type: "bet.placed", roundId: "r-1", betId: "b-1", playerId: "player-42", amountCents: "1000" });
    });
    expect(result.current.liveBets).toHaveLength(1);
    expect(result.current.liveBets[0].betId).toBe("b-1");
    expect(result.current.liveBets[0].amountCents).toBe(1000n);
    expect(result.current.liveBets[0].status).toBe("active");
  });

  it("does not add duplicate bets (idempotent on bet.placed)", () => {
    const { result } = renderHook(() => useGame());
    act(() => { setupRound(); });
    act(() => {
      emitEvent({ type: "bet.placed", roundId: "r-1", betId: "b-1", playerId: "player-42", amountCents: "1000" });
      emitEvent({ type: "bet.placed", roundId: "r-1", betId: "b-1", playerId: "player-42", amountCents: "1000" });
    });
    expect(result.current.liveBets).toHaveLength(1);
  });

  it("ignores bet.placed for a different round", () => {
    const { result } = renderHook(() => useGame());
    act(() => { setupRound("r-1"); });
    act(() => {
      emitEvent({ type: "bet.placed", roundId: "r-DIFFERENT", betId: "b-1", playerId: "player-42", amountCents: "1000" });
    });
    expect(result.current.liveBets).toHaveLength(0);
  });

  it("updates bet to cashed_out on bet.cashedout", () => {
    const { result } = renderHook(() => useGame());
    act(() => { setupRound(); });
    act(() => {
      emitEvent({ type: "bet.placed", roundId: "r-1", betId: "b-1", playerId: "player-42", amountCents: "1000" });
    });
    act(() => {
      emitEvent({ type: "bet.cashedout", roundId: "r-1", betId: "b-1", playerId: "player-42", multiplier: 2.5, payoutCents: "2500" });
    });
    const bet = result.current.liveBets[0];
    expect(bet.status).toBe("cashed_out");
    expect(bet.cashoutMultiplier).toBe(2.5);
    expect(bet.payoutCents).toBe(2500n);
  });

  it("ignores bet.cashedout for a different round", () => {
    const { result } = renderHook(() => useGame());
    act(() => { setupRound(); });
    act(() => {
      emitEvent({ type: "bet.placed", roundId: "r-1", betId: "b-1", playerId: "player-42", amountCents: "1000" });
    });
    act(() => {
      emitEvent({ type: "bet.cashedout", roundId: "r-DIFFERENT", betId: "b-1", playerId: "player-42", multiplier: 2.5, payoutCents: "2500" });
    });
    expect(result.current.liveBets[0].status).toBe("active");
  });

  it("marks all active bets as lost on round.crashed", () => {
    const { result } = renderHook(() => useGame());
    act(() => { setupRound(); });
    act(() => {
      emitEvent({ type: "bet.placed", roundId: "r-1", betId: "b-1", playerId: "p-1", amountCents: "500" });
      emitEvent({ type: "bet.placed", roundId: "r-1", betId: "b-2", playerId: "p-2", amountCents: "1500" });
    });
    act(() => {
      emitEvent({ type: "round.started", roundId: "r-1", startedAt: new Date().toISOString() });
    });
    act(() => {
      emitEvent({ type: "round.crashed", roundId: "r-1", crashMultiplier: 1.12 });
    });
    expect(result.current.liveBets.every((b) => b.status === "lost")).toBe(true);
  });

  it("preserves cashed_out status on round.crashed (not overwritten to lost)", () => {
    const { result } = renderHook(() => useGame());
    act(() => { setupRound(); });
    act(() => {
      emitEvent({ type: "bet.placed", roundId: "r-1", betId: "b-1", playerId: "p-1", amountCents: "500" });
    });
    act(() => {
      emitEvent({ type: "round.started", roundId: "r-1", startedAt: new Date().toISOString() });
    });
    act(() => {
      emitEvent({ type: "bet.cashedout", roundId: "r-1", betId: "b-1", playerId: "p-1", multiplier: 2.0, payoutCents: "1000" });
    });
    act(() => {
      emitEvent({ type: "round.crashed", roundId: "r-1", crashMultiplier: 1.5 });
    });
    expect(result.current.liveBets[0].status).toBe("cashed_out");
  });

  it("clears liveBets on new round.betting", () => {
    const { result } = renderHook(() => useGame());
    act(() => { setupRound("r-1"); });
    act(() => {
      emitEvent({ type: "bet.placed", roundId: "r-1", betId: "b-1", playerId: "p-1", amountCents: "500" });
    });
    act(() => {
      emitEvent({
        type: "round.betting",
        roundId: "r-2",
        bettingEndsAt: new Date(Date.now() + 5000).toISOString(),
        hashedServerSeed: "b".repeat(64),
      });
    });
    expect(result.current.liveBets).toHaveLength(0);
  });

  it("clears liveBets on round.state with a new roundId and no snapshot", () => {
    const { result } = renderHook(() => useGame());
    act(() => { setupRound("r-1"); });
    act(() => {
      emitEvent({ type: "bet.placed", roundId: "r-1", betId: "b-1", playerId: "p-1", amountCents: "500" });
    });
    act(() => {
      emitEvent({ type: "round.state", roundId: "r-99", phase: "IN_PROGRESS", multiplier: 1.5 });
    });
    expect(result.current.liveBets).toHaveLength(0);
  });
});

describe("useGame — round.state snapshot hydration (late-join / reconnect)", () => {
  beforeEach(() => {
    mockEventListeners.clear();
    mockStateListeners.clear();
    vi.clearAllMocks();
  });

  it("hydrates liveBets from bets snapshot on new roundId", () => {
    const { result } = renderHook(() => useGame());
    act(() => {
      emitEvent({
        type: "round.state",
        roundId: "r-5",
        phase: "IN_PROGRESS",
        multiplier: 2.0,
        bets: [
          { betId: "b-1", playerId: "p-1", amountCents: "1000", status: "active" },
          { betId: "b-2", playerId: "p-2", amountCents: "500", status: "cashed_out" },
        ],
      });
    });
    expect(result.current.liveBets).toHaveLength(2);
    expect(result.current.liveBets[0]).toMatchObject({ betId: "b-1", status: "active", amountCents: 1000n });
    expect(result.current.liveBets[1]).toMatchObject({ betId: "b-2", status: "cashed_out", amountCents: 500n });
  });

  it("converts amountCents string to bigint during hydration", () => {
    const { result } = renderHook(() => useGame());
    act(() => {
      emitEvent({
        type: "round.state",
        roundId: "r-5",
        phase: "IN_PROGRESS",
        multiplier: 1.5,
        bets: [{ betId: "b-1", playerId: "p-1", amountCents: "99999", status: "active" }],
      });
    });
    expect(result.current.liveBets[0].amountCents).toBe(99999n);
  });

  it("hydrates empty liveBets when snapshot bets array is empty", () => {
    const { result } = renderHook(() => useGame());
    act(() => {
      emitEvent({ type: "round.state", roundId: "r-5", phase: "BETTING", multiplier: 1.0, bets: [] });
    });
    expect(result.current.liveBets).toHaveLength(0);
  });

  it("hydrates empty liveBets when snapshot has no bets field (backward compat)", () => {
    const { result } = renderHook(() => useGame());
    act(() => {
      emitEvent({ type: "round.state", roundId: "r-5", phase: "BETTING", multiplier: 1.0 });
    });
    expect(result.current.liveBets).toHaveLength(0);
  });

  it("reconciles liveBets with snapshot on same roundId (no duplicates)", () => {
    const { result } = renderHook(() => useGame());
    act(() => {
      emitEvent({
        type: "round.betting",
        roundId: "r-1",
        bettingEndsAt: new Date(Date.now() + 5000).toISOString(),
        hashedServerSeed: "a".repeat(64),
      });
    });
    act(() => {
      emitEvent({ type: "bet.placed", roundId: "r-1", betId: "b-local", playerId: "p-1", amountCents: "1000" });
    });
    // round.state for the same round (e.g. brief WebSocket reconnect):
    // snapshot is source of truth — bets are reconciled, not duplicated
    act(() => {
      emitEvent({
        type: "round.state",
        roundId: "r-1",
        phase: "IN_PROGRESS",
        multiplier: 1.3,
        bets: [{ betId: "b-local", playerId: "p-1", amountCents: "1000", status: "active" }],
      });
    });
    expect(result.current.liveBets).toHaveLength(1);
    expect(result.current.liveBets[0].betId).toBe("b-local");
    expect(result.current.liveBets[0].status).toBe("active");
  });

  it("updates stale active bet to cashed_out when server snapshot reflects missed cashout", () => {
    const { result } = renderHook(() => useGame());
    act(() => {
      emitEvent({
        type: "round.betting",
        roundId: "r-1",
        bettingEndsAt: new Date(Date.now() + 5000).toISOString(),
        hashedServerSeed: "a".repeat(64),
      });
    });
    act(() => {
      emitEvent({ type: "bet.placed", roundId: "r-1", betId: "b-1", playerId: "p-1", amountCents: "1000" });
    });
    // Client reconnects: snapshot shows bet was already cashed out (event was missed)
    act(() => {
      emitEvent({
        type: "round.state",
        roundId: "r-1",
        phase: "IN_PROGRESS",
        multiplier: 2.0,
        bets: [{ betId: "b-1", playerId: "p-1", amountCents: "1000", status: "cashed_out" }],
      });
    });
    expect(result.current.liveBets[0].status).toBe("cashed_out");
  });

  it("updates stale active bets to lost when snapshot reflects missed round crash", () => {
    const { result } = renderHook(() => useGame());
    act(() => {
      emitEvent({
        type: "round.betting",
        roundId: "r-1",
        bettingEndsAt: new Date(Date.now() + 5000).toISOString(),
        hashedServerSeed: "a".repeat(64),
      });
    });
    act(() => {
      emitEvent({ type: "bet.placed", roundId: "r-1", betId: "b-1", playerId: "p-1", amountCents: "500" });
      emitEvent({ type: "bet.placed", roundId: "r-1", betId: "b-2", playerId: "p-2", amountCents: "800" });
    });
    // Client reconnects after crash — snapshot shows both bets lost
    act(() => {
      emitEvent({
        type: "round.state",
        roundId: "r-1",
        phase: "CRASHED",
        multiplier: 1.15,
        bets: [
          { betId: "b-1", playerId: "p-1", amountCents: "500", status: "lost" },
          { betId: "b-2", playerId: "p-2", amountCents: "800", status: "lost" },
        ],
      });
    });
    expect(result.current.liveBets.every((b) => b.status === "lost")).toBe(true);
  });

  it("removes bets absent from the server snapshot (e.g. DEBIT_FAILED dropped server-side)", () => {
    const { result } = renderHook(() => useGame());
    act(() => {
      emitEvent({
        type: "round.betting",
        roundId: "r-1",
        bettingEndsAt: new Date(Date.now() + 5000).toISOString(),
        hashedServerSeed: "a".repeat(64),
      });
    });
    act(() => {
      emitEvent({ type: "bet.placed", roundId: "r-1", betId: "b-good", playerId: "p-1", amountCents: "1000" });
      emitEvent({ type: "bet.placed", roundId: "r-1", betId: "b-failed", playerId: "p-2", amountCents: "500" });
    });
    // Reconnect: server snapshot only includes b-good (b-failed was DEBIT_FAILED, excluded)
    act(() => {
      emitEvent({
        type: "round.state",
        roundId: "r-1",
        phase: "IN_PROGRESS",
        multiplier: 1.5,
        bets: [{ betId: "b-good", playerId: "p-1", amountCents: "1000", status: "active" }],
      });
    });
    expect(result.current.liveBets).toHaveLength(1);
    expect(result.current.liveBets[0].betId).toBe("b-good");
  });

  it("preserves cashoutMultiplier and payoutCents from local state on reconnect", () => {
    const { result } = renderHook(() => useGame());
    act(() => {
      emitEvent({
        type: "round.betting",
        roundId: "r-1",
        bettingEndsAt: new Date(Date.now() + 5000).toISOString(),
        hashedServerSeed: "a".repeat(64),
      });
    });
    act(() => {
      emitEvent({ type: "bet.placed", roundId: "r-1", betId: "b-1", playerId: "p-1", amountCents: "1000" });
    });
    act(() => {
      emitEvent({ type: "round.started", roundId: "r-1", startedAt: new Date().toISOString() });
    });
    // Cashout event arrives and sets the multiplier/payout locally
    act(() => {
      emitEvent({ type: "bet.cashedout", roundId: "r-1", betId: "b-1", playerId: "p-1", multiplier: 3.14, payoutCents: "3140" });
    });
    expect(result.current.liveBets[0].cashoutMultiplier).toBe(3.14);
    expect(result.current.liveBets[0].payoutCents).toBe(3140n);
    // Client reconnects: server confirms cashed_out but snapshot has no multiplier/payout
    act(() => {
      emitEvent({
        type: "round.state",
        roundId: "r-1",
        phase: "IN_PROGRESS",
        multiplier: 3.5,
        bets: [{ betId: "b-1", playerId: "p-1", amountCents: "1000", status: "cashed_out" }],
      });
    });
    const bet = result.current.liveBets[0];
    expect(bet.status).toBe("cashed_out");
    expect(bet.cashoutMultiplier).toBe(3.14);
    expect(bet.payoutCents).toBe(3140n);
  });

  it("snapshot with lost bets sets status to lost", () => {
    const { result } = renderHook(() => useGame());
    act(() => {
      emitEvent({
        type: "round.state",
        roundId: "r-crashed",
        phase: "CRASHED",
        multiplier: 1.2,
        bets: [
          { betId: "b-1", playerId: "p-1", amountCents: "1000", status: "lost" },
          { betId: "b-2", playerId: "p-2", amountCents: "2000", status: "cashed_out" },
        ],
      });
    });
    expect(result.current.liveBets.find((b) => b.betId === "b-1")?.status).toBe("lost");
    expect(result.current.liveBets.find((b) => b.betId === "b-2")?.status).toBe("cashed_out");
  });

  it("subsequent bet.placed events after snapshot hydration use dedup guard", () => {
    const { result } = renderHook(() => useGame());
    // Join mid-round with existing snapshot
    act(() => {
      emitEvent({
        type: "round.state",
        roundId: "r-5",
        phase: "IN_PROGRESS",
        multiplier: 1.5,
        bets: [{ betId: "b-1", playerId: "p-1", amountCents: "1000", status: "active" }],
      });
    });
    // A bet.placed for the same bet arrives (possible in race with snapshot)
    act(() => {
      emitEvent({ type: "bet.placed", roundId: "r-5", betId: "b-1", playerId: "p-1", amountCents: "1000" });
    });
    // Should not duplicate
    expect(result.current.liveBets).toHaveLength(1);
  });

  it("uses cashout details directly from snapshot (late-join without prior local state)", () => {
    const { result } = renderHook(() => useGame());
    act(() => {
      emitEvent({
        type: "round.state",
        roundId: "r-5",
        phase: "IN_PROGRESS",
        multiplier: 2.5,
        bets: [
          {
            betId: "b-1",
            playerId: "p-1",
            amountCents: "1000",
            status: "cashed_out",
            cashoutMultiplier: 2.5,
            payoutCents: "2500",
          },
        ],
      });
    });
    const bet = result.current.liveBets[0];
    expect(bet.status).toBe("cashed_out");
    expect(bet.cashoutMultiplier).toBe(2.5);
    expect(bet.payoutCents).toBe(2500n);
  });

  it("prefers snapshot cashout details over stale local state", () => {
    const { result } = renderHook(() => useGame());
    act(() => {
      emitEvent({
        type: "round.betting",
        roundId: "r-1",
        bettingEndsAt: new Date(Date.now() + 5000).toISOString(),
        hashedServerSeed: "a".repeat(64),
      });
    });
    act(() => {
      emitEvent({ type: "bet.placed", roundId: "r-1", betId: "b-1", playerId: "p-1", amountCents: "1000" });
    });
    act(() => {
      emitEvent({ type: "round.started", roundId: "r-1", startedAt: new Date().toISOString() });
    });
    act(() => {
      // Local cashout event with a stale multiplier (e.g. from a buggy client)
      emitEvent({ type: "bet.cashedout", roundId: "r-1", betId: "b-1", playerId: "p-1", multiplier: 1.11, payoutCents: "1110" });
    });
    // Server snapshot carries the authoritative details
    act(() => {
      emitEvent({
        type: "round.state",
        roundId: "r-1",
        phase: "IN_PROGRESS",
        multiplier: 2.0,
        bets: [{ betId: "b-1", playerId: "p-1", amountCents: "1000", status: "cashed_out", cashoutMultiplier: 2.0, payoutCents: "2000" }],
      });
    });
    const bet = result.current.liveBets[0];
    expect(bet.cashoutMultiplier).toBe(2.0);
    expect(bet.payoutCents).toBe(2000n);
  });
});

describe("useGame — round.state activeBet reconciliation on reconnect", () => {
  beforeEach(() => {
    mockEventListeners.clear();
    mockStateListeners.clear();
    vi.clearAllMocks();
  });

  // Place bet during BETTING phase, then advance to IN_PROGRESS
  function placeBetInRound(result: ReturnType<typeof renderHook<ReturnType<typeof useGame>, unknown>>["result"], roundId = "r-1") {
    act(() => {
      emitEvent({
        type: "round.betting",
        roundId,
        bettingEndsAt: new Date(Date.now() + 5000).toISOString(),
        hashedServerSeed: "a".repeat(64),
      });
    });
    act(() => { result.current.placeBet(1000n); });
    act(() => {
      emitEvent({ type: "round.started", roundId, startedAt: new Date().toISOString() });
    });
  }

  it("clears stale activeBet when snapshot shows bet was lost (missed round crash)", () => {
    const { result } = renderHook(() => useGame());
    placeBetInRound(result);
    const betId = result.current.activeBet!.betId;
    // Reconnect: round crashed, bet is lost in snapshot
    act(() => {
      emitEvent({
        type: "round.state",
        roundId: "r-1",
        phase: "CRASHED",
        multiplier: 1.15,
        bets: [{ betId, playerId: "user-42", amountCents: "1000", status: "lost" }],
      });
    });
    expect(result.current.activeBet).toBeNull();
  });

  it("updates activeBet.cashedOut when snapshot confirms missed cashout", () => {
    const { result } = renderHook(() => useGame());
    placeBetInRound(result);
    const betId = result.current.activeBet!.betId;
    // Reconnect: the bet was already cashed out
    act(() => {
      emitEvent({
        type: "round.state",
        roundId: "r-1",
        phase: "IN_PROGRESS",
        multiplier: 2.0,
        bets: [{ betId, playerId: "user-42", amountCents: "1000", status: "cashed_out" }],
      });
    });
    expect(result.current.activeBet).not.toBeNull();
    expect(result.current.activeBet?.cashedOut).toBe(true);
  });

  it("preserves activeBet unchanged when snapshot confirms bet still active", () => {
    const { result } = renderHook(() => useGame());
    placeBetInRound(result);
    const betId = result.current.activeBet!.betId;
    act(() => {
      emitEvent({
        type: "round.state",
        roundId: "r-1",
        phase: "IN_PROGRESS",
        multiplier: 1.5,
        bets: [{ betId, playerId: "user-42", amountCents: "1000", status: "active" }],
      });
    });
    expect(result.current.activeBet?.betId).toBe(betId);
    expect(result.current.activeBet?.cashedOut).toBe(false);
  });

  it("clears activeBet when bet not found in snapshot (debit failed server-side)", () => {
    const { result } = renderHook(() => useGame());
    placeBetInRound(result);
    // Reconnect: snapshot only has another player's bet, ours was DEBIT_FAILED
    act(() => {
      emitEvent({
        type: "round.state",
        roundId: "r-1",
        phase: "IN_PROGRESS",
        multiplier: 1.5,
        bets: [{ betId: "other-bet", playerId: "other-player", amountCents: "500", status: "active" }],
      });
    });
    expect(result.current.activeBet).toBeNull();
  });

  it("clears activeBet when snapshot is an empty array (no visible bets)", () => {
    const { result } = renderHook(() => useGame());
    placeBetInRound(result);
    act(() => {
      emitEvent({ type: "round.state", roundId: "r-1", phase: "IN_PROGRESS", multiplier: 1.2, bets: [] });
    });
    expect(result.current.activeBet).toBeNull();
  });

  it("preserves activeBet when round.state has no bets field (cannot determine status)", () => {
    const { result } = renderHook(() => useGame());
    placeBetInRound(result);
    // round.state without bets field: no snapshot info, keep activeBet as-is
    act(() => {
      emitEvent({ type: "round.state", roundId: "r-1", phase: "IN_PROGRESS", multiplier: 1.3 });
    });
    expect(result.current.activeBet).not.toBeNull();
  });

  it("always clears activeBet on new roundId regardless of snapshot", () => {
    const { result } = renderHook(() => useGame());
    placeBetInRound(result, "r-1");
    act(() => {
      emitEvent({
        type: "round.state",
        roundId: "r-2",
        phase: "BETTING",
        multiplier: 1.0,
        bets: [],
      });
    });
    expect(result.current.activeBet).toBeNull();
  });

  it("resets cashedOut to false when snapshot shows bet still active after optimistic cashout", () => {
    const { result } = renderHook(() => useGame());
    placeBetInRound(result);
    // Optimistic cashout sent — UI immediately reflects cashedOut = true
    act(() => { result.current.cashout(); });
    expect(result.current.activeBet?.cashedOut).toBe(true);
    const betId = result.current.activeBet!.betId;
    // Client reconnects; server snapshot shows bet still active (cashout not yet confirmed)
    act(() => {
      emitEvent({
        type: "round.state",
        roundId: "r-1",
        phase: "IN_PROGRESS",
        multiplier: 1.8,
        bets: [{ betId, playerId: "user-42", amountCents: "1000", status: "active" }],
      });
    });
    expect(result.current.activeBet?.betId).toBe(betId);
    expect(result.current.activeBet?.cashedOut).toBe(false);
  });

  it("keeps cashedOut true when snapshot confirms cashed_out after optimistic cashout", () => {
    const { result } = renderHook(() => useGame());
    placeBetInRound(result);
    act(() => { result.current.cashout(); });
    const betId = result.current.activeBet!.betId;
    // Server snapshot confirms the cashout
    act(() => {
      emitEvent({
        type: "round.state",
        roundId: "r-1",
        phase: "IN_PROGRESS",
        multiplier: 2.0,
        bets: [{ betId, playerId: "user-42", amountCents: "1000", status: "cashed_out" }],
      });
    });
    expect(result.current.activeBet?.cashedOut).toBe(true);
  });

  it("clears activeBet when snapshot omits bet after optimistic cashout", () => {
    const { result } = renderHook(() => useGame());
    placeBetInRound(result);
    act(() => { result.current.cashout(); });
    // Reconnect: snapshot is empty — bet was voided or debit failed server-side
    act(() => {
      emitEvent({
        type: "round.state",
        roundId: "r-1",
        phase: "IN_PROGRESS",
        multiplier: 1.5,
        bets: [],
      });
    });
    expect(result.current.activeBet).toBeNull();
  });
});
