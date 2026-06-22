import type { MessageEnvelope } from "../base/message-envelope";

export const WALLET_DEBIT_FAILED_EVENT = "wallet.debit_failed" as const;

export type DebitFailureReason = "INSUFFICIENT_FUNDS" | "WALLET_NOT_FOUND";

/**
 * Published by Wallet when a debit cannot be processed.
 * Game must react by removing or invalidating the pending bet.
 */
export interface WalletDebitFailedEvent extends MessageEnvelope {
  readonly type: typeof WALLET_DEBIT_FAILED_EVENT;
  readonly betId: string;
  readonly roundId: string;
  readonly playerId: string;
  readonly reason: DebitFailureReason;
}

export function buildWalletDebitFailedEvent(
  betId: string,
  roundId: string,
  playerId: string,
  reason: DebitFailureReason,
): WalletDebitFailedEvent {
  return {
    type: WALLET_DEBIT_FAILED_EVENT,
    correlationId: betId,
    occurredAt: new Date().toISOString(),
    betId,
    roundId,
    playerId,
    reason,
  };
}
