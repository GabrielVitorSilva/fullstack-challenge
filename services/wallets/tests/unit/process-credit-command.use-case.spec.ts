import { describe, expect, it } from "bun:test";
import {
  WALLET_CREDITED_EVENT,
  buildCreditWalletCommand,
  type WalletCreditedEvent,
} from "@crash/contracts";
import { Money } from "../../src/domain/money";
import { IWalletRepository } from "../../src/domain/ports/wallet-repository.port";
import { Wallet } from "../../src/domain/wallet";
import { ProcessCreditCommandUseCase } from "../../src/application/use-cases/process-credit-command.use-case";
import { InMemoryEventPublisher } from "../../src/infrastructure/messaging/in-memory-event-publisher";

class InMemoryWalletRepository implements IWalletRepository {
  private readonly store = new Map<string, Wallet>();

  seed(wallet: Wallet): void {
    this.store.set(wallet.userId, wallet);
  }

  async findByUserId(userId: string): Promise<Wallet | undefined> {
    return this.store.get(userId);
  }

  async save(wallet: Wallet): Promise<void> {
    this.store.set(wallet.userId, wallet);
  }
}

const setup = (balanceCents = 0n) => {
  const wallet = new Wallet("wallet-1", "player-1", Money.ofCents(balanceCents));
  const repo = new InMemoryWalletRepository();
  repo.seed(wallet);
  const publisher = new InMemoryEventPublisher();
  const useCase = new ProcessCreditCommandUseCase(repo, publisher);
  return { wallet, repo, publisher, useCase };
};

describe("ProcessCreditCommandUseCase", () => {
  it("credits the wallet and publishes WalletCreditedEvent", async () => {
    const { wallet, publisher, useCase } = setup(0n);
    const cmd = buildCreditWalletCommand("bet-1", "round-1", "player-1", 1250n);
    await useCase.execute(cmd);

    expect(wallet.balance.toCents()).toBe(1250n);
    expect(publisher.messages).toHaveLength(1);
    const event = publisher.messages[0] as WalletCreditedEvent;
    expect(event.type).toBe(WALLET_CREDITED_EVENT);
    expect(event.betId).toBe("bet-1");
    expect(event.amountCents).toBe("1250");
    expect(event.correlationId).toBe("bet-1");
  });

  it("accumulates credit on an existing balance", async () => {
    const { wallet, useCase } = setup(500n);
    const cmd = buildCreditWalletCommand("bet-1", "round-1", "player-1", 750n);
    await useCase.execute(cmd);
    expect(wallet.balance.toCents()).toBe(1250n);
  });

  it("throws when wallet does not exist", async () => {
    const repo = new InMemoryWalletRepository();
    const useCase = new ProcessCreditCommandUseCase(repo, new InMemoryEventPublisher());
    const cmd = buildCreditWalletCommand("bet-1", "round-1", "ghost-player", 500n);
    await expect(useCase.execute(cmd)).rejects.toThrow("ghost-player");
  });

  it("correlationId in the event matches the betId", async () => {
    const { publisher, useCase } = setup();
    const cmd = buildCreditWalletCommand("bet-99", "round-1", "player-1", 200n);
    await useCase.execute(cmd);
    expect(publisher.messages[0].correlationId).toBe("bet-99");
  });
});
