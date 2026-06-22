import { RoundStatus } from "../round-status";

export class InvalidStateTransitionError extends Error {
  constructor(from: RoundStatus, to: RoundStatus) {
    super(`Cannot transition round from ${from} to ${to}`);
    this.name = "InvalidStateTransitionError";
  }
}
