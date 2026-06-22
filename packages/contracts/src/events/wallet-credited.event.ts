import type { MessageEnvelope } from "../base/message-envelope";

export const WALLET_CREDITED_EVENT = "wallet.credited" as const;

/**
 * Published by Wallet when a cashout credit is successfully processed.
 * Game can use this to finalize the bet as CASHED_OUT and update leaderboards.
 */
export interface WalletCreditedEvent extends MessageEnvelope {
  readonly type: typeof WALLET_CREDITED_EVENT;
  readonly betId: string;
  readonly roundId: string;
  readonly playerId: string;
  readonly amountCents: string;
}

export function buildWalletCreditedEvent(
  betId: string,
  roundId: string,
  playerId: string,
  amountCents: bigint,
): WalletCreditedEvent {
  return {
    type: WALLET_CREDITED_EVENT,
    correlationId: betId,
    occurredAt: new Date().toISOString(),
    betId,
    roundId,
    playerId,
    amountCents: amountCents.toString(),
  };
}
