import { Bet } from "./bet";
import { BetStatus } from "./bet-status";
import { BetNotFoundError } from "./errors/bet-not-found.error";
import { BettingClosedError } from "./errors/betting-closed.error";
import { CashoutNotAllowedError } from "./errors/cashout-not-allowed.error";
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

  findBet(betId: string): Bet | undefined {
    return this._bets.find((b) => b.id === betId);
  }

  confirmBet(betId: string): void {
    this.requireBet(betId).confirm();
  }

  failBet(betId: string): void {
    this.requireBet(betId).failDebit();
  }

  cashoutBet(betId: string): void {
    if (this._status !== RoundStatus.IN_PROGRESS) {
      throw new CashoutNotAllowedError(this._status);
    }
    this.requireBet(betId).cashout();
  }

  start(): void {
    this.transitionTo(RoundStatus.IN_PROGRESS);
  }

  crash(): void {
    this.transitionTo(RoundStatus.CRASHED);
    for (const bet of this._bets) {
      if (bet.status === BetStatus.CONFIRMED) {
        bet.markAsLost();
      } else if (bet.status === BetStatus.PENDING_DEBIT) {
        // Wallet debit may still be in-flight. VOIDED signals that a late
        // WalletDebitedEvent must be compensated with a refund credit.
        bet.void();
      }
    }
  }

  cancel(): void {
    this.transitionTo(RoundStatus.CANCELLED);
    for (const bet of this._bets) {
      if (bet.status === BetStatus.PENDING_DEBIT) {
        bet.void();
      }
      // CONFIRMED bets on cancellation need a refund to the player.
      // That compensation flow (credit command back to wallet) is handled by a
      // dedicated use case outside this aggregate and is out of scope here.
    }
  }

  private requireBet(betId: string): Bet {
    const bet = this.findBet(betId);
    if (!bet) throw new BetNotFoundError(betId);
    return bet;
  }

  private transitionTo(next: RoundStatus): void {
    if (!VALID_TRANSITIONS[this._status].includes(next)) {
      throw new InvalidStateTransitionError(this._status, next);
    }
    this._status = next;
  }
}
