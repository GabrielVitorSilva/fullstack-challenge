import { Bet } from "./bet";
import { BettingClosedError } from "./errors/betting-closed.error";
import { DuplicateBetError } from "./errors/duplicate-bet.error";
import { InvalidStateTransitionError } from "./errors/invalid-state-transition.error";
import { RoundStatus, VALID_TRANSITIONS } from "./round-status";

export class Round {
  private _status: RoundStatus;
  private readonly _bets: Bet[] = [];

  constructor(private readonly _id: string) {
    this._status = RoundStatus.BETTING;
  }

  get id(): string {
    return this._id;
  }

  get status(): RoundStatus {
    return this._status;
  }

  get bets(): ReadonlyArray<Bet> {
    return [...this._bets];
  }

  placeBet(bet: Bet): void {
    if (this._status !== RoundStatus.BETTING) {
      throw new BettingClosedError();
    }
    if (this._bets.some((b) => b.playerId === bet.playerId)) {
      throw new DuplicateBetError(bet.playerId);
    }
    this._bets.push(bet);
  }

  start(): void {
    this.transitionTo(RoundStatus.IN_PROGRESS);
  }

  crash(): void {
    this.transitionTo(RoundStatus.CRASHED);
  }

  cancel(): void {
    this.transitionTo(RoundStatus.CANCELLED);
  }

  private transitionTo(next: RoundStatus): void {
    if (!VALID_TRANSITIONS[this._status].includes(next)) {
      throw new InvalidStateTransitionError(this._status, next);
    }
    this._status = next;
  }
}
