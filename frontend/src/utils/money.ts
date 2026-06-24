/**
 * Converts an integer cent amount (as returned by the Wallets API) to a
 * human-readable decimal string suitable for display.
 *
 * Deliberately avoids floating-point arithmetic: uses integer division and
 * modulo so that 1234 → "12.34" with no rounding surprises.
 */
export function centsToDisplay(cents: number): string {
  const intCents = Math.trunc(cents);
  const whole = Math.floor(Math.abs(intCents) / 100);
  const fraction = Math.abs(intCents) % 100;
  const sign = intCents < 0 ? "-" : "";
  return `${sign}${whole}.${String(fraction).padStart(2, "0")}`;
}

/** Same as centsToDisplay but accepts bigint (from WebSocket events). */
export function bigintCentsToDisplay(cents: bigint): string {
  const abs = cents < 0n ? -cents : cents;
  const whole = abs / 100n;
  const fraction = abs % 100n;
  const sign = cents < 0n ? "-" : "";
  return `${sign}${whole}.${String(fraction).padStart(2, "0")}`;
}

/**
 * Parses a user-entered dollar amount into integer cents without using
 * floating-point arithmetic.
 */
export function decimalDollarsToCents(value: string): bigint | null {
  const normalized = value.trim().replace(",", ".");
  const match = normalized.match(/^(\d+)(?:\.(\d{0,2}))?$/);
  if (!match) return null;

  const dollars = BigInt(match[1]);
  const cents = BigInt((match[2] ?? "").padEnd(2, "0"));
  return dollars * 100n + cents;
}
