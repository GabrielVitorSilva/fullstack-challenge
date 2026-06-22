import { describe, expect, it } from "bun:test";
import { InsufficientFundsError } from "../../src/domain/errors/insufficient-funds.error";
import { Money } from "../../src/domain/money";
import { Wallet } from "../../src/domain/wallet";

const makeWallet = (balanceCents = 0n) =>
  new Wallet("wallet-1", "user-1", Money.ofCents(balanceCents));

describe("Wallet", () => {
  describe("initial state", () => {
    it("starts with zero balance by default", () => {
      const wallet = new Wallet("w1", "u1");
      expect(wallet.balance.equals(Money.zero())).toBe(true);
    });

    it("accepts an initial balance", () => {
      const wallet = makeWallet(5000n);
      expect(wallet.balance.toCents()).toBe(5000n);
    });

    it("exposes id and userId", () => {
      const wallet = new Wallet("w-42", "u-99");
      expect(wallet.id).toBe("w-42");
      expect(wallet.userId).toBe("u-99");
    });
  });

  describe("credit", () => {
    it("increments the balance", () => {
      const wallet = makeWallet(1000n);
      wallet.credit(Money.ofCents(500n));
      expect(wallet.balance.toCents()).toBe(1500n);
    });

    it("can credit a zero-balance wallet", () => {
      const wallet = makeWallet();
      wallet.credit(Money.ofCents(200n));
      expect(wallet.balance.toCents()).toBe(200n);
    });

    it("accumulates multiple credits", () => {
      const wallet = makeWallet();
      wallet.credit(Money.ofCents(100n));
      wallet.credit(Money.ofCents(200n));
      wallet.credit(Money.ofCents(300n));
      expect(wallet.balance.toCents()).toBe(600n);
    });
  });

  describe("debit", () => {
    it("decrements the balance", () => {
      const wallet = makeWallet(1000n);
      wallet.debit(Money.ofCents(300n));
      expect(wallet.balance.toCents()).toBe(700n);
    });

    it("allows debiting the exact balance (drains to zero)", () => {
      const wallet = makeWallet(500n);
      wallet.debit(Money.ofCents(500n));
      expect(wallet.balance.toCents()).toBe(0n);
    });

    it("throws InsufficientFundsError when amount exceeds balance", () => {
      const wallet = makeWallet(100n);
      expect(() => wallet.debit(Money.ofCents(101n))).toThrow(
        InsufficientFundsError,
      );
    });

    it("throws InsufficientFundsError on a zero-balance wallet", () => {
      const wallet = makeWallet();
      expect(() => wallet.debit(Money.ofCents(1n))).toThrow(
        InsufficientFundsError,
      );
    });

    it("balance never goes negative after a failed debit", () => {
      const wallet = makeWallet(50n);
      expect(() => wallet.debit(Money.ofCents(100n))).toThrow(
        InsufficientFundsError,
      );
      expect(wallet.balance.toCents()).toBe(50n);
    });
  });

  describe("monetary precision", () => {
    it("handles amounts that would lose precision as IEEE-754 floats", () => {
      // 0.1 + 0.2 = 0.30000000000000004 in float — must be exact in our domain
      const wallet = makeWallet();
      wallet.credit(Money.ofCents(10n)); // R$ 0.10
      wallet.credit(Money.ofCents(20n)); // R$ 0.20
      expect(wallet.balance.toCents()).toBe(30n); // exactly R$ 0.30
    });

    it("handles very large balances without overflow", () => {
      const largeCents = 9_007_199_254_740_992n; // beyond Number.MAX_SAFE_INTEGER
      const wallet = makeWallet(largeCents);
      wallet.credit(Money.ofCents(1n));
      expect(wallet.balance.toCents()).toBe(largeCents + 1n);
    });
  });
});
