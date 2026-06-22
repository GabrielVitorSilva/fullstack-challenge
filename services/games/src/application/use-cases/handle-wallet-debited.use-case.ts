import { buildCreditWalletCommand, type WalletDebitedEvent } from "@crash/contracts";
import { BetStatus } from "../../domain/bet-status";
import { BetNotFoundError } from "../../domain/errors/bet-not-found.error";
import { IEventPublisher } from "../../domain/ports/event-publisher.port";
import { IRoundRepository } from "../../domain/ports/round-repository.port";

/**
 * Reacts to WalletDebitedEvent: marks the pending bet as CONFIRMED,
 * meaning the player's funds are reserved and the bet is active.
 *
 * Late-arrival guard: if the round crashed or was cancelled before this event
 * arrived, the bet is VOIDED. In that case we cannot confirm the bet, and we
 * must issue a compensating CreditWalletCommand to refund the player's money.
 *
 * Note: the compensating credit is published best-effort (no outbox for
 * events that don't accompany a round-state change). Idempotent retry is safe
 * because a VOIDED bet never transitions further.
 */
export class HandleWalletDebitedUseCase {
  constructor(
    private readonly rounds: IRoundRepository,
    private readonly publisher: IEventPublisher,
  ) {}

  async execute(event: WalletDebitedEvent): Promise<void> {
    const round = await this.rounds.findById(event.roundId);
    if (!round) throw new Error(`Round ${event.roundId} not found`);

    const bet = round.findBet(event.betId);
    if (!bet) throw new BetNotFoundError(event.betId);

    if (bet.status === BetStatus.VOIDED) {
      await this.publisher.publish(
        buildCreditWalletCommand(
          event.betId,
          event.roundId,
          event.playerId,
          BigInt(event.amountCents),
        ),
      );
      return;
    }

    round.confirmBet(event.betId);
    await this.rounds.save(round);
  }
}
