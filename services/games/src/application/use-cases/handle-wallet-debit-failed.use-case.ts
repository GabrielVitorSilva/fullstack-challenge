import type { WalletDebitFailedEvent } from "@crash/contracts";
import { BetStatus } from "../../domain/bet-status";
import { BetNotFoundError } from "../../domain/errors/bet-not-found.error";
import { IRoundRepository } from "../../domain/ports/round-repository.port";

/**
 * Reacts to WalletDebitFailedEvent: marks the bet as DEBIT_FAILED,
 * removing it from the active bets in this round.
 *
 * Late-arrival guard: if the round already ended (bet is VOIDED), the failure
 * event is a no-op — the bet is already in a terminal state and no debit
 * occurred, so there is nothing to undo.
 */
export class HandleWalletDebitFailedUseCase {
  constructor(private readonly rounds: IRoundRepository) {}

  async execute(event: WalletDebitFailedEvent): Promise<void> {
    const round = await this.rounds.findById(event.roundId);
    if (!round) throw new Error(`Round ${event.roundId} not found`);

    const bet = round.findBet(event.betId);
    if (!bet) throw new BetNotFoundError(event.betId);

    if (bet.status === BetStatus.VOIDED) {
      return;
    }

    round.failBet(event.betId);
    await this.rounds.save(round);
  }
}
