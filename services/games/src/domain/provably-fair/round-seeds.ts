/**
 * Carries the provably fair seed pair for a single round.
 *
 * Lifecycle:
 *   1. BEFORE bets open: server generates serverSeed and publishes hashedServerSeed.
 *      The commitment (hashedServerSeed) prevents the server from changing the
 *      outcome after seeing which bets were placed.
 *   2. AFTER the round crashes: server reveals serverSeed.
 *      Players can verify: SHA-256(serverSeed) === hashedServerSeed, and then
 *      independently recompute the crash point from serverSeed + nonce.
 */
export class RoundSeeds {
  constructor(
    /** Random secret generated before the round; revealed only after it ends. */
    readonly serverSeed: string,
    /** SHA-256 of serverSeed. Published before bets so players can verify no tampering. */
    readonly hashedServerSeed: string,
    /** Public input to the HMAC — the round identifier known by all participants. */
    readonly nonce: string,
  ) {}
}
