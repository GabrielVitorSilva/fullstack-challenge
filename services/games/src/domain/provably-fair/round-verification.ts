import { CrashPoint } from "./crash-point";
import { RoundSeeds } from "./round-seeds";

/**
 * All data a player needs to independently verify that the crash point of a
 * completed round was not manipulated by the server.
 *
 * Verification steps (client-side):
 *   1. SHA-256(serverSeed) === hashedServerSeed  → server committed before bets
 *   2. HMAC-SHA256(key=serverSeed, data=nonce) → recompute crash point
 *   3. recomputed === crashMultiplier            → outcome was not changed
 */
export class RoundVerification {
  readonly roundId: string;
  readonly nonce: string;
  readonly serverSeed: string;
  readonly hashedServerSeed: string;
  readonly crashMultiplier: string;

  constructor(roundId: string, seeds: RoundSeeds, crashPoint: CrashPoint) {
    this.roundId = roundId;
    this.nonce = seeds.nonce;
    this.serverSeed = seeds.serverSeed;
    this.hashedServerSeed = seeds.hashedServerSeed;
    this.crashMultiplier = crashPoint.display();
  }
}
