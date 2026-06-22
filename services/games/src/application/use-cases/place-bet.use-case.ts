import { buildDebitWalletCommand } from "@crash/contracts";
import { IOutbox } from "../ports/outbox.port";
import { Bet } from "../../domain/bet";
import { Money } from "../../domain/money";
import { IRoundRepository } from "../../domain/ports/round-repository.port";

export interface PlaceBetInput {
  readonly roundId: string;
  readonly betId: string;
  readonly playerId: string;
  readonly amountCents: bigint;
}

/**
 * Registers the bet on the round (status: PENDING_DEBIT) and emits
 * DebitWalletCommand. The bet is only considered active once the Wallet
 * confirms the debit via WalletDebitedEvent → HandleWalletDebitedUseCase.
 *
 * Round state and the outbound command are persisted atomically via IOutbox to
 * prevent the state from advancing without the command being delivered.
 */
export class PlaceBetUseCase {
  constructor(
    private readonly rounds: IRoundRepository,
    private readonly outbox: IOutbox,
  ) {}

  async execute(input: PlaceBetInput): Promise<void> {
    const round = await this.rounds.findById(input.roundId);
    if (!round) throw new Error(`Round ${input.roundId} not found`);

    const bet = new Bet(input.betId, input.playerId, Money.ofCents(input.amountCents));
    round.placeBet(bet);

    await this.outbox.saveAndEmit(round, [
      buildDebitWalletCommand(input.betId, input.roundId, input.playerId, input.amountCents),
    ]);
  }
}
