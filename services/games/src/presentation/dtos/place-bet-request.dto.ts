export interface PlaceBetRequestDto {
  /** Client-generated UUID for idempotency. */
  betId: string;
  /** Authenticated user ID. */
  playerId: string;
  /** Bet amount in cents, serialized as a string (BigInt-safe over JSON). */
  amountCents: string;
}
