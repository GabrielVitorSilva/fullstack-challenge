import { describe, expect, it } from "bun:test";
import { Bet } from "../../src/domain/bet";
import { Money } from "../../src/domain/money";

const makeBet = (
  id = "bet-1",
  playerId = "player-1",
  amountCents = 1000n,
): Bet => new Bet(id, playerId, Money.ofCents(amountCents));

describe("Bet", () => {
  describe("creation", () => {
    it("creates a bet with valid data", () => {
      const bet = makeBet();
      expect(bet.id).toBe("bet-1");
      expect(bet.playerId).toBe("player-1");
      expect(bet.amount.toCents()).toBe(1000n);
    });

    it("rejects a zero amount", () => {
      expect(() => makeBet("b", "p", 0n)).toThrow(
        "Bet amount must be greater than zero",
      );
    });

    it("rejects an empty playerId", () => {
      expect(() => new Bet("b", "  ", Money.ofCents(100n))).toThrow(
        "Bet must be associated with a player",
      );
    });

    it("allows very large bet amounts", () => {
      const large = 9_007_199_254_740_992n;
      const bet = makeBet("b", "p", large);
      expect(bet.amount.toCents()).toBe(large);
    });
  });
});
