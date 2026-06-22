import type { MessageEnvelope } from "../base/message-envelope";

export const DEBIT_WALLET_COMMAND = "wallet.debit" as const;

/**
 * Emitted by Game when a player places a bet.
 * amountCents is a string representation of bigint to survive JSON serialization.
 */
export interface DebitWalletCommand extends MessageEnvelope {
  readonly type: typeof DEBIT_WALLET_COMMAND;
  readonly betId: string;
  readonly roundId: string;
  readonly playerId: string;
  readonly amountCents: string;
}

export function buildDebitWalletCommand(
  betId: string,
  roundId: string,
  playerId: string,
  amountCents: bigint,
): DebitWalletCommand {
  return {
    type: DEBIT_WALLET_COMMAND,
    correlationId: betId,
    occurredAt: new Date().toISOString(),
    betId,
    roundId,
    playerId,
    amountCents: amountCents.toString(),
  };
}
