import { api } from "./api";

export interface PlaceBetParams {
  roundId: string;
  betId: string;
  playerId: string;
  amountCents: bigint;
}

export interface CashoutParams {
  roundId: string;
  betId: string;
  playerId: string;
}

export function placeBet(params: PlaceBetParams, accessToken: string): Promise<void> {
  return api.post(
    `/games/rounds/${params.roundId}/bets`,
    {
      betId: params.betId,
      playerId: params.playerId,
      amountCents: params.amountCents.toString(),
    },
    accessToken,
  );
}

export function cashout(params: CashoutParams, accessToken: string): Promise<void> {
  return api.post(
    `/games/rounds/${params.roundId}/bets/${params.betId}/cashout`,
    { playerId: params.playerId },
    accessToken,
  );
}
