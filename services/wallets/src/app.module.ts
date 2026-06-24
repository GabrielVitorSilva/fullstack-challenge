import { Module } from "@nestjs/common";
import { InMemoryWalletRepository } from "./infrastructure/persistence/in-memory-wallet-repository";
import { WalletsController } from "./presentation/controllers/wallets.controller";

@Module({
  controllers: [WalletsController],
  providers: [
    {
      provide: InMemoryWalletRepository,
      useValue: new InMemoryWalletRepository(),
    },
    {
      provide: "IWalletRepository",
      useExisting: InMemoryWalletRepository,
    },
  ],
})
export class AppModule {}
