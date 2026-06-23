import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { RoundLifecycleService, multiplierToHundredths } from "../../src/application/services/round-lifecycle.service";
import { InMemoryRoundRepository } from "../../src/infrastructure/persistence/in-memory-round-repository";
import { RoundStatus } from "../../src/domain/round-status";
import type { GameWsEvent } from "../../src/domain/game-events";
import { GAME_WS_EVENT } from "../../src/domain/game-events";

function buildService() {
  const repo = new InMemoryRoundRepository();
  // Prevent auto-start during tests
  const service = new RoundLifecycleService(repo);
  return { service, repo };
}

describe("RoundLifecycleService.computeMultiplier", () => {
  it("returns 1.00 at t=0", () => {
    const { service } = buildService();
    expect(service.computeMultiplier(0)).toBe(1.0);
  });

  it("returns a value > 1 at t=5000ms", () => {
    const { service } = buildService();
    expect(service.computeMultiplier(5_000)).toBeGreaterThan(1.0);
  });

  it("grows monotonically with time", () => {
    const { service } = buildService();
    const m1 = service.computeMultiplier(5_000);
    const m2 = service.computeMultiplier(10_000);
    const m3 = service.computeMultiplier(30_000);
    expect(m2).toBeGreaterThan(m1);
    expect(m3).toBeGreaterThan(m2);
  });

  it("stays at 1.00 for very small elapsed time", () => {
    const { service } = buildService();
    expect(service.computeMultiplier(10)).toBe(1.0);
  });
});

describe("RoundLifecycleService lifecycle", () => {
  let service: RoundLifecycleService;
  let repo: InMemoryRoundRepository;
  const collected: GameWsEvent[] = [];

  beforeEach(() => {
    collected.length = 0;
    ({ service, repo } = buildService());
    service.setBroadcast((e) => collected.push(e));
  });

  afterEach(() => {
    service.stop();
  });

  it("broadcasts round.betting on start", async () => {
    // Manually trigger betting phase (avoid timer side effects in tests)
    // We call the public start path via onModuleInit
    service.onModuleInit();

    // Give the async beginBettingPhase a chance to run
    await new Promise((r) => setTimeout(r, 10));

    expect(collected.some((e) => e.type === GAME_WS_EVENT.ROUND_BETTING)).toBe(true);
  });

  it("sets currentRound after betting phase starts", async () => {
    service.onModuleInit();
    await new Promise((r) => setTimeout(r, 10));

    expect(service.getCurrentRound()).not.toBeNull();
  });

  it("currentMultiplier starts at 1.00", async () => {
    service.onModuleInit();
    await new Promise((r) => setTimeout(r, 10));

    expect(service.getCurrentMultiplier()).toBe(1.0);
  });

  it("round.betting event has required fields", async () => {
    service.onModuleInit();
    await new Promise((r) => setTimeout(r, 10));

    const betting = collected.find((e) => e.type === GAME_WS_EVENT.ROUND_BETTING);
    expect(betting).toBeDefined();
    if (betting?.type !== GAME_WS_EVENT.ROUND_BETTING) return;
    expect(typeof betting.roundId).toBe("string");
    expect(typeof betting.bettingEndsAt).toBe("string");
    expect(typeof betting.hashedServerSeed).toBe("string");
    expect(betting.hashedServerSeed).toHaveLength(64);
  });

  it("stop() prevents new broadcasts", async () => {
    service.onModuleInit();
    await new Promise((r) => setTimeout(r, 10));

    const countBefore = collected.length;
    service.stop();
    await new Promise((r) => setTimeout(r, 20));
    expect(collected.length).toBe(countBefore);
  });

  it("broadcastBetPlaced emits bet.placed event", async () => {
    service.onModuleInit();
    await new Promise((r) => setTimeout(r, 10));

    const round = service.getCurrentRound()!;
    service.broadcastBetPlaced({
      roundId: round.id,
      betId: "bet-1",
      playerId: "player-1",
      amountCents: "1000",
    });

    const evt = collected.find((e) => e.type === GAME_WS_EVENT.BET_PLACED);
    expect(evt).toBeDefined();
    if (evt?.type !== GAME_WS_EVENT.BET_PLACED) return;
    expect(evt.betId).toBe("bet-1");
    expect(evt.amountCents).toBe("1000");
  });

  it("broadcastCashout emits bet.cashedout event", async () => {
    service.onModuleInit();
    await new Promise((r) => setTimeout(r, 10));

    const round = service.getCurrentRound()!;
    service.broadcastCashout({
      roundId: round.id,
      betId: "bet-1",
      playerId: "player-1",
      multiplier: 1.5,
      payoutCents: "1500",
    });

    const evt = collected.find((e) => e.type === GAME_WS_EVENT.BET_CASHEDOUT);
    expect(evt).toBeDefined();
    if (evt?.type !== GAME_WS_EVENT.BET_CASHEDOUT) return;
    expect(evt.multiplier).toBe(1.5);
    expect(evt.payoutCents).toBe("1500");
  });

  it("getCashoutDetail returns undefined before any cashout", () => {
    const { service } = buildService();
    expect(service.getCashoutDetail("bet-unknown")).toBeUndefined();
  });

  it("getCashoutDetail returns detail after broadcastCashout", async () => {
    service.onModuleInit();
    await new Promise((r) => setTimeout(r, 10));

    const round = service.getCurrentRound()!;
    service.broadcastCashout({
      roundId: round.id,
      betId: "bet-42",
      playerId: "player-1",
      multiplier: 2.5,
      payoutCents: "2500",
    });

    const detail = service.getCashoutDetail("bet-42");
    expect(detail).toBeDefined();
    expect(detail?.multiplier).toBe(2.5);
    expect(detail?.payoutCents).toBe("2500");
  });

  it("getCashoutDetail returns undefined for a different betId", async () => {
    service.onModuleInit();
    await new Promise((r) => setTimeout(r, 10));

    const round = service.getCurrentRound()!;
    service.broadcastCashout({
      roundId: round.id,
      betId: "bet-A",
      playerId: "player-1",
      multiplier: 2.0,
      payoutCents: "2000",
    });

    expect(service.getCashoutDetail("bet-B")).toBeUndefined();
  });

  it("saves round to repository on start", async () => {
    service.onModuleInit();
    await new Promise((r) => setTimeout(r, 10));

    const round = service.getCurrentRound()!;
    const persisted = await repo.findById(round.id);
    expect(persisted).toBeDefined();
    expect(persisted?.status).toBe(RoundStatus.BETTING);
  });
});

// ---------------------------------------------------------------------------
// multiplierToHundredths — precision regression tests
// ---------------------------------------------------------------------------

describe("multiplierToHundredths", () => {
  it("converts 1.00 → 100n", () => {
    expect(multiplierToHundredths(1.0)).toBe(100n);
  });

  it("converts 1.50 → 150n", () => {
    expect(multiplierToHundredths(1.5)).toBe(150n);
  });

  it("converts 2.00 → 200n", () => {
    expect(multiplierToHundredths(2.0)).toBe(200n);
  });

  it("converts 10.00 → 1000n", () => {
    expect(multiplierToHundredths(10.0)).toBe(1000n);
  });

  // Cases where Math.floor(multiplier * 100) produces the wrong answer
  it("1.13 → 113n (not 112 as Math.floor would give)", () => {
    // parseFloat("1.13") * 100 = 112.9999... in IEEE 754
    expect(multiplierToHundredths(1.13)).toBe(113n);
  });

  it("1.14 → 114n (not 113 as Math.floor would give)", () => {
    // parseFloat("1.14") * 100 = 113.9999... in IEEE 754
    expect(multiplierToHundredths(1.14)).toBe(114n);
  });

  it("1.15 → 115n (not 114 as Math.floor would give)", () => {
    expect(multiplierToHundredths(1.15)).toBe(115n);
  });

  it("2.01 → 201n (not 200 as Math.floor would give)", () => {
    // parseFloat("2.01") * 100 = 200.9999... in IEEE 754
    expect(multiplierToHundredths(2.01)).toBe(201n);
  });

  it("is consistent with Math.round for all 2dp values 1.00–9.99", () => {
    // Exhaustive check: multiplierToHundredths must equal Math.round(m * 100)
    // for every value that computeMultiplier can return.
    for (let cents = 100; cents <= 999; cents++) {
      const m = parseFloat((cents / 100).toFixed(2));
      const expected = BigInt(Math.round(m * 100)); // Math.round is correct; Math.floor is not
      expect(multiplierToHundredths(m)).toBe(expected);
    }
  });

  it("payout calculation is exact: 1000 cents × 1.14 = 1140 cents", () => {
    const betCents = 1000n;
    const hundredths = multiplierToHundredths(1.14);
    const payout = (betCents * hundredths) / 100n;
    expect(payout).toBe(1140n);
  });

  it("payout calculation is exact: 1000 cents × 1.13 = 1130 cents", () => {
    const betCents = 1000n;
    const hundredths = multiplierToHundredths(1.13);
    const payout = (betCents * hundredths) / 100n;
    expect(payout).toBe(1130n);
  });
});

describe("RoundLifecycleService.getCurrentMultiplierHundredths", () => {
  it("returns 100n (1.00x) on initial state", () => {
    const { service } = buildService();
    expect(service.getCurrentMultiplierHundredths()).toBe(100n);
  });

  it("returns 100n after betting phase starts", async () => {
    const { service } = buildService();
    service.setBroadcast(() => {});
    service.onModuleInit();
    await new Promise((r) => setTimeout(r, 10));
    expect(service.getCurrentMultiplierHundredths()).toBe(100n);
    service.stop();
  });

  it("stays in sync with getCurrentMultiplier()", async () => {
    const { service } = buildService();
    service.setBroadcast(() => {});
    service.onModuleInit();
    await new Promise((r) => setTimeout(r, 10));

    const displayMultiplier = service.getCurrentMultiplier();
    const hundredths = service.getCurrentMultiplierHundredths();
    // They must agree: hundredths / 100 === displayMultiplier (no drift)
    expect(hundredths).toBe(multiplierToHundredths(displayMultiplier));
    service.stop();
  });
});
