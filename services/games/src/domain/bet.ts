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

  private transitionTo(next: BetStatus): void {
    if (!VALID_BET_TRANSITIONS[this._status].includes(next)) {
      throw new InvalidBetStateError(this._status, next);
    }
    this._status = next;
  }
}
