export interface CashoutRequestDto {
  /** Legacy client field. Runtime endpoints derive the player from the JWT. */
  playerId?: string;
  /** Optional for /games/bet/cashout; legacy round route already carries it in the path. */
  betId?: string;
}
