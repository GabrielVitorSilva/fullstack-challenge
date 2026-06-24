/**
 * Service-level E2E tests for the bet lifecycle.
 *
 * These tests wire together real instances of all in-process components:
 *   - BetsController (presentation) — exercises the HTTP handler logic
 *   - PlaceBetUseCase, CashoutUseCase, HandleWalletDebitedUseCase (application)
 *   - InMemoryRoundRepository, InMemoryOutbox, InMemoryEventPublisher (infra)
 *
 * The RoundLifecycleService is replaced with a minimal stub that avoids real
 * timers, while still exercising the broadcast calls from the controller.
 *
 * External transport (HTTP, WebSocket, message broker) is not involved —
 * use these to verify the full application logic chain, not the protocol.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { NotFoundException } from "@nestjs/common";
import { Round } from "../../src/domain/round";
import { Bet } from "../../src/domain/bet";
import { Money } from "../../src/domain/money";
import { BetStatus } from "../../src/domain/bet-status";
import { RoundStatus } from "../../src/domain/round-status";
import { PlaceBetUseCase } from "../../src/application/use-cases/place-bet.use-case";
import { CashoutUseCase } from "../../src/application/use-cases/cashout.use-case";
import { HandleWalletDebitedUseCase } from "../../src/application/use-cases/handle-wallet-debited.use-case";
import { InMemoryRoundRepository } from "../../src/infrastructure/persistence/in-memory-round-repository";
import { InMemoryEventPublisher } from "../../src/infrastructure/messaging/in-memory-event-publisher";
import { InMemoryOutbox } from "../../src/infrastructure/messaging/in-memory-outbox";
import { BetsController } from "../../src/presentation/controllers/bets.controller";
import { GAME_WS_EVENT, type GameWsEvent } from "../../src/domain/game-events";
import type { RoundLifecycleService } from "../../src/application/services/round-lifecycle.service";
import { buildWalletDebitedEvent } from "@crash/contracts";
import { CREDIT_WALLET_COMMAND, DEBIT_WALLET_COMMAND } from "@crash/contracts";
import type { BetPlacedEvent, BetCashedOutEvent } from "../../src/domain/game-events";

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

interface Harness {
  repo: InMemoryRoundRepository;
  publisher: InMemoryEventPublisher;
  handleDebitedUseCase: HandleWalletDebitedUseCase;
  controller: BetsController;
  broadcasts: GameWsEvent[];
  /** Set this to the round the controller should consider active. */
  setActiveRound(round: Round | null): void;
  setMultiplier(multiplierHundredths: bigint, multiplierFloat: number): void;
}

function buildHarness(): Harness {
  const repo = new InMemoryRoundRepository();
  const publisher = new InMemoryEventPublisher();
  const outbox = new InMemoryOutbox(repo, publisher);

  const placeBetUseCase = new PlaceBetUseCase(repo, outbox);
  const cashoutUseCase = new CashoutUseCase(repo, outbox);
  const handleDebitedUseCase = new HandleWalletDebitedUseCase(repo, outbox);

  const broadcasts: GameWsEvent[] = [];

  let activeRound: Round | null = null;
  let multiplierHundredths = 150n; // 1.50×
  let multiplierFloat = 1.5;

  const lifecycleStub = {
    getCurrentRound: () => activeRound,
    getCurrentMultiplier: () => multiplierFloat,
    getCurrentMultiplierHundredths: () => multiplierHundredths,
    broadcastBetPlaced: (event: Omit<BetPlacedEvent, "type">) => {
      broadcasts.push({ type: GAME_WS_EVENT.BET_PLACED, ...event });
    },
    broadcastCashout: (event: Omit<BetCashedOutEvent, "type">) => {
      broadcasts.push({ type: GAME_WS_EVENT.BET_CASHEDOUT, ...event });
    },
  } as unknown as RoundLifecycleService;

  const controller = new BetsController(placeBetUseCase, cashoutUseCase, lifecycleStub);

  return {
    repo,
    publisher,
    handleDebitedUseCase,
    controller,
    broadcasts,
    setActiveRound: (round) => { activeRound = round; },
    setMultiplier: (hundredths, float) => {
      multiplierHundredths = hundredths;
      multiplierFloat = float;
    },
  };
}

// ---------------------------------------------------------------------------
// Place bet
// ---------------------------------------------------------------------------

describe("BetsController — place bet", () => {
  let h: Harness;
  let round: Round;

  beforeEach(async () => {
    h = buildHarness();
    round = new Round("round-1");
    await h.repo.save(round);
    h.setActiveRound(round);
  });

  it("registers the bet as PENDING_DEBIT in the repository", async () => {
    await h.controller.placeBet("round-1", {
      betId: "bet-1",
      playerId: "player-1",
      amountCents: "1000",
    });

    const saved = await h.repo.findById("round-1");
    expect(saved?.bets).toHaveLength(1);
    expect(saved?.bets[0].status).toBe(BetStatus.PENDING_DEBIT);
  });

  it("broadcasts a bet.placed event immediately after placing", async () => {
    await h.controller.placeBet("round-1", {
      betId: "bet-1",
      playerId: "player-1",
      amountCents: "1000",
    });

    expect(h.broadcasts).toHaveLength(1);
    const event = h.broadcasts[0];
    expect(event.type).toBe(GAME_WS_EVENT.BET_PLACED);
    if (event.type !== GAME_WS_EVENT.BET_PLACED) return;
    expect(event.betId).toBe("bet-1");
    expect(event.roundId).toBe("round-1");
    expect(event.playerId).toBe("player-1");
    expect(event.amountCents).toBe("1000");
  });

  it("emits a DebitWalletCommand via the outbox", async () => {
    await h.controller.placeBet("round-1", {
      betId: "bet-1",
      playerId: "player-1",
      amountCents: "1000",
    });

    expect(h.publisher.messages).toHaveLength(1);
    expect(h.publisher.messages[0].type).toBe(DEBIT_WALLET_COMMAND);
  });

  it("rejects a bet on a non-existent round", async () => {
    let threw = false;
    try {
      await h.controller.placeBet("round-unknown", {
        betId: "bet-x",
        playerId: "player-1",
        amountCents: "500",
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Wallet debit confirmation
// ---------------------------------------------------------------------------

describe("HandleWalletDebitedUseCase — bet confirmation", () => {
  let h: Harness;
  let round: Round;

  beforeEach(async () => {
    h = buildHarness();
    round = new Round("round-1");
    await h.repo.save(round);
    h.setActiveRound(round);
    // Place a bet first
    await h.controller.placeBet("round-1", {
      betId: "bet-1",
      playerId: "player-1",
      amountCents: "1000",
    });
    h.publisher.clear();
  });

  it("confirms the bet (CONFIRMED status) when wallet debit succeeds", async () => {
    await h.handleDebitedUseCase.execute(
      buildWalletDebitedEvent("bet-1", "round-1", "player-1", 1000n),
    );

    const saved = await h.repo.findById("round-1");
    expect(saved?.findBet("bet-1")?.status).toBe(BetStatus.CONFIRMED);
  });

  it("is idempotent — duplicate WalletDebitedEvent does not double-confirm", async () => {
    const event = buildWalletDebitedEvent("bet-1", "round-1", "player-1", 1000n);
    await h.handleDebitedUseCase.execute(event);
    await h.handleDebitedUseCase.execute(event); // duplicate

    expect(h.publisher.messages).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Cashout
// ---------------------------------------------------------------------------

describe("BetsController — cashout", () => {
  let h: Harness;
  let round: Round;

  beforeEach(async () => {
    h = buildHarness();

    // Build a round with a CONFIRMED bet already in IN_PROGRESS phase
    const bet = Bet.rehydrate("bet-1", "player-1", Money.ofCents(1000n), BetStatus.CONFIRMED);
    round = Round.rehydrate("round-1", RoundStatus.IN_PROGRESS, [bet]);
    await h.repo.save(round);
    h.setActiveRound(round);
    h.setMultiplier(250n, 2.5); // 2.50×
  });

  it("broadcasts a bet.cashedout event", async () => {
    await h.controller.cashout("round-1", "bet-1", { playerId: "player-1" });

    expect(h.broadcasts).toHaveLength(1);
    const event = h.broadcasts[0];
    expect(event.type).toBe(GAME_WS_EVENT.BET_CASHEDOUT);
    if (event.type !== GAME_WS_EVENT.BET_CASHEDOUT) return;
    expect(event.betId).toBe("bet-1");
    expect(event.roundId).toBe("round-1");
    expect(event.playerId).toBe("player-1");
    expect(event.multiplier).toBe(2.5);
    expect(event.payoutCents).toBe("2500");
  });

  it("calculates payout as amountCents × multiplierHundredths / 100", async () => {
    // bet: 500 cents × 300 hundredths (3.00×) / 100 = 1500 cents payout
    const bet = Bet.rehydrate("bet-2", "player-2", Money.ofCents(500n), BetStatus.CONFIRMED);
    const r2 = Round.rehydrate("round-2", RoundStatus.IN_PROGRESS, [bet]);
    await h.repo.save(r2);
    h.setActiveRound(r2);
    h.setMultiplier(300n, 3.0);

    await h.controller.cashout("round-2", "bet-2", { playerId: "player-2" });

    const event = h.broadcasts[0];
    expect(event.type).toBe(GAME_WS_EVENT.BET_CASHEDOUT);
    if (event.type !== GAME_WS_EVENT.BET_CASHEDOUT) return;
    expect(event.payoutCents).toBe("1500");
  });

  it("emits a CreditWalletCommand via the outbox after cashout", async () => {
    await h.controller.cashout("round-1", "bet-1", { playerId: "player-1" });

    expect(h.publisher.messages).toHaveLength(1);
    expect(h.publisher.messages[0].type).toBe(CREDIT_WALLET_COMMAND);
  });

  it("marks the bet as CASHED_OUT in the repository", async () => {
    await h.controller.cashout("round-1", "bet-1", { playerId: "player-1" });

    const saved = await h.repo.findById("round-1");
    expect(saved?.findBet("bet-1")?.status).toBe(BetStatus.CASHED_OUT);
  });

  it("throws NotFoundException for a non-active round", async () => {
    h.setActiveRound(null); // no active round
    let error: unknown;
    try {
      await h.controller.cashout("round-1", "bet-1", { playerId: "player-1" });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(NotFoundException);
  });

  it("throws NotFoundException when the bet does not exist in the round", async () => {
    let error: unknown;
    try {
      await h.controller.cashout("round-1", "bet-nonexistent", { playerId: "player-1" });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// Full lifecycle integration
// ---------------------------------------------------------------------------

describe("Full bet lifecycle — place → confirm debit → cashout", () => {
  it("executes the complete happy-path flow and produces correct broadcasts and commands", async () => {
    const h = buildHarness();

    // 1. A round is open for betting
    const round = new Round("round-1");
    await h.repo.save(round);
    h.setActiveRound(round);

    // 2. Player places a bet via the HTTP controller
    await h.controller.placeBet("round-1", {
      betId: "bet-1",
      playerId: "player-1",
      amountCents: "1000",
    });

    expect(h.broadcasts[0].type).toBe(GAME_WS_EVENT.BET_PLACED);
    expect(h.publisher.messages[0].type).toBe(DEBIT_WALLET_COMMAND);

    // 3. Wallet service confirms the debit
    h.publisher.clear();
    await h.handleDebitedUseCase.execute(
      buildWalletDebitedEvent("bet-1", "round-1", "player-1", 1000n),
    );

    const confirmedRound = await h.repo.findById("round-1");
    expect(confirmedRound?.findBet("bet-1")?.status).toBe(BetStatus.CONFIRMED);

    // 4. Round advances to IN_PROGRESS (simulated by transitioning the domain
    //    object and refreshing the lifecycle stub's view of the round)
    round.start();
    await h.repo.save(round);
    h.setMultiplier(200n, 2.0); // 2.00×

    // 5. Player cashes out via the HTTP controller
    h.broadcasts.length = 0;
    h.publisher.clear();
    await h.controller.cashout("round-1", "bet-1", { playerId: "player-1" });

    // Cashout broadcast includes multiplier and payout
    const cashoutEvent = h.broadcasts[0];
    expect(cashoutEvent.type).toBe(GAME_WS_EVENT.BET_CASHEDOUT);
    if (cashoutEvent.type !== GAME_WS_EVENT.BET_CASHEDOUT) return;
    expect(cashoutEvent.payoutCents).toBe("2000"); // 1000 × 200/100

    // CreditWalletCommand emitted so the wallet credits the player
    expect(h.publisher.messages[0].type).toBe(CREDIT_WALLET_COMMAND);

    // Final bet status is CASHED_OUT
    const finalRound = await h.repo.findById("round-1");
    expect(finalRound?.findBet("bet-1")?.status).toBe(BetStatus.CASHED_OUT);
  });
});
