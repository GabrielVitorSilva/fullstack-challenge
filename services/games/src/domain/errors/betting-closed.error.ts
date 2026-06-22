export class BettingClosedError extends Error {
  constructor() {
    super("Bets are only accepted while the round is in the BETTING phase");
    this.name = "BettingClosedError";
  }
}
