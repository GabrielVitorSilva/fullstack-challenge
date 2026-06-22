import type { Wallet } from "../wallet";

export interface IWalletRepository {
  findByUserId(userId: string): Promise<Wallet | undefined>;
  save(wallet: Wallet): Promise<void>;
}
