import { BetStatus } from "../bet-status";

export class InvalidBetStateError extends Error {
  constructor(from: BetStatus, to: BetStatus) {
    super(`Cannot transition bet from ${from} to ${to}`);
    this.name = "InvalidBetStateError";
  }
}
