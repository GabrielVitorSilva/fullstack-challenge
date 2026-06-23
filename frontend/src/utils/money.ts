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
