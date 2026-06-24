import { randomUUID } from "node:crypto";
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { PlaceBetUseCase } from "../../application/use-cases/place-bet.use-case";
import { CashoutUseCase } from "../../application/use-cases/cashout.use-case";
import { RoundLifecycleService } from "../../application/services/round-lifecycle.service";
import { BetStatus } from "../../domain/bet-status";
import { JwtAuthGuard } from "../../infrastructure/auth/jwt-auth.guard";
import { CurrentUser } from "../../infrastructure/auth/current-user.decorator";
import type { AuthenticatedUser } from "../../infrastructure/auth/authenticated-user";
import type { PlaceBetRequestDto } from "../dtos/place-bet-request.dto";
import type { CashoutRequestDto } from "../dtos/cashout-request.dto";

@Controller()
export class BetsController {
  constructor(
    private readonly placeBetUseCase: PlaceBetUseCase,
    private readonly cashoutUseCase: CashoutUseCase,
    private readonly lifecycle: RoundLifecycleService,
  ) {}

  @Post("rounds/:roundId/bets")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async placeBet(
    @Param("roundId") roundId: string,
    @Body() dto: PlaceBetRequestDto,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<{ roundId: string; betId: string }> {
    return this.placeBetForRound(roundId, dto, user);
  }

  @Post("bet")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async placeBetOnCurrentRound(
    @Body() dto: PlaceBetRequestDto,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<{ roundId: string; betId: string }> {
    const round = this.lifecycle.getCurrentRound();
    if (!round) {
      throw new NotFoundException("No active round");
    }

    return this.placeBetForRound(round.id, dto, user);
  }

  @Post("rounds/:roundId/bets/:betId/cashout")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async cashout(
    @Param("roundId") roundId: string,
    @Param("betId") betId: string,
    @Body() dto: CashoutRequestDto,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<void> {
    await this.cashoutBet(roundId, betId, dto, user);
  }

  @Post("bet/cashout")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async cashoutCurrentRound(
    @Body() dto: CashoutRequestDto,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<void> {
    const round = this.lifecycle.getCurrentRound();
    if (!round) {
      throw new NotFoundException("No active round");
    }

    const playerId = user?.sub ?? dto.playerId;
    if (!playerId) throw new NotFoundException("Player not found");

    const betId =
      dto.betId ??
      round.bets.find((bet) => bet.playerId === playerId && bet.status === BetStatus.CONFIRMED)?.id;

    if (!betId) {
      throw new NotFoundException(`No cashoutable bet found for player ${playerId}`);
    }

    await this.cashoutBet(round.id, betId, dto, user);
  }

  private async placeBetForRound(
    roundId: string,
    dto: PlaceBetRequestDto,
    user?: AuthenticatedUser,
  ): Promise<{ roundId: string; betId: string }> {
    const betId = dto.betId ?? randomUUID();
    const playerId = user?.sub ?? dto.playerId;
    if (!playerId) throw new NotFoundException("Player not found");

    await this.placeBetUseCase.execute({
      roundId,
      betId,
      playerId,
      amountCents: BigInt(dto.amountCents),
    });

    this.lifecycle.broadcastBetPlaced({
      roundId,
      betId,
      playerId,
      amountCents: dto.amountCents,
    });

    return { roundId, betId };
  }

  private async cashoutBet(
    roundId: string,
    betId: string,
    dto: CashoutRequestDto,
    user?: AuthenticatedUser,
  ): Promise<void> {
    const round = this.lifecycle.getCurrentRound();
    if (!round || round.id !== roundId) {
      throw new NotFoundException(`Round ${roundId} is not the active round`);
    }

    const bet = round.findBet(betId);
    if (!bet) {
      throw new NotFoundException(`Bet ${betId} not found`);
    }

    // Use the integer hundredths accessor so the payout matches exactly what
    // the player saw on screen (same 2-dp value, no float-multiplication error).
    const multiplierHundredths = this.lifecycle.getCurrentMultiplierHundredths();
    const payoutAmountCents = (bet.amount.toCents() * multiplierHundredths) / 100n;
    const playerId = user?.sub ?? dto.playerId;
    if (!playerId) throw new NotFoundException("Player not found");

    await this.cashoutUseCase.execute({
      roundId,
      betId,
      playerId,
      payoutAmountCents,
    });

    this.lifecycle.broadcastCashout({
      roundId,
      betId,
      playerId,
      multiplier: this.lifecycle.getCurrentMultiplier(),
      payoutCents: payoutAmountCents.toString(),
    });
  }
}
