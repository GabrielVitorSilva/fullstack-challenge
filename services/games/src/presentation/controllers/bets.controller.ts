import { Body, Controller, HttpCode, HttpStatus, NotFoundException, Param, Post } from "@nestjs/common";
import { PlaceBetUseCase } from "../../application/use-cases/place-bet.use-case";
import { CashoutUseCase } from "../../application/use-cases/cashout.use-case";
import { RoundLifecycleService } from "../../application/services/round-lifecycle.service";
import type { PlaceBetRequestDto } from "../dtos/place-bet-request.dto";
import type { CashoutRequestDto } from "../dtos/cashout-request.dto";

@Controller("rounds")
export class BetsController {
  constructor(
    private readonly placeBetUseCase: PlaceBetUseCase,
    private readonly cashoutUseCase: CashoutUseCase,
    private readonly lifecycle: RoundLifecycleService,
  ) {}

  @Post(":roundId/bets")
  @HttpCode(HttpStatus.CREATED)
  async placeBet(
    @Param("roundId") roundId: string,
    @Body() dto: PlaceBetRequestDto,
  ): Promise<void> {
    await this.placeBetUseCase.execute({
      roundId,
      betId: dto.betId,
      playerId: dto.playerId,
      amountCents: BigInt(dto.amountCents),
    });

    this.lifecycle.broadcastBetPlaced({
      roundId,
      betId: dto.betId,
      playerId: dto.playerId,
      amountCents: dto.amountCents,
    });
  }

  @Post(":roundId/bets/:betId/cashout")
  @HttpCode(HttpStatus.OK)
  async cashout(
    @Param("roundId") roundId: string,
    @Param("betId") betId: string,
    @Body() dto: CashoutRequestDto,
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

    await this.cashoutUseCase.execute({
      roundId,
      betId,
      playerId: dto.playerId,
      payoutAmountCents,
    });

    this.lifecycle.broadcastCashout({
      roundId,
      betId,
      playerId: dto.playerId,
      multiplier: this.lifecycle.getCurrentMultiplier(),
      payoutCents: payoutAmountCents.toString(),
    });
  }
}
