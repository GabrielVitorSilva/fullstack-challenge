import { IRoundRepository } from "../../domain/ports/round-repository.port";
import { RoundVerification } from "../../domain/provably-fair/round-verification";

export interface GetRoundVerificationInput {
  readonly roundId: string;
}

/**
 * Returns the provably fair verification record for a completed round.
 *
 * Players use this data to independently verify that the crash point was
 * determined before bets were placed and was not modified afterwards:
 *   1. SHA-256(serverSeed) === hashedServerSeed  (commitment check)
 *   2. Recompute crash point from serverSeed + nonce  (result check)
 */
export class GetRoundVerificationUseCase {
  constructor(private readonly rounds: IRoundRepository) {}

  async execute(input: GetRoundVerificationInput): Promise<RoundVerification> {
    const round = await this.rounds.findById(input.roundId);
    if (!round) throw new Error(`Round ${input.roundId} not found`);

    return round.buildVerification();
  }
}
