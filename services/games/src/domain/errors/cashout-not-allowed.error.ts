import { RoundStatus } from "../round-status";

export class CashoutNotAllowedError extends Error {
  constructor(currentStatus: RoundStatus) {
    super(`Cashout is only allowed during IN_PROGRESS — round is ${currentStatus}`);
    this.name = "CashoutNotAllowedError";
  }
}
