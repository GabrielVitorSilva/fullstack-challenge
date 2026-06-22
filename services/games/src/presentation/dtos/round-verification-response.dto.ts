import { RoundVerification } from "../../domain/provably-fair/round-verification";

export class RoundVerificationResponseDto {
  readonly roundId: string;
  readonly nonce: string;
  readonly serverSeed: string;
  readonly hashedServerSeed: string;
  readonly crashMultiplier: string;

  constructor(verification: RoundVerification) {
    this.roundId = verification.roundId;
    this.nonce = verification.nonce;
    this.serverSeed = verification.serverSeed;
    this.hashedServerSeed = verification.hashedServerSeed;
    this.crashMultiplier = verification.crashMultiplier;
  }
}
