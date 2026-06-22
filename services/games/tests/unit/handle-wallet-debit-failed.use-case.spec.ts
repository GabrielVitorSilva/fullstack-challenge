import { describe, expect, it } from "bun:test";
import { buildWalletDebitFailedEvent } from "@crash/contracts";
import { BetStatus } from "../../src/domain/bet-status";
import { Bet } from "../../src/domain/bet";
import { Money } from "../../src/domain/money";
import { IRoundRepository } from "../../src/domain/ports/round-repository.port";
import { Round } from "../../src/domain/round";
import { HandleWalletDebitFailedUseCase } from "../../src/application/use-cases/handle-wallet-debit-failed.use-case";

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
  const useCase = new HandleWalletDebitFailedUseCase(repo);
  return { round, repo, useCase };
};

describe("HandleWalletDebitFailedUseCase — happy path", () => {
  it("transitions the bet to DEBIT_FAILED on insufficient funds", async () => {
    const { round, useCase } = setup();
    const event = buildWalletDebitFailedEvent("bet-1", "round-1", "player-1", "INSUFFICIENT_FUNDS");
    await useCase.execute(event);
    expect(round.bets[0].status).toBe(BetStatus.DEBIT_FAILED);
  });

  it("transitions the bet to DEBIT_FAILED on wallet not found", async () => {
    const { round, useCase } = setup();
    const event = buildWalletDebitFailedEvent("bet-1", "round-1", "player-1", "WALLET_NOT_FOUND");
    await useCase.execute(event);
    expect(round.bets[0].status).toBe(BetStatus.DEBIT_FAILED);
  });

  it("throws when the round does not exist", async () => {
    const { useCase } = setup();
    const event = buildWalletDebitFailedEvent("bet-1", "nonexistent", "player-1", "INSUFFICIENT_FUNDS");
    await expect(useCase.execute(event)).rejects.toThrow("nonexistent");
  });

  it("throws when the bet does not exist in the round", async () => {
    const { useCase } = setup();
    const event = buildWalletDebitFailedEvent("bet-999", "round-1", "player-1", "INSUFFICIENT_FUNDS");
    await expect(useCase.execute(event)).rejects.toThrow("bet-999");
  });
});

describe("HandleWalletDebitFailedUseCase — late-event guard (VOIDED bet)", () => {
  const setupVoided = () => {
    const round = new Round("round-1");
    const bet = new Bet("bet-1", "player-1", Money.ofCents(500n));
    round.placeBet(bet);
    round.start();
    round.crash(); // transitions bet to VOIDED
    const repo = new InMemoryRoundRepository();
    repo.seed(round);
    const useCase = new HandleWalletDebitFailedUseCase(repo);
    return { round, bet, repo, useCase };
  };

  it("is a no-op when the bet is VOIDED (round already ended, debit never happened)", async () => {
    const { bet, useCase } = setupVoided();
    const event = buildWalletDebitFailedEvent("bet-1", "round-1", "player-1", "INSUFFICIENT_FUNDS");
    await useCase.execute(event);
    expect(bet.status).toBe(BetStatus.VOIDED);
  });

  it("does not throw on a late failure event for a voided bet", async () => {
    const { useCase } = setupVoided();
    const event = buildWalletDebitFailedEvent("bet-1", "round-1", "player-1", "INSUFFICIENT_FUNDS");
    await expect(useCase.execute(event)).resolves.toBeUndefined();
  });

  it("no-op also applies when round was cancelled", async () => {
    const round = new Round("round-2");
    const bet = new Bet("bet-2", "player-2", Money.ofCents(300n));
    round.placeBet(bet);
    round.cancel();
    const repo = new InMemoryRoundRepository();
    repo.seed(round);
    const useCase = new HandleWalletDebitFailedUseCase(repo);

    const event = buildWalletDebitFailedEvent("bet-2", "round-2", "player-2", "WALLET_NOT_FOUND");
    await useCase.execute(event);
    expect(bet.status).toBe(BetStatus.VOIDED);
  });
});
