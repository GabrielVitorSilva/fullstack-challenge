export class BetNotFoundError extends Error {
  constructor(betId: string) {
    super(`Bet ${betId} not found in this round`);
    this.name = "BetNotFoundError";
  }
}
