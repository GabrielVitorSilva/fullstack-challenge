export interface PlaceBetRequestDto {
  /** Client-generated UUID for idempotency. */
  betId?: string;
  /** Legacy client field. Runtime endpoints derive the player from the JWT. */
  playerId?: string;
  /** Bet amount in cents, serialized as a string (BigInt-safe over JSON). */
  amountCents: string;
}
