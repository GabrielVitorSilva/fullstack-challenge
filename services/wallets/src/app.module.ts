import { Module } from "@nestjs/common";
import { ProcessCreditCommandUseCase } from "./application/use-cases/process-credit-command.use-case";
import { ProcessDebitCommandUseCase } from "./application/use-cases/process-debit-command.use-case";
import type { IWalletRepository } from "./domain/ports/wallet-repository.port";
import { InMemoryWalletRepository } from "./infrastructure/persistence/in-memory-wallet-repository";
import { InMemoryInbox } from "./infrastructure/messaging/in-memory-inbox";
import { RabbitMqEventPublisher } from "./infrastructure/messaging/rabbitmq-event-publisher";
import { RabbitMqWalletCommandsConsumer } from "./infrastructure/messaging/rabbitmq-wallet-commands-consumer";
import { JwtAuthGuard } from "./infrastructure/auth/jwt-auth.guard";
import { JwtVerifierService } from "./infrastructure/auth/jwt-verifier.service";
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
    {
      provide: InMemoryInbox,
      useValue: new InMemoryInbox(),
    },
    RabbitMqEventPublisher,
    {
      provide: ProcessDebitCommandUseCase,
      inject: [InMemoryWalletRepository, RabbitMqEventPublisher],
      useFactory: (repo: IWalletRepository, publisher: RabbitMqEventPublisher) =>
        new ProcessDebitCommandUseCase(repo, publisher),
    },
    {
      provide: ProcessCreditCommandUseCase,
      inject: [InMemoryWalletRepository, RabbitMqEventPublisher],
      useFactory: (repo: IWalletRepository, publisher: RabbitMqEventPublisher) =>
        new ProcessCreditCommandUseCase(repo, publisher),
    },
    JwtVerifierService,
    JwtAuthGuard,
    RabbitMqWalletCommandsConsumer,
  ],
})
export class AppModule {}
