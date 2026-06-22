import { BetStatus, VALID_BET_TRANSITIONS } from "./bet-status";
import { InvalidBetStateError } from "./errors/invalid-bet-state.error";
import { Money } from "./money";

export class Bet {
  private _status: BetStatus;

  constructor(
    private readonly _id: string,
    private readonly _playerId: string,
    private readonly _amount: Money,
  ) {
    if (!_playerId.trim()) {
      throw new Error("Bet must be associated with a player");
    }
    if (!_amount.isPositive()) {
      throw new Error("Bet amount must be greater than zero");
    }
    this._status = BetStatus.PENDING_DEBIT;
  }

  /**
   * Reconstructs a Bet from persisted state (e.g. a database row).
   * Use only in repository mappers — normal construction always starts at
   * PENDING_DEBIT. Crucially, VOIDED_COMPENSATED is restored here, which
   * is what makes the idempotency guard survive a process restart.
   */
  static rehydrate(
    id: string,
    playerId: string,
    amount: Money,
    status: BetStatus,
  ): Bet {
    const bet = new Bet(id, playerId, amount);
    bet._status = status;
    return bet;
  }

  get id(): string {
    return this._id;
  }

  get playerId(): string {
    return this._playerId;
  }

  get amount(): Money {
    return this._amount;
  }

  get status(): BetStatus {
    return this._status;
  }

  confirm(): void {
    this.transitionTo(BetStatus.CONFIRMED);
  }

  failDebit(): void {
    this.transitionTo(BetStatus.DEBIT_FAILED);
  }

  cashout(): void {
    this.transitionTo(BetStatus.CASHED_OUT);
  }

  markAsLost(): void {
    this.transitionTo(BetStatus.LOST);
  }

  void(): void {
    this.transitionTo(BetStatus.VOIDED);
  }

  /**
   * Transitions the bet to VOIDED_COMPENSATED, recording that the compensating
   * CreditWalletCommand has been dispatched via the outbox.
   *
   * Because VOIDED_COMPENSATED is a first-class BetStatus value (not a separate
   * boolean), it is automatically persisted by any mapper that stores the status
   * column, and automatically restored by Bet.rehydrate(). This is what prevents
   * a duplicate refund after a process restart.
   */
  issueCompensation(): void {
    this.transitionTo(BetStatus.VOIDED_COMPENSATED);
  }

  private transitionTo(next: BetStatus): void {
    if (!VALID_BET_TRANSITIONS[this._status].includes(next)) {
      throw new InvalidBetStateError(this._status, next);
    }
    this._status = next;
  }
}
