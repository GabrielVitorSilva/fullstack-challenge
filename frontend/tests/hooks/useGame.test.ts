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
