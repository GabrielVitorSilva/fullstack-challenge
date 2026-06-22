import { describe, expect, it } from "bun:test";
import {
  CREDIT_WALLET_COMMAND,
  buildWalletDebitedEvent,
  type CreditWalletCommand,
} from "@crash/contracts";
import { BetStatus } from "../../src/domain/bet-status";
import { Bet } from "../../src/domain/bet";
import { Money } from "../../src/domain/money";
import { IRoundRepository } from "../../src/domain/ports/round-repository.port";
import { Round } from "../../src/domain/round";
import { HandleWalletDebitedUseCase } from "../../src/application/use-cases/handle-wallet-debited.use-case";
import { InMemoryEventPublisher } from "../../src/infrastructure/messaging/in-memory-event-publisher";

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
  round.placeBet(new Bet("bet-1", "player-1", Money.ofCents(500n)));
  const repo = new InMemoryRoundRepository();
  repo.seed(round);
  const publisher = new InMemoryEventPublisher();
  const useCase = new HandleWalletDebitedUseCase(repo, publisher);
  return { round, repo, publisher, useCase };
};

describe("HandleWalletDebitedUseCase — happy path", () => {
  it("transitions the bet to CONFIRMED", async () => {
    const { round, useCase } = setup();
    const event = buildWalletDebitedEvent("bet-1", "round-1", "player-1", 500n);
    await useCase.execute(event);
    expect(round.bets[0].status).toBe(BetStatus.CONFIRMED);
  });

  it("publishes no event on the happy path", async () => {
    const { publisher, useCase } = setup();
    const event = buildWalletDebitedEvent("bet-1", "round-1", "player-1", 500n);
    await useCase.execute(event);
    expect(publisher.messages).toHaveLength(0);
  });

  it("throws when the round does not exist", async () => {
    const { useCase } = setup();
    const event = buildWalletDebitedEvent("bet-1", "nonexistent", "player-1", 500n);
    await expect(useCase.execute(event)).rejects.toThrow("nonexistent");
  });

  it("throws when the bet does not exist in the round", async () => {
    const { useCase } = setup();
    const event = buildWalletDebitedEvent("bet-999", "round-1", "player-1", 500n);
    await expect(useCase.execute(event)).rejects.toThrow("bet-999");
  });
});

describe("HandleWalletDebitedUseCase — late-event guard (VOIDED bet)", () => {
  const setupVoided = () => {
    const round = new Round("round-1");
    const bet = new Bet("bet-1", "player-1", Money.ofCents(500n));
    round.placeBet(bet);
    round.start();
    round.crash(); // transitions bet to VOIDED
    const repo = new InMemoryRoundRepository();
    repo.seed(round);
    const publisher = new InMemoryEventPublisher();
    const useCase = new HandleWalletDebitedUseCase(repo, publisher);
    return { round, bet, publisher, useCase };
  };

  it("does NOT confirm a VOIDED bet when a late WalletDebitedEvent arrives", async () => {
    const { bet, useCase } = setupVoided();
    const event = buildWalletDebitedEvent("bet-1", "round-1", "player-1", 500n);
    await useCase.execute(event);
    expect(bet.status).toBe(BetStatus.VOIDED);
  });

  it("issues a compensating CreditWalletCommand to refund the player", async () => {
    const { publisher, useCase } = setupVoided();
    const event = buildWalletDebitedEvent("bet-1", "round-1", "player-1", 500n);
    await useCase.execute(event);
    expect(publisher.messages).toHaveLength(1);
    const credit = publisher.messages[0] as CreditWalletCommand;
    expect(credit.type).toBe(CREDIT_WALLET_COMMAND);
    expect(credit.betId).toBe("bet-1");
    expect(credit.playerId).toBe("player-1");
    expect(credit.amountCents).toBe("500");
    expect(credit.correlationId).toBe("bet-1");
  });

  it("refund amount matches the original debit amount", async () => {
    const { publisher, useCase } = setupVoided();
    const event = buildWalletDebitedEvent("bet-1", "round-1", "player-1", 500n);
    await useCase.execute(event);
    const credit = publisher.messages[0] as CreditWalletCommand;
    expect(credit.amountCents).toBe(event.amountCents);
  });

  it("late WalletDebitedEvent after cancel also triggers refund", async () => {
    const round = new Round("round-2");
    const bet = new Bet("bet-2", "player-2", Money.ofCents(200n));
    round.placeBet(bet);
    round.cancel();
    const repo = new InMemoryRoundRepository();
    repo.seed(round);
    const publisher = new InMemoryEventPublisher();
    const useCase = new HandleWalletDebitedUseCase(repo, publisher);

    const event = buildWalletDebitedEvent("bet-2", "round-2", "player-2", 200n);
    await useCase.execute(event);

    expect(bet.status).toBe(BetStatus.VOIDED);
    expect((publisher.messages[0] as CreditWalletCommand).type).toBe(CREDIT_WALLET_COMMAND);
  });
});
