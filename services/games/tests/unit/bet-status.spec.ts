import { describe, expect, it } from "bun:test";
import { Bet } from "../../src/domain/bet";
import { BetStatus } from "../../src/domain/bet-status";
import { InvalidBetStateError } from "../../src/domain/errors/invalid-bet-state.error";
import { Money } from "../../src/domain/money";

const makeBet = (amountCents = 500n): Bet =>
  new Bet("bet-1", "player-1", Money.ofCents(amountCents));

describe("BetStatus transitions", () => {
  it("starts as PENDING_DEBIT", () => {
    expect(makeBet().status).toBe(BetStatus.PENDING_DEBIT);
  });

  it("PENDING_DEBIT → CONFIRMED via confirm()", () => {
    const bet = makeBet();
    bet.confirm();
    expect(bet.status).toBe(BetStatus.CONFIRMED);
  });

  it("PENDING_DEBIT → DEBIT_FAILED via failDebit()", () => {
    const bet = makeBet();
    bet.failDebit();
    expect(bet.status).toBe(BetStatus.DEBIT_FAILED);
  });

  it("CONFIRMED → CASHED_OUT via cashout()", () => {
    const bet = makeBet();
    bet.confirm();
    bet.cashout();
    expect(bet.status).toBe(BetStatus.CASHED_OUT);
  });

  it("CONFIRMED → LOST via markAsLost()", () => {
    const bet = makeBet();
    bet.confirm();
    bet.markAsLost();
    expect(bet.status).toBe(BetStatus.LOST);
  });

  it("rejects PENDING_DEBIT → CASHED_OUT (must confirm first)", () => {
    const bet = makeBet();
    expect(() => bet.cashout()).toThrow(InvalidBetStateError);
  });

  it("rejects PENDING_DEBIT → LOST (must confirm first)", () => {
    const bet = makeBet();
    expect(() => bet.markAsLost()).toThrow(InvalidBetStateError);
  });

  it("rejects confirming a DEBIT_FAILED bet", () => {
    const bet = makeBet();
    bet.failDebit();
    expect(() => bet.confirm()).toThrow(InvalidBetStateError);
  });

  it("rejects double confirmation", () => {
    const bet = makeBet();
    bet.confirm();
    expect(() => bet.confirm()).toThrow(InvalidBetStateError);
  });

  it("rejects transitioning a CASHED_OUT bet", () => {
    const bet = makeBet();
    bet.confirm();
    bet.cashout();
    expect(() => bet.markAsLost()).toThrow(InvalidBetStateError);
  });

  it("error message names both states", () => {
    const bet = makeBet();
    try {
      bet.cashout();
    } catch (err) {
      expect((err as Error).message).toContain("PENDING_DEBIT");
      expect((err as Error).message).toContain("CASHED_OUT");
    }
  });

  describe("VOIDED state", () => {
    it("PENDING_DEBIT → VOIDED via void()", () => {
      const bet = makeBet();
      bet.void();
      expect(bet.status).toBe(BetStatus.VOIDED);
    });

    it("rejects VOIDED → CONFIRMED (core protection against late events)", () => {
      const bet = makeBet();
      bet.void();
      expect(() => bet.confirm()).toThrow(InvalidBetStateError);
    });

    it("rejects VOIDED → DEBIT_FAILED", () => {
      const bet = makeBet();
      bet.void();
      expect(() => bet.failDebit()).toThrow(InvalidBetStateError);
    });

    it("rejects CONFIRMED → VOIDED (void is only for pending bets)", () => {
      const bet = makeBet();
      bet.confirm();
      expect(() => bet.void()).toThrow(InvalidBetStateError);
    });

    it("rejects double void", () => {
      const bet = makeBet();
      bet.void();
      expect(() => bet.void()).toThrow(InvalidBetStateError);
    });
  });

  describe("VOIDED_COMPENSATED state", () => {
    it("VOIDED → VOIDED_COMPENSATED via issueCompensation()", () => {
      const bet = makeBet();
      bet.void();
      bet.issueCompensation();
      expect(bet.status).toBe(BetStatus.VOIDED_COMPENSATED);
    });

    it("rejects VOIDED_COMPENSATED → any further transition (terminal state)", () => {
      const bet = makeBet();
      bet.void();
      bet.issueCompensation();
      expect(() => bet.confirm()).toThrow(InvalidBetStateError);
      expect(() => bet.failDebit()).toThrow(InvalidBetStateError);
      expect(() => bet.void()).toThrow(InvalidBetStateError);
      expect(() => bet.issueCompensation()).toThrow(InvalidBetStateError);
    });

    it("rejects issueCompensation() when bet is not VOIDED", () => {
      const pending = makeBet();
      expect(() => pending.issueCompensation()).toThrow(InvalidBetStateError);

      const confirmed = makeBet();
      confirmed.confirm();
      expect(() => confirmed.issueCompensation()).toThrow(InvalidBetStateError);
    });

    it("Bet.rehydrate() restores VOIDED_COMPENSATED status correctly", () => {
      const bet = Bet.rehydrate("b", "p", Money.ofCents(100n), BetStatus.VOIDED_COMPENSATED);
      expect(bet.status).toBe(BetStatus.VOIDED_COMPENSATED);
    });

    it("rehydrated VOIDED_COMPENSATED bet is terminal: no further transitions", () => {
      const bet = Bet.rehydrate("b", "p", Money.ofCents(100n), BetStatus.VOIDED_COMPENSATED);
      expect(() => bet.confirm()).toThrow(InvalidBetStateError);
      expect(() => bet.issueCompensation()).toThrow(InvalidBetStateError);
    });
  });
});
