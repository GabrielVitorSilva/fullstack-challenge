export enum BetStatus {
  PENDING_DEBIT = "PENDING_DEBIT",
  CONFIRMED = "CONFIRMED",
  DEBIT_FAILED = "DEBIT_FAILED",
  CASHED_OUT = "CASHED_OUT",
  LOST = "LOST",
  /**
   * The round ended (crash or cancel) while this bet was still awaiting wallet
   * confirmation. If a WalletDebitedEvent arrives after this, the game must
   * issue a compensating credit to refund the player.
   */
  VOIDED = "VOIDED",
  /**
   * A compensating CreditWalletCommand has been dispatched via the outbox for
   * this VOIDED bet. This is a terminal, persistent state: any storage layer
   * that serialises BetStatus automatically preserves it across process restarts,
   * making the idempotency guard in HandleWalletDebitedUseCase effective even
   * after a crash-and-replay scenario.
   *
   * Prefer this over a separate boolean flag because:
   *  - it lives in the state machine, so VALID_BET_TRANSITIONS enforces it;
   *  - any mapper that handles BetStatus columns handles this for free;
   *  - no extra field to serialise, restore, or forget.
   */
  VOIDED_COMPENSATED = "VOIDED_COMPENSATED",
}

export const VALID_BET_TRANSITIONS: Record<BetStatus, BetStatus[]> = {
  [BetStatus.PENDING_DEBIT]: [BetStatus.CONFIRMED, BetStatus.DEBIT_FAILED, BetStatus.VOIDED],
  [BetStatus.CONFIRMED]: [BetStatus.CASHED_OUT, BetStatus.LOST],
  [BetStatus.DEBIT_FAILED]: [],
  [BetStatus.CASHED_OUT]: [],
  [BetStatus.LOST]: [],
  [BetStatus.VOIDED]: [BetStatus.VOIDED_COMPENSATED],
  [BetStatus.VOIDED_COMPENSATED]: [],
};
