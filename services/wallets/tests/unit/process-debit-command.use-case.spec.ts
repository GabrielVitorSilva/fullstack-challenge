import { describe, expect, it } from "bun:test";
import {
  WALLET_DEBIT_FAILED_EVENT,
  WALLET_DEBITED_EVENT,
  buildDebitWalletCommand,
  type WalletDebitFailedEvent,
  type WalletDebitedEvent,
} from "@crash/contracts";
import { Money } from "../../src/domain/money";
import { IWalletRepository } from "../../src/domain/ports/wallet-repository.port";
import { Wallet } from "../../src/domain/wallet";
import { ProcessDebitCommandUseCase } from "../../src/application/use-cases/process-debit-command.use-case";
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

const setup = (balanceCents = 1000n) => {
  const wallet = new Wallet("wallet-1", "player-1", Money.ofCents(balanceCents));
  const repo = new InMemoryWalletRepository();
  repo.seed(wallet);
  const publisher = new InMemoryEventPublisher();
  const useCase = new ProcessDebitCommandUseCase(repo, publisher);
  return { wallet, repo, publisher, useCase };
};

describe("ProcessDebitCommandUseCase", () => {
  it("debits the wallet and publishes WalletDebitedEvent", async () => {
    const { wallet, publisher, useCase } = setup(1000n);
    const cmd = buildDebitWalletCommand("bet-1", "round-1", "player-1", 500n);
    await useCase.execute(cmd);

    expect(wallet.balance.toCents()).toBe(500n);
    expect(publisher.messages).toHaveLength(1);
    const event = publisher.messages[0] as WalletDebitedEvent;
    expect(event.type).toBe(WALLET_DEBITED_EVENT);
    expect(event.betId).toBe("bet-1");
    expect(event.amountCents).toBe("500");
    expect(event.correlationId).toBe("bet-1");
  });

  it("publishes WalletDebitFailedEvent on insufficient funds", async () => {
    const { wallet, publisher, useCase } = setup(100n);
    const cmd = buildDebitWalletCommand("bet-1", "round-1", "player-1", 500n);
    await useCase.execute(cmd);

    expect(wallet.balance.toCents()).toBe(100n);
    expect(publisher.messages).toHaveLength(1);
    const event = publisher.messages[0] as WalletDebitFailedEvent;
    expect(event.type).toBe(WALLET_DEBIT_FAILED_EVENT);
    expect(event.reason).toBe("INSUFFICIENT_FUNDS");
    expect(event.betId).toBe("bet-1");
  });

  it("publishes WalletDebitFailedEvent when wallet does not exist", async () => {
    const repo = new InMemoryWalletRepository();
    const publisher = new InMemoryEventPublisher();
    const useCase = new ProcessDebitCommandUseCase(repo, publisher);

    const cmd = buildDebitWalletCommand("bet-1", "round-1", "unknown-player", 500n);
    await useCase.execute(cmd);

    const event = publisher.messages[0] as WalletDebitFailedEvent;
    expect(event.type).toBe(WALLET_DEBIT_FAILED_EVENT);
    expect(event.reason).toBe("WALLET_NOT_FOUND");
  });

  it("correlationId in the event matches the betId", async () => {
    const { publisher, useCase } = setup();
    const cmd = buildDebitWalletCommand("bet-42", "round-1", "player-1", 100n);
    await useCase.execute(cmd);
    expect(publisher.messages[0].correlationId).toBe("bet-42");
  });

  it("does not debit the wallet when funds are insufficient", async () => {
    const { wallet, useCase } = setup(50n);
    const cmd = buildDebitWalletCommand("bet-1", "round-1", "player-1", 100n);
    await useCase.execute(cmd);
    expect(wallet.balance.toCents()).toBe(50n);
  });

  it("handles exact-balance debit (drains to zero)", async () => {
    const { wallet, publisher, useCase } = setup(500n);
    const cmd = buildDebitWalletCommand("bet-1", "round-1", "player-1", 500n);
    await useCase.execute(cmd);
    expect(wallet.balance.toCents()).toBe(0n);
    expect((publisher.messages[0] as WalletDebitedEvent).type).toBe(WALLET_DEBITED_EVENT);
  });
});
