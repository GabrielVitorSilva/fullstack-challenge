import type { MessageEnvelope } from "../base/message-envelope";

export const CREDIT_WALLET_COMMAND = "wallet.credit" as const;

/**
 * Emitted by Game when a player cashes out.
 * amountCents represents the final payout (betAmount * cashoutMultiplier).
 * amountCents is a string representation of bigint to survive JSON serialization.
 */
export interface CreditWalletCommand extends MessageEnvelope {
  readonly type: typeof CREDIT_WALLET_COMMAND;
  readonly betId: string;
  readonly roundId: string;
  readonly playerId: string;
  readonly amountCents: string;
}

export function buildCreditWalletCommand(
  betId: string,
  roundId: string,
  playerId: string,
  amountCents: bigint,
): CreditWalletCommand {
  return {
    type: CREDIT_WALLET_COMMAND,
    correlationId: betId,
    occurredAt: new Date().toISOString(),
    betId,
    roundId,
    playerId,
    amountCents: amountCents.toString(),
  };
}
