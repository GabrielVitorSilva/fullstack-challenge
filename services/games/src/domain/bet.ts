import { Money } from "./money";

export class Bet {
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
}
