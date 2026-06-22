export class Money {
  private constructor(private readonly cents: bigint) {}

  static ofCents(cents: bigint): Money {
    if (cents < 0n) {
      throw new Error("Money amount cannot be negative");
    }
    return new Money(cents);
  }

  static zero(): Money {
    return new Money(0n);
  }

  add(other: Money): Money {
    return new Money(this.cents + other.cents);
  }

  subtract(other: Money): Money {
    const result = this.cents - other.cents;
    if (result < 0n) {
      throw new Error("Money subtraction cannot produce a negative value");
    }
    return new Money(result);
  }

  isGreaterThan(other: Money): boolean {
    return this.cents > other.cents;
  }

  isLessThan(other: Money): boolean {
    return this.cents < other.cents;
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }

  toCents(): bigint {
    return this.cents;
  }
}
