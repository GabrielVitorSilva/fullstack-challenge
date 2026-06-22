import { describe, expect, it } from "bun:test";
import { createHash, createHmac } from "node:crypto";
import { CrashPoint } from "../../src/domain/provably-fair/crash-point";
import {
  computeCrashPoint,
  generateRoundSeeds,
  hashServerSeed,
  verifyRound,
} from "../../src/domain/provably-fair/crash-point-computer";
import { RoundSeeds } from "../../src/domain/provably-fair/round-seeds";
import { RoundVerification } from "../../src/domain/provably-fair/round-verification";
import { Money } from "../../src/domain/money";

// Fixed seeds for deterministic test cases
const SEED_A = "aabbccdd" + "00112233" + "44556677" + "8899aabb" + "ccddeeff" + "00112233" + "44556677" + "8899aabb";
const SEED_B = "11223344" + "55667788" + "99aabbcc" + "ddeeff00" + "11223344" + "55667788" + "99aabbcc" + "ddeeff00";
const NONCE = "round-42";

describe("CrashPoint value object", () => {
  it("stores and returns the value in hundredths", () => {
    const cp = CrashPoint.fromHundredths(250n);
    expect(cp.toHundredths()).toBe(250n);
  });

  it("displays as decimal multiplier string", () => {
    expect(CrashPoint.fromHundredths(100n).display()).toBe("1.00");
    expect(CrashPoint.fromHundredths(150n).display()).toBe("1.50");
    expect(CrashPoint.fromHundredths(250n).display()).toBe("2.50");
    expect(CrashPoint.fromHundredths(10000n).display()).toBe("100.00");
  });

  it("rejects a multiplier below 1.00x", () => {
    expect(() => CrashPoint.fromHundredths(99n)).toThrow();
    expect(() => CrashPoint.fromHundredths(0n)).toThrow();
  });

  it("applies multiplier to a Money amount", () => {
    const cp = CrashPoint.fromHundredths(250n); // 2.50x
    const bet = Money.ofCents(1000n);            // $10.00
    expect(cp.applyTo(bet).toCents()).toBe(2500n); // $25.00
  });

  it("applyTo truncates rather than rounding (floor semantics)", () => {
    const cp = CrashPoint.fromHundredths(150n); // 1.50x
    const bet = Money.ofCents(1n);               // 1 cent
    // 1 * 150 / 100 = 1 (floor)
    expect(cp.applyTo(bet).toCents()).toBe(1n);
  });

  it("two CrashPoints with equal hundredths are equal", () => {
    expect(CrashPoint.fromHundredths(200n).equals(CrashPoint.fromHundredths(200n))).toBe(true);
  });

  it("two CrashPoints with different hundredths are not equal", () => {
    expect(CrashPoint.fromHundredths(200n).equals(CrashPoint.fromHundredths(201n))).toBe(false);
  });
});

describe("computeCrashPoint – determinism", () => {
  it("returns the same crash point for the same serverSeed and nonce", () => {
    const first = computeCrashPoint(SEED_A, NONCE);
    const second = computeCrashPoint(SEED_A, NONCE);
    expect(first.equals(second)).toBe(true);
  });

  it("returns a different crash point for a different serverSeed", () => {
    const pointA = computeCrashPoint(SEED_A, NONCE);
    const pointB = computeCrashPoint(SEED_B, NONCE);
    // Very unlikely to collide given different seeds
    expect(pointA.equals(pointB)).toBe(false);
  });

  it("returns a different crash point for a different nonce", () => {
    const pointA = computeCrashPoint(SEED_A, "round-1");
    const pointB = computeCrashPoint(SEED_A, "round-2");
    expect(pointA.equals(pointB)).toBe(false);
  });

  it("always returns a crash point >= 1.00x (100n)", () => {
    const seeds = ["seed-alpha", "seed-beta", "seed-gamma", "seed-delta"];
    const nonces = ["1", "2", "99", "999", "round-x"];
    for (const seed of seeds) {
      for (const nonce of nonces) {
        const cp = computeCrashPoint(seed, nonce);
        expect(cp.toHundredths()).toBeGreaterThanOrEqual(100n);
      }
    }
  });

  it("result matches manual HMAC-SHA256 computation", () => {
    // Independently derive expected value using raw crypto
    const hash = createHmac("sha256", SEED_A).update(NONCE).digest("hex");
    const e = 2n ** 52n;
    const h = BigInt("0x" + hash.slice(0, 13));

    let expectedHundredths: bigint;
    if (h % 101n === 0n) {
      expectedHundredths = 100n;
    } else {
      expectedHundredths = (100n * e) / (e - h);
      if (expectedHundredths < 100n) expectedHundredths = 100n;
    }

    const actual = computeCrashPoint(SEED_A, NONCE);
    expect(actual.toHundredths()).toBe(expectedHundredths);
  });
});

describe("hashServerSeed", () => {
  it("matches a raw SHA-256 call", () => {
    const expected = createHash("sha256").update(SEED_A).digest("hex");
    expect(hashServerSeed(SEED_A)).toBe(expected);
  });

  it("different seeds produce different hashes", () => {
    expect(hashServerSeed(SEED_A)).not.toBe(hashServerSeed(SEED_B));
  });
});

describe("generateRoundSeeds", () => {
  it("generates unique serverSeeds across calls", () => {
    const s1 = generateRoundSeeds(NONCE);
    const s2 = generateRoundSeeds(NONCE);
    expect(s1.serverSeed).not.toBe(s2.serverSeed);
  });

  it("hashedServerSeed is the SHA-256 of serverSeed", () => {
    const seeds = generateRoundSeeds(NONCE);
    expect(seeds.hashedServerSeed).toBe(hashServerSeed(seeds.serverSeed));
  });

  it("carries the nonce provided", () => {
    const seeds = generateRoundSeeds("my-nonce");
    expect(seeds.nonce).toBe("my-nonce");
  });
});

describe("verifyRound", () => {
  it("returns true when serverSeed, hashedServerSeed and crashPoint are consistent", () => {
    const seeds = generateRoundSeeds(NONCE);
    const crashPoint = computeCrashPoint(seeds.serverSeed, NONCE);
    expect(verifyRound(seeds.serverSeed, seeds.hashedServerSeed, NONCE, crashPoint)).toBe(true);
  });

  it("returns false when serverSeed does not match hashedServerSeed", () => {
    const seeds = generateRoundSeeds(NONCE);
    const crashPoint = computeCrashPoint(seeds.serverSeed, NONCE);
    const tamperedHash = hashServerSeed("wrong-seed");
    expect(verifyRound(seeds.serverSeed, tamperedHash, NONCE, crashPoint)).toBe(false);
  });

  it("returns false when the crash point does not match the recomputed value", () => {
    const seeds = generateRoundSeeds(NONCE);
    const wrongCrashPoint = CrashPoint.fromHundredths(99999n);
    expect(verifyRound(seeds.serverSeed, seeds.hashedServerSeed, NONCE, wrongCrashPoint)).toBe(false);
  });

  it("reproduces the same verification result on every call (deterministic)", () => {
    const seeds = generateRoundSeeds(NONCE);
    const crashPoint = computeCrashPoint(seeds.serverSeed, NONCE);
    const resultA = verifyRound(seeds.serverSeed, seeds.hashedServerSeed, NONCE, crashPoint);
    const resultB = verifyRound(seeds.serverSeed, seeds.hashedServerSeed, NONCE, crashPoint);
    expect(resultA).toBe(true);
    expect(resultB).toBe(true);
  });
});

describe("RoundVerification data structure", () => {
  it("carries all data needed for independent verification", () => {
    const seeds = new RoundSeeds(SEED_A, hashServerSeed(SEED_A), NONCE);
    const crashPoint = computeCrashPoint(SEED_A, NONCE);
    const verification = new RoundVerification("round-42", seeds, crashPoint);

    expect(verification.roundId).toBe("round-42");
    expect(verification.nonce).toBe(NONCE);
    expect(verification.serverSeed).toBe(SEED_A);
    expect(verification.hashedServerSeed).toBe(hashServerSeed(SEED_A));
    expect(verification.crashMultiplier).toBe(crashPoint.display());
  });

  it("crashMultiplier is formatted as a decimal string like '2.50'", () => {
    const seeds = new RoundSeeds(SEED_A, hashServerSeed(SEED_A), NONCE);
    const crashPoint = computeCrashPoint(SEED_A, NONCE);
    const verification = new RoundVerification("r-1", seeds, crashPoint);

    expect(verification.crashMultiplier).toMatch(/^\d+\.\d{2}$/);
  });
});
