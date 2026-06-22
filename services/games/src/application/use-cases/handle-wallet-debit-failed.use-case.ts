import type { WalletDebitFailedEvent } from "@crash/contracts";
import { BetStatus } from "../../domain/bet-status";
import { BetNotFoundError } from "../../domain/errors/bet-not-found.error";
import { IRoundRepository } from "../../domain/ports/round-repository.port";

/**
 * Reacts to WalletDebitFailedEvent: marks the bet as DEBIT_FAILED,
 * removing it from the active bets in this round.
 *
 * Idempotency (duplicate-event safety):
 *   DEBIT_FAILED — bet was already failed; silently ignore the replay.
 *
 * Late-arrival guard:
 *   VOIDED — the round ended before the debit was attempted. No debit
 *            occurred so there is nothing to undo; this is a no-op.
 */
export class HandleWalletDebitFailedUseCase {
  constructor(private readonly rounds: IRoundRepository) {}

  async execute(event: WalletDebitFailedEvent): Promise<void> {
    const round = await this.rounds.findById(event.roundId);
    if (!round) throw new Error(`Round ${event.roundId} not found`);

    const bet = round.findBet(event.betId);
    if (!bet) throw new BetNotFoundError(event.betId);

    // Duplicate event: bet was already failed — no-op
    if (bet.status === BetStatus.DEBIT_FAILED) return;

    // Late-arrival: round ended before debit occurred — no financial effect,
    // nothing to undo
    if (bet.status === BetStatus.VOIDED) return;

    round.failBet(event.betId);
    await this.rounds.save(round);
  }
}
