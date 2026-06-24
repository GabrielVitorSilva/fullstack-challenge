import { api } from "@/services/api";

export interface WalletResponse {
  id: string;
  userId: string;
  balanceCents: string;
}

export function getWallet(accessToken: string): Promise<WalletResponse> {
  return api.get<WalletResponse>("/wallets/me", accessToken);
}
