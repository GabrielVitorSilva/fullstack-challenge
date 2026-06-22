import { describe, expect, it } from "bun:test";
import {
  DEBIT_WALLET_COMMAND,
  type DebitWalletCommand,
} from "@crash/contracts";
import { BetStatus } from "../../src/domain/bet-status";
import { IRoundRepository } from "../../src/domain/ports/round-repository.port";
import { Round } from "../../src/domain/round";
import { PlaceBetUseCase } from "../../src/application/use-cases/place-bet.use-case";
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
  const repo = new InMemoryRoundRepository();
  repo.seed(round);
  const publisher = new InMemoryEventPublisher();
  const outbox = new InMemoryOutbox(repo, publisher);
  const useCase = new PlaceBetUseCase(repo, outbox);
  return { round, repo, publisher, useCase };
};

describe("PlaceBetUseCase", () => {
  it("adds a PENDING_DEBIT bet to the round", async () => {
    const { round, useCase } = setup();
    await useCase.execute({
      roundId: "round-1",
      betId: "bet-1",
      playerId: "player-1",
      amountCents: 500n,
    });
    expect(round.bets).toHaveLength(1);
    expect(round.bets[0].status).toBe(BetStatus.PENDING_DEBIT);
  });

  it("publishes a DebitWalletCommand via the outbox", async () => {
    const { publisher, useCase } = setup();
    await useCase.execute({
      roundId: "round-1",
      betId: "bet-1",
      playerId: "player-1",
      amountCents: 500n,
    });
    expect(publisher.messages).toHaveLength(1);
    const cmd = publisher.messages[0] as DebitWalletCommand;
    expect(cmd.type).toBe(DEBIT_WALLET_COMMAND);
    expect(cmd.betId).toBe("bet-1");
    expect(cmd.roundId).toBe("round-1");
    expect(cmd.playerId).toBe("player-1");
    expect(cmd.amountCents).toBe("500");
  });

  it("uses betId as the correlationId in the command", async () => {
    const { publisher, useCase } = setup();
    await useCase.execute({
      roundId: "round-1",
      betId: "bet-99",
      playerId: "player-1",
      amountCents: 100n,
    });
    const cmd = publisher.messages[0] as DebitWalletCommand;
    expect(cmd.correlationId).toBe("bet-99");
  });

  it("throws when the round does not exist", async () => {
    const { useCase } = setup();
    await expect(
      useCase.execute({
        roundId: "nonexistent",
        betId: "bet-1",
        playerId: "player-1",
        amountCents: 100n,
      }),
    ).rejects.toThrow("nonexistent");
  });

  it("does not publish a command when the round is not found", async () => {
    const { publisher, useCase } = setup();
    await useCase
      .execute({ roundId: "missing", betId: "b2", playerId: "p1", amountCents: 100n })
      .catch(() => {});
    expect(publisher.messages).toHaveLength(0);
  });
});
