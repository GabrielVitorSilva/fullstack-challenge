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
}

export const VALID_BET_TRANSITIONS: Record<BetStatus, BetStatus[]> = {
  [BetStatus.PENDING_DEBIT]: [BetStatus.CONFIRMED, BetStatus.DEBIT_FAILED, BetStatus.VOIDED],
  [BetStatus.CONFIRMED]: [BetStatus.CASHED_OUT, BetStatus.LOST],
  [BetStatus.DEBIT_FAILED]: [],
  [BetStatus.CASHED_OUT]: [],
  [BetStatus.LOST]: [],
  [BetStatus.VOIDED]: [],
};
