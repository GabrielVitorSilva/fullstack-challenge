import { describe, expect, it } from "bun:test";
import { Bet } from "../../src/domain/bet";
import { BetStatus } from "../../src/domain/bet-status";
import { BettingClosedError } from "../../src/domain/errors/betting-closed.error";
import { DuplicateBetError } from "../../src/domain/errors/duplicate-bet.error";
import { InvalidStateTransitionError } from "../../src/domain/errors/invalid-state-transition.error";
import { Money } from "../../src/domain/money";
import { Round } from "../../src/domain/round";
import { RoundStatus } from "../../src/domain/round-status";

const makeBet = (playerId = "player-1", amountCents = 500n): Bet =>
  new Bet(`bet-${playerId}`, playerId, Money.ofCents(amountCents));

const makeRound = (id = "round-1"): Round => new Round(id);

describe("Round", () => {
  describe("creation", () => {
    it("starts in BETTING status", () => {
      expect(makeRound().status).toBe(RoundStatus.BETTING);
    });

    it("starts with no bets", () => {
      expect(makeRound().bets).toHaveLength(0);
    });

    it("exposes its id", () => {
      expect(makeRound("r-42").id).toBe("r-42");
    });
  });

  describe("state transitions", () => {
    it("BETTING → IN_PROGRESS via start()", () => {
      const round = makeRound();
      round.start();
      expect(round.status).toBe(RoundStatus.IN_PROGRESS);
    });

    it("BETTING → CANCELLED via cancel()", () => {
      const round = makeRound();
      round.cancel();
      expect(round.status).toBe(RoundStatus.CANCELLED);
    });

    it("IN_PROGRESS → CRASHED via crash()", () => {
      const round = makeRound();
      round.start();
      round.crash();
      expect(round.status).toBe(RoundStatus.CRASHED);
    });

    it("rejects BETTING → CRASHED (must go through IN_PROGRESS)", () => {
      const round = makeRound();
      expect(() => round.crash()).toThrow(InvalidStateTransitionError);
    });

    it("rejects starting a cancelled round", () => {
      const round = makeRound();
      round.cancel();
      expect(() => round.start()).toThrow(InvalidStateTransitionError);
    });

    it("rejects starting a crashed round", () => {
      const round = makeRound();
      round.start();
      round.crash();
      expect(() => round.start()).toThrow(InvalidStateTransitionError);
    });

    it("rejects crashing an already crashed round", () => {
      const round = makeRound();
      round.start();
      round.crash();
      expect(() => round.crash()).toThrow(InvalidStateTransitionError);
    });

    it("rejects cancelling an in-progress round", () => {
      const round = makeRound();
      round.start();
      expect(() => round.cancel()).toThrow(InvalidStateTransitionError);
    });

    it("error message names the invalid transition", () => {
      const round = makeRound();
      round.cancel();
      expect(() => round.start()).toThrow("CANCELLED");
      expect(() => round.start()).toThrow("IN_PROGRESS");
    });
  });

  describe("placeBet", () => {
    it("accepts a valid bet during BETTING phase", () => {
      const round = makeRound();
      round.placeBet(makeBet("p1"));
      expect(round.bets).toHaveLength(1);
    });

    it("accepts bets from multiple different players", () => {
      const round = makeRound();
      round.placeBet(makeBet("p1"));
      round.placeBet(makeBet("p2"));
      round.placeBet(makeBet("p3"));
      expect(round.bets).toHaveLength(3);
    });

    it("records the correct bet data", () => {
      const round = makeRound();
      round.placeBet(makeBet("p1", 2500n));
      const [bet] = round.bets;
      expect(bet.playerId).toBe("p1");
      expect(bet.amount.toCents()).toBe(2500n);
    });

    it("rejects a bet when round is IN_PROGRESS", () => {
      const round = makeRound();
      round.start();
      expect(() => round.placeBet(makeBet())).toThrow(BettingClosedError);
    });

    it("rejects a bet when round is CRASHED", () => {
      const round = makeRound();
      round.start();
      round.crash();
      expect(() => round.placeBet(makeBet())).toThrow(BettingClosedError);
    });

    it("rejects a bet when round is CANCELLED", () => {
      const round = makeRound();
      round.cancel();
      expect(() => round.placeBet(makeBet())).toThrow(BettingClosedError);
    });

    it("rejects a duplicate bet from the same player", () => {
      const round = makeRound();
      round.placeBet(makeBet("p1"));
      expect(() => round.placeBet(makeBet("p1"))).toThrow(DuplicateBetError);
    });

    it("duplicate bet rejection does not affect existing bets", () => {
      const round = makeRound();
      round.placeBet(makeBet("p1"));
      expect(() => round.placeBet(makeBet("p1"))).toThrow(DuplicateBetError);
      expect(round.bets).toHaveLength(1);
    });

    it("bets list is read-only from outside", () => {
      const round = makeRound();
      const bets = round.bets as Bet[];
      // Pushing to the returned array must not mutate Round state
      bets.push(makeBet("intruder"));
      expect(round.bets).toHaveLength(0);
    });
  });

  describe("late-event safety: PENDING_DEBIT bets on round termination", () => {
    it("crash() voids a PENDING_DEBIT bet so it cannot be confirmed later", () => {
      const round = makeRound();
      round.placeBet(makeBet("p1"));
      round.start();
      round.crash();
      expect(round.bets[0].status).toBe(BetStatus.VOIDED);
    });

    it("crash() marks CONFIRMED bets as LOST and PENDING_DEBIT bets as VOIDED", () => {
      const round = makeRound();
      const pendingBet = makeBet("p1");
      const confirmedBet = makeBet("p2");
      round.placeBet(pendingBet);
      round.placeBet(confirmedBet);
      confirmedBet.confirm();
      round.start();
      round.crash();
      expect(pendingBet.status).toBe(BetStatus.VOIDED);
      expect(confirmedBet.status).toBe(BetStatus.LOST);
    });

    it("cancel() voids a PENDING_DEBIT bet", () => {
      const round = makeRound();
      round.placeBet(makeBet("p1"));
      round.cancel();
      expect(round.bets[0].status).toBe(BetStatus.VOIDED);
    });

    it("cancel() leaves already-terminal bets unchanged", () => {
      const round = makeRound();
      const bet = makeBet("p1");
      round.placeBet(bet);
      bet.failDebit();
      round.cancel();
      expect(bet.status).toBe(BetStatus.DEBIT_FAILED);
    });
  });
});
