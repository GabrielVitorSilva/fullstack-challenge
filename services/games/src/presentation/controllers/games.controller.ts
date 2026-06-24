import { Controller, Get, Inject, NotFoundException, Param, Query, UseGuards } from "@nestjs/common";
import { GetRoundVerificationUseCase } from "../../application/use-cases/get-round-verification.use-case";
import { RoundLifecycleService } from "../../application/services/round-lifecycle.service";
import type { IRoundRepository } from "../../domain/ports/round-repository.port";
import { RoundStatus } from "../../domain/round-status";
import { InMemoryRoundRepository } from "../../infrastructure/persistence/in-memory-round-repository";
import { CurrentUser } from "../../infrastructure/auth/current-user.decorator";
import { JwtAuthGuard } from "../../infrastructure/auth/jwt-auth.guard";
import type { AuthenticatedUser } from "../../infrastructure/auth/authenticated-user";
import { HealthCheckResponseDto } from "../dtos/health-check-response.dto";
import { RoundVerificationResponseDto } from "../dtos/round-verification-response.dto";
import { buildRoundStateEvent } from "../mappers/round-state.mapper";

@Controller()
export class GamesController {
  constructor(
    private readonly getRoundVerification: GetRoundVerificationUseCase,
    private readonly lifecycle: RoundLifecycleService,
    @Inject(InMemoryRoundRepository) private readonly rounds: IRoundRepository,
  ) {}

  @Get("health")
  check(): HealthCheckResponseDto {
    return { status: "ok", service: "games" };
  }

  @Get("rounds/current")
  currentRound() {
    const round = this.lifecycle.getCurrentRound();
    if (!round) throw new NotFoundException("No active round");

    return buildRoundStateEvent(
      round,
      this.lifecycle.getCurrentMultiplier(),
      this.lifecycle.getCurrentBettingEndsAt(),
      (betId) => this.lifecycle.getCashoutDetail(betId),
    );
  }

  @Get("rounds/history")
  async roundHistory(@Query("limit") limit = "20") {
    const max = Math.max(1, Math.min(100, Number.parseInt(limit, 10) || 20));
    const rounds = await this.rounds.findAll();

    return rounds
      .filter((round) => round.status === RoundStatus.CRASHED || round.status === RoundStatus.CANCELLED)
      .reverse()
      .slice(0, max)
      .map((round) => ({
        roundId: round.id,
        status: round.status,
        crashMultiplier: round.crashPoint
          ? Number(round.crashPoint.toHundredths()) / 100
          : null,
      }));
  }

  @Get("bets/me")
  @UseGuards(JwtAuthGuard)
  async myBets(@CurrentUser() user?: AuthenticatedUser, @Query("limit") limit = "20") {
    const rounds = await this.rounds.findAll();
    const playerId = user?.sub;
    if (!playerId) return [];
    const max = Math.max(1, Math.min(100, Number.parseInt(limit, 10) || 20));

    return rounds.flatMap((round) =>
      round.bets
        .filter((bet) => bet.playerId === playerId)
        .map((bet) => ({
          roundId: round.id,
          betId: bet.id,
          amountCents: bet.amount.toCents().toString(),
          status: bet.status,
        })),
    ).reverse().slice(0, max);
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
