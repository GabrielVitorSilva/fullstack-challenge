import { createHash, createHmac, randomBytes } from "node:crypto";
import { CrashPoint } from "./crash-point";
import { RoundSeeds } from "./round-seeds";

/**
 * Derives the crash multiplier deterministically from two inputs:
 *   serverSeed – secret generated before the round; revealed after crash.
 *   nonce      – round identifier; publicly known to all participants.
 *
 * Algorithm:
 *   1. hash = HMAC-SHA256(key=serverSeed, data=nonce)
 *   2. h = first 52 bits of hash as a BigInt  (13 hex chars → 52 bits)
 *   3. e = 2^52
 *   4. House-edge gate: if h % 101n === 0n → instant crash at 1.00x (~1% of rounds)
 *   5. Otherwise: multiplier = floor(100 * e / (e - h)) / 100
 *
 * Why HMAC-SHA256?
 *   The server commits to serverSeed via its hash before bets open.
 *   HMAC(serverSeed, nonce) binds both inputs so neither can be tweaked
 *   independently after the commitment.
 *
 * Why 52 bits?
 *   Keeps h well within Number.MAX_SAFE_INTEGER. BigInt arithmetic is used
 *   throughout to avoid rounding errors; the final conversion to hundredths
 *   is exact as long as the result fits in bigint (it always does).
 *
 * Distribution:
 *   P(crash ≥ M) ≈ 0.99 / M, giving a house edge of ~1%.
 *   Expected RTP for a player who always cashes out at target T is ~99%.
 */
export function computeCrashPoint(serverSeed: string, nonce: string): CrashPoint {
  const hash = createHmac("sha256", serverSeed).update(nonce).digest("hex");

  const e = 2n ** 52n;
  const h = BigInt("0x" + hash.slice(0, 13)); // 52 bits = 13 hex chars

  // ~1% of rounds crash instantly (house edge via h % 101n)
  if (h % 101n === 0n) {
    return CrashPoint.fromHundredths(100n);
  }

  // Pareto-like distribution: higher h → higher multiplier.
  // Division is exact in BigInt; result is always >= 100n because h < e.
  const hundredths = (100n * e) / (e - h);
  return CrashPoint.fromHundredths(hundredths < 100n ? 100n : hundredths);
}

/** SHA-256 commitment over the serverSeed. Published before bets open. */
export function hashServerSeed(serverSeed: string): string {
  return createHash("sha256").update(serverSeed).digest("hex");
}

/**
 * Generates a fresh set of round seeds with a random serverSeed.
 * Call this once per round before the betting phase opens.
 */
export function generateRoundSeeds(nonce: string): RoundSeeds {
  const serverSeed = randomBytes(32).toString("hex");
  const hashedServerSeed = hashServerSeed(serverSeed);
  return new RoundSeeds(serverSeed, hashedServerSeed, nonce);
}

/**
 * Verifies that a serverSeed matches its published commitment and reproduces
 * the expected crash point. Returns true if the round data is consistent.
 */
export function verifyRound(
  serverSeed: string,
  hashedServerSeed: string,
  nonce: string,
  expectedCrashPoint: CrashPoint,
): boolean {
  const actualHash = hashServerSeed(serverSeed);
  if (actualHash !== hashedServerSeed) return false;

  const recomputed = computeCrashPoint(serverSeed, nonce);
  return recomputed.equals(expectedCrashPoint);
}
