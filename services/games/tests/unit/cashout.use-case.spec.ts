import { describe, expect, it } from "bun:test";
import {
  CREDIT_WALLET_COMMAND,
  type CreditWalletCommand,
} from "@crash/contracts";
import { BetStatus } from "../../src/domain/bet-status";
import { Bet } from "../../src/domain/bet";
import { Money } from "../../src/domain/money";
import { IRoundRepository } from "../../src/domain/ports/round-repository.port";
import { Round } from "../../src/domain/round";
import { CashoutUseCase } from "../../src/application/use-cases/cashout.use-case";
import { InMemoryEventPublisher } from "../../src/infrastructure/messaging/in-memory-event-publisher";
import { InMemoryOutbox } from "../../src/infrastructure/messaging/in-memory-outbox";

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

const setup = () => {
  const round = new Round("round-1");
  const bet = new Bet("bet-1", "player-1", Money.ofCents(500n));
  round.placeBet(bet);
  bet.confirm();
  round.start();
  const repo = new InMemoryRoundRepository();
  repo.seed(round);
  const publisher = new InMemoryEventPublisher();
  const outbox = new InMemoryOutbox(repo, publisher);
  const useCase = new CashoutUseCase(repo, outbox);
  return { round, bet, repo, publisher, useCase };
};

describe("CashoutUseCase", () => {
  it("marks the bet as CASHED_OUT", async () => {
    const { bet, useCase } = setup();
    await useCase.execute({
      roundId: "round-1",
      betId: "bet-1",
      playerId: "player-1",
      payoutAmountCents: 1250n,
    });
    expect(bet.status).toBe(BetStatus.CASHED_OUT);
  });

  it("publishes a CreditWalletCommand via the outbox with the payout amount", async () => {
    const { publisher, useCase } = setup();
    await useCase.execute({
      roundId: "round-1",
      betId: "bet-1",
      playerId: "player-1",
      payoutAmountCents: 1250n,
    });
    expect(publisher.messages).toHaveLength(1);
    const cmd = publisher.messages[0] as CreditWalletCommand;
    expect(cmd.type).toBe(CREDIT_WALLET_COMMAND);
    expect(cmd.betId).toBe("bet-1");
    expect(cmd.amountCents).toBe("1250");
    expect(cmd.correlationId).toBe("bet-1");
  });

  it("throws when the round does not exist", async () => {
    const { useCase } = setup();
    await expect(
      useCase.execute({
        roundId: "nonexistent",
        betId: "bet-1",
        playerId: "player-1",
        payoutAmountCents: 1250n,
      }),
    ).rejects.toThrow("nonexistent");
  });

  it("rejects cashout on a bet that was not confirmed (still PENDING_DEBIT)", async () => {
    const round = new Round("round-2");
    const bet = new Bet("bet-2", "player-2", Money.ofCents(500n));
    round.placeBet(bet);
    round.start();
    const repo = new InMemoryRoundRepository();
    repo.seed(round);
    const publisher = new InMemoryEventPublisher();
    const outbox = new InMemoryOutbox(repo, publisher);
    const useCase = new CashoutUseCase(repo, outbox);

    await expect(
      useCase.execute({
        roundId: "round-2",
        betId: "bet-2",
        playerId: "player-2",
        payoutAmountCents: 600n,
      }),
    ).rejects.toThrow();
  });

  it("rejects cashout when round is not IN_PROGRESS", async () => {
    const round = new Round("round-3");
    const bet = new Bet("bet-3", "player-3", Money.ofCents(500n));
    round.placeBet(bet);
    bet.confirm();
    const repo = new InMemoryRoundRepository();
    repo.seed(round);
    const outbox = new InMemoryOutbox(repo, new InMemoryEventPublisher());
    const useCase = new CashoutUseCase(repo, outbox);

    await expect(
      useCase.execute({
        roundId: "round-3",
        betId: "bet-3",
        playerId: "player-3",
        payoutAmountCents: 600n,
      }),
    ).rejects.toThrow();
  });
});
