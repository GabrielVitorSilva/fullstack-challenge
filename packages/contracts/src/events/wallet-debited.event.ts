import type { MessageEnvelope } from "../base/message-envelope";

export const WALLET_DEBITED_EVENT = "wallet.debited" as const;

/**
 * Published by Wallet when a debit is successfully processed.
 * Signals to Game that the bet is confirmed and the player's funds are reserved.
 */
export interface WalletDebitedEvent extends MessageEnvelope {
  readonly type: typeof WALLET_DEBITED_EVENT;
  readonly betId: string;
  readonly roundId: string;
  readonly playerId: string;
  readonly amountCents: string;
}

export function buildWalletDebitedEvent(
  betId: string,
  roundId: string,
  playerId: string,
  amountCents: bigint,
): WalletDebitedEvent {
  return {
    type: WALLET_DEBITED_EVENT,
    correlationId: betId,
    occurredAt: new Date().toISOString(),
    betId,
    roundId,
    playerId,
    amountCents: amountCents.toString(),
  };
}
