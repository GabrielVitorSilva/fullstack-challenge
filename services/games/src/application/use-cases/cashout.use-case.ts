import { buildCreditWalletCommand } from "@crash/contracts";
import { IOutbox } from "../ports/outbox.port";
import { IRoundRepository } from "../../domain/ports/round-repository.port";

export interface CashoutInput {
  readonly roundId: string;
  readonly betId: string;
  readonly playerId: string;
  /**
   * The payout amount in cents (betAmount * multiplier), calculated by the caller.
   * Multiplier logic is not part of this use case.
   */
  readonly payoutAmountCents: bigint;
}

/**
 * Records the cashout on the bet and emits CreditWalletCommand with the payout.
 *
 * Round state and the outbound command are persisted atomically via IOutbox.
 */
export class CashoutUseCase {
  constructor(
    private readonly rounds: IRoundRepository,
    private readonly outbox: IOutbox,
  ) {}

  async execute(input: CashoutInput): Promise<void> {
    const round = await this.rounds.findById(input.roundId);
    if (!round) throw new Error(`Round ${input.roundId} not found`);

    round.cashoutBet(input.betId);

    await this.outbox.saveAndEmit(round, [
      buildCreditWalletCommand(
        input.betId,
        input.roundId,
        input.playerId,
        input.payoutAmountCents,
      ),
    ]);
  }
}
