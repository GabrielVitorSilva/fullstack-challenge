import { describe, it, expect } from "bun:test";
import { betStatusToSnapshotStatus } from "../../src/domain/game-events";
import { BetStatus } from "../../src/domain/bet-status";
import { GameGateway } from "../../src/presentation/gateways/game.gateway";
import { Round } from "../../src/domain/round";
import { Bet } from "../../src/domain/bet";
import { Money } from "../../src/domain/money";
import { BetStatus as BS } from "../../src/domain/bet-status";
import { RoundStatus } from "../../src/domain/round-status";
import { GAME_WS_EVENT } from "../../src/domain/game-events";
import type { RoundStateEvent } from "../../src/domain/game-events";
import { WebSocket } from "ws";

// ---------------------------------------------------------------------------
// betStatusToSnapshotStatus — pure mapping tests
// ---------------------------------------------------------------------------

describe("betStatusToSnapshotStatus", () => {
  it("maps PENDING_DEBIT to active", () => {
    expect(betStatusToSnapshotStatus(BetStatus.PENDING_DEBIT)).toBe("active");
  });

  it("maps CONFIRMED to active", () => {
    expect(betStatusToSnapshotStatus(BetStatus.CONFIRMED)).toBe("active");
  });

  it("maps CASHED_OUT to cashed_out", () => {
    expect(betStatusToSnapshotStatus(BetStatus.CASHED_OUT)).toBe("cashed_out");
  });

  it("maps LOST to lost", () => {
    expect(betStatusToSnapshotStatus(BetStatus.LOST)).toBe("lost");
  });

  it("returns null for DEBIT_FAILED (internal state)", () => {
    expect(betStatusToSnapshotStatus(BetStatus.DEBIT_FAILED)).toBeNull();
  });

  it("returns null for VOIDED (internal state)", () => {
    expect(betStatusToSnapshotStatus(BetStatus.VOIDED)).toBeNull();
  });

  it("returns null for VOIDED_COMPENSATED (internal state)", () => {
    expect(betStatusToSnapshotStatus(BetStatus.VOIDED_COMPENSATED)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// GameGateway.handleConnection — snapshot in round.state
// ---------------------------------------------------------------------------

function makeMockClient(): { sent: RoundStateEvent[]; ws: WebSocket } {
  const sent: RoundStateEvent[] = [];
  const ws = {
    readyState: WebSocket.OPEN,
    send: (payload: string) => sent.push(JSON.parse(payload) as RoundStateEvent),
  } as unknown as WebSocket;
  return { sent, ws };
}

function makeBet(id: string, playerId: string, amountCents: bigint, status: BS): Bet {
  const bet = Bet.rehydrate(id, playerId, Money.ofCents(amountCents), status);
  return bet;
}

function makeRoundWithBets(bets: Bet[]): Round {
  const round = Round.rehydrate("r-1", RoundStatus.IN_PROGRESS, bets);
  return round;
}

function buildGateway(
  round: Round | null,
  multiplier = 1.5,
  bettingEndsAt: string | null = null,
  cashoutDetails: Map<string, { multiplier: number; payoutCents: string }> = new Map(),
) {
  const mockLifecycle = {
    getCurrentRound: () => round,
    getCurrentMultiplier: () => multiplier,
    getCurrentMultiplierHundredths: () => BigInt(Math.round(multiplier * 100)),
    getCurrentBettingEndsAt: () => bettingEndsAt,
    getCashoutDetail: (betId: string) => cashoutDetails.get(betId),
    setBroadcast: () => {},
    broadcastBetPlaced: () => {},
    broadcastCashout: () => {},
    stop: () => {},
    onModuleInit: () => {},
    onModuleDestroy: () => {},
    computeMultiplier: () => multiplier,
  } as never;

  return new GameGateway(mockLifecycle);
}

describe("GameGateway.handleConnection — round.state snapshot", () => {
  it("sends round.state with no bets when round has no bets", () => {
    const round = makeRoundWithBets([]);
    const gateway = buildGateway(round);
    const { sent, ws } = makeMockClient();

    gateway.handleConnection(ws);

    expect(sent).toHaveLength(1);
    expect(sent[0].type).toBe(GAME_WS_EVENT.ROUND_STATE);
    expect(sent[0].bets).toBeUndefined();
  });

  it("sends nothing when no current round exists", () => {
    const gateway = buildGateway(null);
    const { sent, ws } = makeMockClient();

    gateway.handleConnection(ws);

    expect(sent).toHaveLength(0);
  });

  it("includes active bet (CONFIRMED status) in snapshot", () => {
    const bet = makeBet("b-1", "player-1", 1000n, BS.CONFIRMED);
    const round = makeRoundWithBets([bet]);
    const gateway = buildGateway(round);
    const { sent, ws } = makeMockClient();

    gateway.handleConnection(ws);

    expect(sent[0].bets).toHaveLength(1);
    expect(sent[0].bets![0]).toEqual({
      betId: "b-1",
      playerId: "player-1",
      amountCents: "1000",
      status: "active",
    });
  });

  it("includes active bet (PENDING_DEBIT status) in snapshot", () => {
    const bet = makeBet("b-2", "player-2", 500n, BS.PENDING_DEBIT);
    const round = makeRoundWithBets([bet]);
    const gateway = buildGateway(round);
    const { sent, ws } = makeMockClient();

    gateway.handleConnection(ws);

    expect(sent[0].bets![0].status).toBe("active");
  });

  it("includes cashed_out bet in snapshot", () => {
    const bet = makeBet("b-3", "player-3", 2000n, BS.CASHED_OUT);
    const round = makeRoundWithBets([bet]);
    const gateway = buildGateway(round);
    const { sent, ws } = makeMockClient();

    gateway.handleConnection(ws);

    expect(sent[0].bets![0].status).toBe("cashed_out");
  });

  it("includes lost bet in snapshot", () => {
    const bet = makeBet("b-4", "player-4", 750n, BS.LOST);
    const round = makeRoundWithBets([bet]);
    const gateway = buildGateway(round);
    const { sent, ws } = makeMockClient();

    gateway.handleConnection(ws);

    expect(sent[0].bets![0].status).toBe("lost");
  });

  it("excludes DEBIT_FAILED bets from snapshot", () => {
    const bet = makeBet("b-5", "player-5", 300n, BS.DEBIT_FAILED);
    const round = makeRoundWithBets([bet]);
    const gateway = buildGateway(round);
    const { sent, ws } = makeMockClient();

    gateway.handleConnection(ws);

    expect(sent[0].bets).toBeUndefined();
  });

  it("excludes VOIDED bets from snapshot", () => {
    const bet = makeBet("b-6", "player-6", 300n, BS.VOIDED);
    const round = makeRoundWithBets([bet]);
    const gateway = buildGateway(round);
    const { sent, ws } = makeMockClient();

    gateway.handleConnection(ws);

    expect(sent[0].bets).toBeUndefined();
  });

  it("excludes VOIDED_COMPENSATED bets from snapshot", () => {
    const bet = makeBet("b-7", "player-7", 300n, BS.VOIDED_COMPENSATED);
    const round = makeRoundWithBets([bet]);
    const gateway = buildGateway(round);
    const { sent, ws } = makeMockClient();

    gateway.handleConnection(ws);

    expect(sent[0].bets).toBeUndefined();
  });

  it("includes only visible bets when mixed statuses are present", () => {
    const bets = [
      makeBet("b-1", "p-1", 1000n, BS.CONFIRMED),
      makeBet("b-2", "p-2", 500n, BS.DEBIT_FAILED),
      makeBet("b-3", "p-3", 750n, BS.CASHED_OUT),
      makeBet("b-4", "p-4", 200n, BS.VOIDED),
      makeBet("b-5", "p-5", 900n, BS.LOST),
    ];
    const round = makeRoundWithBets(bets);
    const gateway = buildGateway(round);
    const { sent, ws } = makeMockClient();

    gateway.handleConnection(ws);

    expect(sent[0].bets).toHaveLength(3);
    const ids = sent[0].bets!.map((b) => b.betId);
    expect(ids).toContain("b-1");
    expect(ids).toContain("b-3");
    expect(ids).toContain("b-5");
    expect(ids).not.toContain("b-2");
    expect(ids).not.toContain("b-4");
  });

  it("includes bettingEndsAt in BETTING phase", () => {
    const bettingEndsAt = new Date(Date.now() + 5000).toISOString();
    const round = Round.rehydrate("r-1", RoundStatus.BETTING, []);
    const gateway = buildGateway(round, 1.0, bettingEndsAt);
    const { sent, ws } = makeMockClient();

    gateway.handleConnection(ws);

    expect(sent[0].bettingEndsAt).toBe(bettingEndsAt);
    expect(sent[0].phase).toBe("BETTING");
  });

  it("includes cashoutMultiplier and payoutCents for cashed_out bet when cached", () => {
    const bet = makeBet("b-cash", "player-1", 1000n, BS.CASHED_OUT);
    const round = makeRoundWithBets([bet]);
    const cashoutDetails = new Map([
      ["b-cash", { multiplier: 3.14, payoutCents: "3140" }],
    ]);
    const gateway = buildGateway(round, 3.14, null, cashoutDetails);
    const { sent, ws } = makeMockClient();

    gateway.handleConnection(ws);

    const snap = sent[0].bets![0];
    expect(snap.status).toBe("cashed_out");
    expect(snap.cashoutMultiplier).toBe(3.14);
    expect(snap.payoutCents).toBe("3140");
  });

  it("omits cashout details for cashed_out bet when cache is cold (e.g. after restart)", () => {
    const bet = makeBet("b-cash", "player-1", 1000n, BS.CASHED_OUT);
    const round = makeRoundWithBets([bet]);
    const gateway = buildGateway(round); // no cashout details map
    const { sent, ws } = makeMockClient();

    gateway.handleConnection(ws);

    const snap = sent[0].bets![0];
    expect(snap.status).toBe("cashed_out");
    expect(snap.cashoutMultiplier).toBeUndefined();
    expect(snap.payoutCents).toBeUndefined();
  });

  it("only enriches cashed_out bets — active and lost bets have no cashout fields", () => {
    const bets = [
      makeBet("b-active", "p-1", 500n, BS.CONFIRMED),
      makeBet("b-lost",   "p-2", 800n, BS.LOST),
    ];
    const cashoutDetails = new Map([
      ["b-active", { multiplier: 2.0, payoutCents: "1000" }], // should be ignored
      ["b-lost",   { multiplier: 1.1, payoutCents: "880"  }], // should be ignored
    ]);
    const round = makeRoundWithBets(bets);
    const gateway = buildGateway(round, 2.0, null, cashoutDetails);
    const { sent, ws } = makeMockClient();

    gateway.handleConnection(ws);

    const active = sent[0].bets!.find((b) => b.betId === "b-active")!;
    const lost   = sent[0].bets!.find((b) => b.betId === "b-lost")!;
    expect(active.cashoutMultiplier).toBeUndefined();
    expect(lost.cashoutMultiplier).toBeUndefined();
  });
});
