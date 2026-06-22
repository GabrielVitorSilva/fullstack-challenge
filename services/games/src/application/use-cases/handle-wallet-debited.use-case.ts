import { buildCreditWalletCommand, type WalletDebitedEvent } from "@crash/contracts";
import { BetStatus } from "../../domain/bet-status";
import { BetNotFoundError } from "../../domain/errors/bet-not-found.error";
import { IRoundRepository } from "../../domain/ports/round-repository.port";
import { IOutbox } from "../ports/outbox.port";

/**
 * Reacts to WalletDebitedEvent: marks the pending bet as CONFIRMED.
 *
 * Idempotency guards (all survive process restarts because they rely on
 * BetStatus, which is persisted as part of the normal aggregate snapshot):
 *
 *   CONFIRMED          — bet was already confirmed; no-op on duplicate event.
 *   VOIDED_COMPENSATED — compensating credit was already dispatched and the
 *                        status was persisted via the outbox. No-op even after
 *                        a process restart + broker replay.
 *
 * Late-arrival path:
 *   VOIDED — round ended (crash / cancel) while the debit was in-flight.
 *            Call issueCompensation() to transition to VOIDED_COMPENSATED,
 *            then emit the CreditWalletCommand via the outbox so that the
 *            status update and the outbound message are written atomically.
 */
export class HandleWalletDebitedUseCase {
  constructor(
    private readonly rounds: IRoundRepository,
    private readonly outbox: IOutbox,
  ) {}

  async execute(event: WalletDebitedEvent): Promise<void> {
    const round = await this.rounds.findById(event.roundId);
    if (!round) throw new Error(`Round ${event.roundId} not found`);

    const bet = round.findBet(event.betId);
    if (!bet) throw new BetNotFoundError(event.betId);

    // Duplicate happy-path event — no-op
    if (bet.status === BetStatus.CONFIRMED) return;

    // Duplicate late-arrival event (including after process restart) — no-op
    if (bet.status === BetStatus.VOIDED_COMPENSATED) return;

    if (bet.status === BetStatus.VOIDED) {
      bet.issueCompensation(); // VOIDED → VOIDED_COMPENSATED
      await this.outbox.saveAndEmit(round, [
        buildCreditWalletCommand(
          event.betId,
          event.roundId,
          event.playerId,
          BigInt(event.amountCents),
        ),
      ]);
      return;
    }

    round.confirmBet(event.betId);
    await this.rounds.save(round);
  }
}
