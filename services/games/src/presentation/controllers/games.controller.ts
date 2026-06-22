import { Controller, Get, Param } from "@nestjs/common";
import { GetRoundVerificationUseCase } from "../../application/use-cases/get-round-verification.use-case";
import { HealthCheckResponseDto } from "../dtos/health-check-response.dto";
import { RoundVerificationResponseDto } from "../dtos/round-verification-response.dto";

@Controller()
export class GamesController {
  constructor(private readonly getRoundVerification: GetRoundVerificationUseCase) {}

  @Get("health")
  check(): HealthCheckResponseDto {
    return { status: "ok", service: "games" };
  }

  /**
   * Returns provably fair verification data for a completed round.
   *
   * The client can verify:
   *   1. SHA-256(serverSeed) === hashedServerSeed
   *   2. HMAC-SHA256(key=serverSeed, data=nonce) reproduces the crashMultiplier
   *
   * Only available after the round has CRASHED or been CANCELLED (serverSeed
   * is kept secret while the round is in progress to prevent manipulation).
   */
  @Get("rounds/:roundId/verify")
  async roundVerification(
    @Param("roundId") roundId: string,
  ): Promise<RoundVerificationResponseDto> {
    const verification = await this.getRoundVerification.execute({ roundId });
    return new RoundVerificationResponseDto(verification);
  }
}
