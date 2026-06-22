import { describe, expect, it } from "bun:test";
import { GetRoundVerificationUseCase } from "../../src/application/use-cases/get-round-verification.use-case";
import { IRoundRepository } from "../../src/domain/ports/round-repository.port";
import {
  computeCrashPoint,
  generateRoundSeeds,
} from "../../src/domain/provably-fair/crash-point-computer";
import { Round } from "../../src/domain/round";

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

const NONCE = "round-1";

const makeCompletedRound = (): Round => {
  const seeds = generateRoundSeeds(NONCE);
  const crashPoint = computeCrashPoint(seeds.serverSeed, NONCE);
  const round = new Round("round-1", seeds, crashPoint);
  round.start();
  round.crash();
  return round;
};

const makeCancelledRound = (): Round => {
  const seeds = generateRoundSeeds(NONCE);
  const crashPoint = computeCrashPoint(seeds.serverSeed, NONCE);
  const round = new Round("round-2", seeds, crashPoint);
  round.cancel();
  return round;
};

describe("GetRoundVerificationUseCase", () => {
  it("returns verification data for a crashed round", async () => {
    const round = makeCompletedRound();
    const repo = new InMemoryRoundRepository();
    repo.seed(round);
    const useCase = new GetRoundVerificationUseCase(repo);

    const verification = await useCase.execute({ roundId: "round-1" });

    expect(verification.roundId).toBe("round-1");
    expect(verification.nonce).toBe(NONCE);
    expect(verification.serverSeed).toBeTruthy();
    expect(verification.hashedServerSeed).toBeTruthy();
    expect(verification.crashMultiplier).toMatch(/^\d+\.\d{2}$/);
  });

  it("returns verification data for a cancelled round", async () => {
    const round = makeCancelledRound();
    const repo = new InMemoryRoundRepository();
    repo.seed(round);
    const useCase = new GetRoundVerificationUseCase(repo);

    const verification = await useCase.execute({ roundId: "round-2" });

    expect(verification.roundId).toBe("round-2");
  });

  it("throws when the round does not exist", async () => {
    const repo = new InMemoryRoundRepository();
    const useCase = new GetRoundVerificationUseCase(repo);

    await expect(
      useCase.execute({ roundId: "nonexistent" }),
    ).rejects.toThrow("nonexistent");
  });

  it("throws when the round is still in BETTING phase (serverSeed not yet revealed)", async () => {
    const seeds = generateRoundSeeds(NONCE);
    const crashPoint = computeCrashPoint(seeds.serverSeed, NONCE);
    const round = new Round("round-betting", seeds, crashPoint);
    const repo = new InMemoryRoundRepository();
    repo.seed(round);
    const useCase = new GetRoundVerificationUseCase(repo);

    await expect(
      useCase.execute({ roundId: "round-betting" }),
    ).rejects.toThrow();
  });

  it("throws when the round is IN_PROGRESS (serverSeed not yet revealed)", async () => {
    const seeds = generateRoundSeeds(NONCE);
    const crashPoint = computeCrashPoint(seeds.serverSeed, NONCE);
    const round = new Round("round-live", seeds, crashPoint);
    round.start();
    const repo = new InMemoryRoundRepository();
    repo.seed(round);
    const useCase = new GetRoundVerificationUseCase(repo);

    await expect(
      useCase.execute({ roundId: "round-live" }),
    ).rejects.toThrow();
  });

  it("throws when the round has no provably fair seeds (legacy round)", async () => {
    const round = new Round("round-legacy");
    round.start();
    round.crash();
    const repo = new InMemoryRoundRepository();
    repo.seed(round);
    const useCase = new GetRoundVerificationUseCase(repo);

    await expect(
      useCase.execute({ roundId: "round-legacy" }),
    ).rejects.toThrow("provably fair seeds");
  });

  it("the returned verification data is reproducible (can be verified independently)", async () => {
    const round = makeCompletedRound();
    const repo = new InMemoryRoundRepository();
    repo.seed(round);
    const useCase = new GetRoundVerificationUseCase(repo);

    const v = await useCase.execute({ roundId: "round-1" });

    // Re-derive crash point from the revealed serverSeed
    const recomputed = computeCrashPoint(v.serverSeed, v.nonce);
    expect(recomputed.display()).toBe(v.crashMultiplier);
  });
});
