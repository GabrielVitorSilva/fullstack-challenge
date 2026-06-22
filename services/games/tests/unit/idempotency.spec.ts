/**
 * Idempotency & async-consistency tests.
 *
 * These tests cover the retry / replay scenarios most dangerous in an
 * at-least-once delivery system, including the restart scenario where an
 * aggregate is rehydrated from persistence before a duplicate event arrives:
 *
 *  1. Duplicate WalletDebitedEvent does not confirm a bet twice.
 *  2. Duplicate WalletDebitedEvent on a VOIDED bet does not create a double refund.
 *  3. Duplicate WalletDebitFailedEvent does not fail a bet twice.
 *  4. Late events continue to be handled correctly (regression).
 *  5. The full crash/cancel flow remains consistent across replays.
 *  6. Replay after process restart: rehydrated VOIDED_COMPENSATED bet is a no-op.
 *  7. InMemoryInbox can be used as a complementary dedup layer.
 */

import { describe, expect, it } from "bun:test";
import {
  CREDIT_WALLET_COMMAND,
  buildWalletDebitedEvent,
  buildWalletDebitFailedEvent,
  type CreditWalletCommand,
} from "@crash/contracts";
import { BetStatus } from "../../src/domain/bet-status";
import { Bet } from "../../src/domain/bet";
import { Money } from "../../src/domain/money";
import { Round } from "../../src/domain/round";
import { RoundStatus } from "../../src/domain/round-status";
import { IRoundRepository } from "../../src/domain/ports/round-repository.port";
import { HandleWalletDebitedUseCase } from "../../src/application/use-cases/handle-wallet-debited.use-case";
import { HandleWalletDebitFailedUseCase } from "../../src/application/use-cases/handle-wallet-debit-failed.use-case";
import { InMemoryEventPublisher } from "../../src/infrastructure/messaging/in-memory-event-publisher";
import { InMemoryOutbox } from "../../src/infrastructure/messaging/in-memory-outbox";
import { InMemoryInbox } from "../../src/infrastructure/messaging/in-memory-inbox";

// ---------------------------------------------------------------------------
// Shared test helpers
// ---------------------------------------------------------------------------

class InMemoryRoundRepository implements IRoundRepository {
  private readonly store = new Map<string, Round>();

  seed(round: Round): void {
    this.store.set(round.id, round);
  }

  async findById(id: string): Promise<Round | undefined> {
    return this.store.get(id);
  }

  async save(round: Round): Promise<void> {
    this.store.set(round.id, round);
  }
}

/** Build a fresh round with one PENDING_DEBIT bet. */
const makePendingRound = (
  roundId = "round-1",
  betId = "bet-1",
  playerId = "player-1",
  amountCents = 500n,
) => {
  const round = new Round(roundId);
  round.placeBet(new Bet(betId, playerId, Money.ofCents(amountCents)));
  return round;
};

/** Build a fresh round that has already crashed (bet is VOIDED). */
const makeCrashedRound = (
  roundId = "round-1",
  betId = "bet-1",
  playerId = "player-1",
  amountCents = 500n,
) => {
  const round = new Round(roundId);
  round.placeBet(new Bet(betId, playerId, Money.ofCents(amountCents)));
  round.start();
  round.crash();
  return round;
};

const makeDebitedUseCase = (round: Round) => {
  const repo = new InMemoryRoundRepository();
  repo.seed(round);
  const publisher = new InMemoryEventPublisher();
  const outbox = new InMemoryOutbox(repo, publisher);
  const useCase = new HandleWalletDebitedUseCase(repo, outbox);
  return { repo, publisher, useCase };
};

const makeFailedUseCase = (round: Round) => {
  const repo = new InMemoryRoundRepository();
  repo.seed(round);
  const useCase = new HandleWalletDebitFailedUseCase(repo);
  return { repo, useCase };
};

// ---------------------------------------------------------------------------
// 1. Duplicate WalletDebitedEvent — normal (happy) path
// ---------------------------------------------------------------------------

describe("Idempotency — duplicate WalletDebitedEvent (happy path)", () => {
  it("second event is a no-op: bet stays CONFIRMED, no error thrown", async () => {
    const round = makePendingRound();
    const { useCase } = makeDebitedUseCase(round);

    const event = buildWalletDebitedEvent("bet-1", "round-1", "player-1", 500n);
    await useCase.execute(event);
    expect(round.bets[0].status).toBe(BetStatus.CONFIRMED);

    // Replay — must not throw InvalidBetStateError
    await expect(useCase.execute(event)).resolves.toBeUndefined();
    expect(round.bets[0].status).toBe(BetStatus.CONFIRMED);
  });

  it("second event does not publish any extra message", async () => {
    const round = makePendingRound();
    const { useCase, publisher } = makeDebitedUseCase(round);

    const event = buildWalletDebitedEvent("bet-1", "round-1", "player-1", 500n);
    await useCase.execute(event);
    await useCase.execute(event); // duplicate

    expect(publisher.messages).toHaveLength(0); // happy path never publishes
  });
});

// ---------------------------------------------------------------------------
// 2. Duplicate WalletDebitedEvent — VOIDED bet (late-arrival replay)
// ---------------------------------------------------------------------------

describe("Idempotency — duplicate WalletDebitedEvent on VOIDED bet", () => {
  it("first late event issues exactly one compensating credit", async () => {
    const round = makeCrashedRound();
    const { useCase, publisher } = makeDebitedUseCase(round);

    const event = buildWalletDebitedEvent("bet-1", "round-1", "player-1", 500n);
    await useCase.execute(event);

    expect(publisher.messages).toHaveLength(1);
    const credit = publisher.messages[0] as CreditWalletCommand;
    expect(credit.type).toBe(CREDIT_WALLET_COMMAND);
    expect(credit.amountCents).toBe("500");
  });

  it("bet transitions to VOIDED_COMPENSATED after compensation is issued", async () => {
    const round = makeCrashedRound();
    const bet = round.bets[0];
    const { useCase } = makeDebitedUseCase(round);

    expect(bet.status).toBe(BetStatus.VOIDED);
    await useCase.execute(buildWalletDebitedEvent("bet-1", "round-1", "player-1", 500n));
    expect(bet.status).toBe(BetStatus.VOIDED_COMPENSATED);
  });

  it("second late event is a no-op: no double refund", async () => {
    const round = makeCrashedRound();
    const { useCase, publisher } = makeDebitedUseCase(round);

    const event = buildWalletDebitedEvent("bet-1", "round-1", "player-1", 500n);
    await useCase.execute(event); // first arrival
    await useCase.execute(event); // duplicate / replay

    expect(publisher.messages).toHaveLength(1); // still only one credit
  });

  it("second late event does not throw", async () => {
    const round = makeCrashedRound();
    const { useCase } = makeDebitedUseCase(round);

    const event = buildWalletDebitedEvent("bet-1", "round-1", "player-1", 500n);
    await useCase.execute(event);
    await expect(useCase.execute(event)).resolves.toBeUndefined();
  });

  it("bet remains VOIDED_COMPENSATED after duplicate events", async () => {
    const round = makeCrashedRound();
    const bet = round.bets[0];
    const { useCase } = makeDebitedUseCase(round);

    const event = buildWalletDebitedEvent("bet-1", "round-1", "player-1", 500n);
    await useCase.execute(event);
    await useCase.execute(event);

    expect(bet.status).toBe(BetStatus.VOIDED_COMPENSATED);
  });

  it("three replays still produce exactly one credit", async () => {
    const round = makeCrashedRound();
    const { useCase, publisher } = makeDebitedUseCase(round);
    const event = buildWalletDebitedEvent("bet-1", "round-1", "player-1", 500n);

    await useCase.execute(event);
    await useCase.execute(event);
    await useCase.execute(event);

    expect(publisher.messages).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 3. Duplicate WalletDebitFailedEvent
// ---------------------------------------------------------------------------

describe("Idempotency — duplicate WalletDebitFailedEvent", () => {
  it("second event is a no-op: bet stays DEBIT_FAILED, no error thrown", async () => {
    const round = makePendingRound();
    const { useCase } = makeFailedUseCase(round);

    const event = buildWalletDebitFailedEvent("bet-1", "round-1", "player-1", "INSUFFICIENT_FUNDS");
    await useCase.execute(event);
    expect(round.bets[0].status).toBe(BetStatus.DEBIT_FAILED);

    await expect(useCase.execute(event)).resolves.toBeUndefined();
    expect(round.bets[0].status).toBe(BetStatus.DEBIT_FAILED);
  });

  it("handles replay of WALLET_NOT_FOUND reason as well", async () => {
    const round = makePendingRound();
    const { useCase } = makeFailedUseCase(round);

    const event = buildWalletDebitFailedEvent("bet-1", "round-1", "player-1", "WALLET_NOT_FOUND");
    await useCase.execute(event);
    await expect(useCase.execute(event)).resolves.toBeUndefined();
    expect(round.bets[0].status).toBe(BetStatus.DEBIT_FAILED);
  });
});

// ---------------------------------------------------------------------------
// 4. Late events remain safe (regression — ensure existing guards are intact)
// ---------------------------------------------------------------------------

describe("Late-event safety (regression)", () => {
  it("WalletDebitedEvent after crash: still issues refund on first arrival", async () => {
    const round = makeCrashedRound();
    const { useCase, publisher } = makeDebitedUseCase(round);

    await useCase.execute(buildWalletDebitedEvent("bet-1", "round-1", "player-1", 500n));

    expect(publisher.messages).toHaveLength(1);
    expect((publisher.messages[0] as CreditWalletCommand).type).toBe(CREDIT_WALLET_COMMAND);
  });

  it("WalletDebitedEvent after cancel: still issues refund on first arrival", async () => {
    const round = new Round("round-2");
    round.placeBet(new Bet("bet-2", "player-2", Money.ofCents(300n)));
    round.cancel();

    const { useCase, publisher } = makeDebitedUseCase(round);
    await useCase.execute(buildWalletDebitedEvent("bet-2", "round-2", "player-2", 300n));

    expect(publisher.messages).toHaveLength(1);
  });

  it("WalletDebitFailedEvent on VOIDED bet after cancel: no-op, no throw", async () => {
    const round = new Round("round-3");
    round.placeBet(new Bet("bet-3", "player-3", Money.ofCents(200n)));
    round.cancel();

    const { useCase } = makeFailedUseCase(round);
    await expect(
      useCase.execute(buildWalletDebitFailedEvent("bet-3", "round-3", "player-3", "WALLET_NOT_FOUND")),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 5. Full crash/cancel flow consistency across replays
// ---------------------------------------------------------------------------

describe("Crash/cancel flow — end-to-end consistency", () => {
  it("place → crash → late debit event → replay: consistent final state", async () => {
    const round = makeCrashedRound("round-x", "bet-x", "player-x", 1000n);
    const bet = round.bets[0];
    const { useCase, publisher } = makeDebitedUseCase(round);

    const event = buildWalletDebitedEvent("bet-x", "round-x", "player-x", 1000n);

    await useCase.execute(event); // first delivery
    expect(bet.status).toBe(BetStatus.VOIDED_COMPENSATED);
    expect(publisher.messages).toHaveLength(1);

    await useCase.execute(event); // broker retry
    expect(bet.status).toBe(BetStatus.VOIDED_COMPENSATED);
    expect(publisher.messages).toHaveLength(1); // still exactly one credit
  });

  it("place → crash → late failure event → replay: consistent final state", async () => {
    const round = makeCrashedRound("round-y", "bet-y", "player-y", 800n);
    const bet = round.bets[0];
    const { useCase } = makeFailedUseCase(round);

    const event = buildWalletDebitFailedEvent("bet-y", "round-y", "player-y", "INSUFFICIENT_FUNDS");

    await useCase.execute(event); // first delivery — no-op (already VOIDED)
    expect(bet.status).toBe(BetStatus.VOIDED);

    await useCase.execute(event); // replay — still no-op, no throw
    expect(bet.status).toBe(BetStatus.VOIDED);
  });
});

// ---------------------------------------------------------------------------
// 6. Replay after process restart — rehydration scenario
//
// This is the core risk the previous version did not cover:
// a boolean _compensationIssued resets to false when the aggregate is
// reconstructed from persistence. VOIDED_COMPENSATED as a BetStatus value
// does not — any mapper that stores the status column restores it automatically.
// ---------------------------------------------------------------------------

describe("Rehydration — idempotency survives process restart", () => {
  it("rehydrated VOIDED_COMPENSATED bet: WalletDebitedEvent replay is a no-op", async () => {
    // Simulate: before the restart, the late WalletDebitedEvent arrived,
    // the bet was transitioned to VOIDED_COMPENSATED, and the round was
    // persisted. After restart, a mapper calls Bet.rehydrate() and
    // Round.rehydrate() to restore state from the DB.
    const bet = Bet.rehydrate("bet-1", "player-1", Money.ofCents(500n), BetStatus.VOIDED_COMPENSATED);
    const round = Round.rehydrate("round-1", RoundStatus.CRASHED, [bet]);

    const repo = new InMemoryRoundRepository();
    repo.seed(round);
    const publisher = new InMemoryEventPublisher();
    const outbox = new InMemoryOutbox(repo, publisher);
    const useCase = new HandleWalletDebitedUseCase(repo, outbox);

    // The broker replays the WalletDebitedEvent after the restart
    await useCase.execute(buildWalletDebitedEvent("bet-1", "round-1", "player-1", 500n));

    // No credit should be issued — compensation already happened before restart
    expect(publisher.messages).toHaveLength(0);
    expect(bet.status).toBe(BetStatus.VOIDED_COMPENSATED);
  });

  it("rehydrated VOIDED_COMPENSATED bet handles multiple post-restart replays with zero credits", async () => {
    const bet = Bet.rehydrate("bet-1", "player-1", Money.ofCents(500n), BetStatus.VOIDED_COMPENSATED);
    const round = Round.rehydrate("round-1", RoundStatus.CRASHED, [bet]);

    const repo = new InMemoryRoundRepository();
    repo.seed(round);
    const publisher = new InMemoryEventPublisher();
    const outbox = new InMemoryOutbox(repo, publisher);
    const useCase = new HandleWalletDebitedUseCase(repo, outbox);

    const event = buildWalletDebitedEvent("bet-1", "round-1", "player-1", 500n);
    await useCase.execute(event);
    await useCase.execute(event);
    await useCase.execute(event);

    expect(publisher.messages).toHaveLength(0); // zero credits even after 3 replays
  });

  it("rehydrated VOIDED bet (not yet compensated) still issues exactly one credit", async () => {
    // Scenario: the process crashed BEFORE compensation was issued (i.e. after
    // round.crash() but before the WalletDebitedEvent was handled). On restart,
    // the bet is VOIDED; the first replay correctly triggers compensation.
    const bet = Bet.rehydrate("bet-1", "player-1", Money.ofCents(500n), BetStatus.VOIDED);
    const round = Round.rehydrate("round-1", RoundStatus.CRASHED, [bet]);

    const repo = new InMemoryRoundRepository();
    repo.seed(round);
    const publisher = new InMemoryEventPublisher();
    const outbox = new InMemoryOutbox(repo, publisher);
    const useCase = new HandleWalletDebitedUseCase(repo, outbox);

    const event = buildWalletDebitedEvent("bet-1", "round-1", "player-1", 500n);

    await useCase.execute(event); // first delivery after restart → compensate
    expect(publisher.messages).toHaveLength(1);
    expect(bet.status).toBe(BetStatus.VOIDED_COMPENSATED);

    await useCase.execute(event); // duplicate → no-op
    expect(publisher.messages).toHaveLength(1);
  });

  it("full flow: place → crash → restart (VOIDED) → compensate → restart (VOIDED_COMPENSATED) → replay is no-op", async () => {
    // First restart: bet is VOIDED, compensation is issued
    const betFirstRestart = Bet.rehydrate("bet-1", "player-1", Money.ofCents(1000n), BetStatus.VOIDED);
    const roundFirstRestart = Round.rehydrate("round-1", RoundStatus.CRASHED, [betFirstRestart]);
    const { publisher: pub1, useCase: uc1 } = (() => {
      const repo = new InMemoryRoundRepository();
      repo.seed(roundFirstRestart);
      const publisher = new InMemoryEventPublisher();
      const outbox = new InMemoryOutbox(repo, publisher);
      return { publisher, useCase: new HandleWalletDebitedUseCase(repo, outbox) };
    })();

    const event = buildWalletDebitedEvent("bet-1", "round-1", "player-1", 1000n);
    await uc1.execute(event);
    expect(pub1.messages).toHaveLength(1);
    expect(betFirstRestart.status).toBe(BetStatus.VOIDED_COMPENSATED);

    // Second restart: bet is reloaded as VOIDED_COMPENSATED from the DB
    const betSecondRestart = Bet.rehydrate("bet-1", "player-1", Money.ofCents(1000n), BetStatus.VOIDED_COMPENSATED);
    const roundSecondRestart = Round.rehydrate("round-1", RoundStatus.CRASHED, [betSecondRestart]);
    const { publisher: pub2, useCase: uc2 } = (() => {
      const repo = new InMemoryRoundRepository();
      repo.seed(roundSecondRestart);
      const publisher = new InMemoryEventPublisher();
      const outbox = new InMemoryOutbox(repo, publisher);
      return { publisher, useCase: new HandleWalletDebitedUseCase(repo, outbox) };
    })();

    await uc2.execute(event); // broker retries after second restart
    expect(pub2.messages).toHaveLength(0); // correctly suppressed
  });
});

// ---------------------------------------------------------------------------
// 7. InMemoryInbox as a complementary dedup layer
// ---------------------------------------------------------------------------

describe("InMemoryInbox — process-level deduplication", () => {
  it("marks a key as processed and detects duplicates", async () => {
    const inbox = new InMemoryInbox();
    const key = "wallet.debited:bet-1";

    expect(await inbox.hasProcessed(key)).toBe(false);
    await inbox.markProcessed(key);
    expect(await inbox.hasProcessed(key)).toBe(true);
  });

  it("different keys do not interfere", async () => {
    const inbox = new InMemoryInbox();
    await inbox.markProcessed("wallet.debited:bet-1");
    expect(await inbox.hasProcessed("wallet.debited:bet-2")).toBe(false);
  });

  it("can be used as a fast-path guard before domain work", async () => {
    const round = makePendingRound();
    const { useCase, publisher } = makeDebitedUseCase(round);
    const inbox = new InMemoryInbox();

    const event = buildWalletDebitedEvent("bet-1", "round-1", "player-1", 500n);
    const key = `${event.type}:${event.correlationId}`;

    for (let i = 0; i < 3; i++) {
      if (await inbox.hasProcessed(key)) continue;
      await useCase.execute(event);
      await inbox.markProcessed(key);
    }

    expect(round.bets[0].status).toBe(BetStatus.CONFIRMED);
    expect(publisher.messages).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 8. Bet.issueCompensation — domain contract
// ---------------------------------------------------------------------------

describe("Bet.issueCompensation — domain contract", () => {
  it("transitions VOIDED → VOIDED_COMPENSATED", () => {
    const bet = new Bet("b", "p", Money.ofCents(100n));
    bet.void();
    bet.issueCompensation();
    expect(bet.status).toBe(BetStatus.VOIDED_COMPENSATED);
  });

  it("rejects issueCompensation() on PENDING_DEBIT (not VOIDED)", () => {
    const bet = new Bet("b", "p", Money.ofCents(100n));
    // Use a try/catch to import InvalidBetStateError implicitly via the thrown type
    let caught: unknown;
    try { bet.issueCompensation(); } catch (e) { caught = e; }
    expect(caught).toBeDefined();
    expect((caught as Error).message).toContain("PENDING_DEBIT");
    expect((caught as Error).message).toContain("VOIDED_COMPENSATED");
  });

  it("rejects double issueCompensation() (VOIDED_COMPENSATED is terminal)", () => {
    const bet = new Bet("b", "p", Money.ofCents(100n));
    bet.void();
    bet.issueCompensation();
    // Second call should throw — state machine enforces terminal status
    let caught: unknown;
    try { bet.issueCompensation(); } catch (e) { caught = e; }
    expect(caught).toBeDefined();
    expect((caught as Error).message).toContain("VOIDED_COMPENSATED");
  });
});
