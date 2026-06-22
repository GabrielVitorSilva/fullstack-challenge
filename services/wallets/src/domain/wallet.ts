import { InsufficientFundsError } from "./errors/insufficient-funds.error";
import { Money } from "./money";

export class Wallet {
  private _balance: Money;

  constructor(
    private readonly _id: string,
    private readonly _userId: string,
    initialBalance: Money = Money.zero(),
  ) {
    this._balance = initialBalance;
  }

  get id(): string {
    return this._id;
  }

  get userId(): string {
    return this._userId;
  }

  get balance(): Money {
    return this._balance;
  }

  credit(amount: Money): void {
    this._balance = this._balance.add(amount);
  }

  debit(amount: Money): void {
    if (this._balance.isLessThan(amount)) {
      throw new InsufficientFundsError();
    }
    this._balance = this._balance.subtract(amount);
  }
}
