import type { IWalletRepository } from "../../domain/ports/wallet-repository.port";
import type { Wallet } from "../../domain/wallet";

export class InMemoryWalletRepository implements IWalletRepository {
  private readonly walletsByUserId = new Map<string, Wallet>();

  async findByUserId(userId: string): Promise<Wallet | undefined> {
    return this.walletsByUserId.get(userId);
  }

  async save(wallet: Wallet): Promise<void> {
    this.walletsByUserId.set(wallet.userId, wallet);
  }
}
