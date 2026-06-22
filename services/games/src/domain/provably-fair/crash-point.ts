import { Money } from "../money";

/**
 * Immutable value object representing the crash multiplier of a round.
 *
 * Stored internally as an integer in hundredths of a multiplier to avoid
 * floating-point arithmetic in financial calculations:
 *   100n = 1.00x, 150n = 1.50x, 25000n = 250.00x
 */
export class CrashPoint {
  private constructor(private readonly _hundredths: bigint) {}

  static fromHundredths(v: bigint): CrashPoint {
    if (v < 100n) {
      throw new Error(`Crash point must be >= 1.00x, got ${v}`);
    }
    return new CrashPoint(v);
  }

  toHundredths(): bigint {
    return this._hundredths;
  }

  display(): string {
    const whole = this._hundredths / 100n;
    const frac = this._hundredths % 100n;
    return `${whole}.${String(frac).padStart(2, "0")}`;
  }

  /** Applies multiplier to a bet amount: payout = bet * (hundredths / 100) */
  applyTo(bet: Money): Money {
    return Money.ofCents((bet.toCents() * this._hundredths) / 100n);
  }

  equals(other: CrashPoint): boolean {
    return this._hundredths === other._hundredths;
  }
}
