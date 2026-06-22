import { describe, expect, it } from "bun:test";
import { Money } from "../../src/domain/money";

describe("Money", () => {
  describe("ofCents", () => {
    it("creates a Money instance from cents", () => {
      const money = Money.ofCents(1050n);
      expect(money.toCents()).toBe(1050n);
    });

    it("throws when given a negative amount", () => {
      expect(() => Money.ofCents(-1n)).toThrow("cannot be negative");
    });
  });

  describe("zero", () => {
    it("creates a zero-value Money", () => {
      expect(Money.zero().toCents()).toBe(0n);
    });
  });

  describe("add", () => {
    it("sums two amounts correctly", () => {
      const a = Money.ofCents(500n);
      const b = Money.ofCents(300n);
      expect(a.add(b).toCents()).toBe(800n);
    });

    it("preserves precision with large cent values", () => {
      const a = Money.ofCents(999_999_999_999n);
      const b = Money.ofCents(1n);
      expect(a.add(b).toCents()).toBe(1_000_000_000_000n);
    });
  });

  describe("subtract", () => {
    it("subtracts correctly", () => {
      const a = Money.ofCents(1000n);
      const b = Money.ofCents(400n);
      expect(a.subtract(b).toCents()).toBe(600n);
    });

    it("allows subtracting the full amount (result zero)", () => {
      const a = Money.ofCents(500n);
      expect(a.subtract(a).toCents()).toBe(0n);
    });

    it("throws when result would be negative", () => {
      const a = Money.ofCents(100n);
      const b = Money.ofCents(101n);
      expect(() => a.subtract(b)).toThrow("negative value");
    });
  });

  describe("comparisons", () => {
    it("isGreaterThan returns true when larger", () => {
      expect(Money.ofCents(200n).isGreaterThan(Money.ofCents(100n))).toBe(true);
    });

    it("isGreaterThan returns false when equal", () => {
      expect(Money.ofCents(100n).isGreaterThan(Money.ofCents(100n))).toBe(false);
    });

    it("isLessThan returns true when smaller", () => {
      expect(Money.ofCents(50n).isLessThan(Money.ofCents(100n))).toBe(true);
    });

    it("equals returns true for same value", () => {
      expect(Money.ofCents(300n).equals(Money.ofCents(300n))).toBe(true);
    });

    it("equals returns false for different values", () => {
      expect(Money.ofCents(300n).equals(Money.ofCents(301n))).toBe(false);
    });
  });
});
