import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseGameEvent } from "@/services/ws-events";
import { GameSocketService } from "@/services/gameSocket";
import type { GameServerEvent } from "@/services/ws-events";

// ---------------------------------------------------------------------------
// parseGameEvent
// ---------------------------------------------------------------------------

describe("parseGameEvent", () => {
  it("parses a round.betting event", () => {
    const raw = JSON.stringify({
      type: "round.betting",
      roundId: "abc",
      bettingEndsAt: "2025-01-01T00:00:10Z",
      hashedServerSeed: "a".repeat(64),
    });
    const result = parseGameEvent(raw);
    expect(result?.type).toBe("round.betting");
  });

  it("parses a round.tick event", () => {
    const raw = JSON.stringify({
      type: "round.tick",
      roundId: "abc",
      multiplier: 1.42,
      elapsedMs: 5000,
    });
    const result = parseGameEvent(raw);
    expect(result?.type).toBe("round.tick");
    if (result?.type !== "round.tick") return;
    expect(result.multiplier).toBe(1.42);
    expect(result.elapsedMs).toBe(5000);
  });

  it("parses a round.crashed event", () => {
    const raw = JSON.stringify({ type: "round.crashed", roundId: "abc", crashMultiplier: 3.14 });
    const result = parseGameEvent(raw);
    expect(result?.type).toBe("round.crashed");
    if (result?.type !== "round.crashed") return;
    expect(result.crashMultiplier).toBe(3.14);
  });

  it("parses a round.state event", () => {
    const raw = JSON.stringify({
      type: "round.state",
      roundId: "abc",
      phase: "IN_PROGRESS",
      multiplier: 1.5,
    });
    const result = parseGameEvent(raw);
    expect(result?.type).toBe("round.state");
    if (result?.type !== "round.state") return;
    expect(result.phase).toBe("IN_PROGRESS");
  });

  it("parses a bet.placed event", () => {
    const raw = JSON.stringify({
      type: "bet.placed",
      roundId: "abc",
      betId: "bet-1",
      playerId: "user-1",
      amountCents: "1000",
    });
    const result = parseGameEvent(raw);
    expect(result?.type).toBe("bet.placed");
  });

  it("parses a bet.cashedout event", () => {
    const raw = JSON.stringify({
      type: "bet.cashedout",
      roundId: "abc",
      betId: "bet-1",
      playerId: "user-1",
      multiplier: 2.0,
      payoutCents: "2000",
    });
    const result = parseGameEvent(raw);
    expect(result?.type).toBe("bet.cashedout");
    if (result?.type !== "bet.cashedout") return;
    expect(result.payoutCents).toBe("2000");
  });

  it("returns null for invalid JSON", () => {
    expect(parseGameEvent("not json")).toBeNull();
  });

  it("returns null for JSON without a type field", () => {
    expect(parseGameEvent('{"foo":"bar"}')).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseGameEvent("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// GameSocketService
// ---------------------------------------------------------------------------

class MockWebSocket {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  });
  send = vi.fn();

  simulateOpen() {
    this.onopen?.();
  }
  simulateMessage(data: string) {
    this.onmessage?.({ data });
  }
  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }
}

describe("GameSocketService", () => {
  let mockWs: MockWebSocket;

  beforeEach(() => {
    mockWs = new MockWebSocket();
    vi.stubGlobal("WebSocket", vi.fn(() => mockWs));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sets connectionState to connecting on connect()", () => {
    const service = new GameSocketService("ws://test");
    const states: string[] = [];
    service.onConnectionState((s) => states.push(s));
    service.connect();
    expect(states).toContain("connecting");
  });

  it("sets connectionState to connected after socket open", () => {
    const service = new GameSocketService("ws://test");
    const states: string[] = [];
    service.onConnectionState((s) => states.push(s));
    service.connect();
    mockWs.simulateOpen();
    expect(states[states.length - 1]).toBe("connected");
  });

  it("dispatches parsed events to listeners", () => {
    const service = new GameSocketService("ws://test");
    const received: GameServerEvent[] = [];
    service.onEvent((e) => received.push(e));
    service.connect();
    mockWs.simulateOpen();

    const payload = JSON.stringify({
      type: "round.tick",
      roundId: "r1",
      multiplier: 1.5,
      elapsedMs: 3000,
    });
    mockWs.simulateMessage(payload);

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe("round.tick");
  });

  it("does not dispatch on invalid JSON", () => {
    const service = new GameSocketService("ws://test");
    const received: GameServerEvent[] = [];
    service.onEvent((e) => received.push(e));
    service.connect();
    mockWs.simulateOpen();
    mockWs.simulateMessage("garbage");
    expect(received).toHaveLength(0);
  });

  it("unsubscribes listener when returned cleanup is called", () => {
    const service = new GameSocketService("ws://test");
    const received: GameServerEvent[] = [];
    const unsub = service.onEvent((e) => received.push(e));
    service.connect();
    mockWs.simulateOpen();
    unsub();
    mockWs.simulateMessage(
      JSON.stringify({ type: "round.tick", roundId: "r1", multiplier: 1.1, elapsedMs: 1000 }),
    );
    expect(received).toHaveLength(0);
  });

  it("disconnect() closes the socket", () => {
    const service = new GameSocketService("ws://test");
    service.connect();
    service.disconnect();
    expect(mockWs.close).toHaveBeenCalled();
  });

  it("does not reconnect after disconnect()", () => {
    vi.useFakeTimers();
    const service = new GameSocketService("ws://test");
    service.connect();
    mockWs.simulateOpen();
    service.disconnect();
    mockWs.simulateClose();

    vi.advanceTimersByTime(2000);
    // WebSocket constructor should only have been called once
    expect(vi.mocked(WebSocket)).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
