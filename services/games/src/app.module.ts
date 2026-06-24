import { Module } from "@nestjs/common";
import { GetRoundVerificationUseCase } from "./application/use-cases/get-round-verification.use-case";
import { PlaceBetUseCase } from "./application/use-cases/place-bet.use-case";
import { CashoutUseCase } from "./application/use-cases/cashout.use-case";
import { HandleWalletDebitedUseCase } from "./application/use-cases/handle-wallet-debited.use-case";
import { HandleWalletDebitFailedUseCase } from "./application/use-cases/handle-wallet-debit-failed.use-case";
import { RoundLifecycleService } from "./application/services/round-lifecycle.service";
import type { IRoundRepository } from "./domain/ports/round-repository.port";
import { InMemoryRoundRepository } from "./infrastructure/persistence/in-memory-round-repository";
import { InMemoryInbox } from "./infrastructure/messaging/in-memory-inbox";
import { InMemoryOutbox } from "./infrastructure/messaging/in-memory-outbox";
import { RabbitMqCommandPublisher } from "./infrastructure/messaging/rabbitmq-command-publisher";
import { RabbitMqWalletEventsConsumer } from "./infrastructure/messaging/rabbitmq-wallet-events-consumer";
import { JwtAuthGuard } from "./infrastructure/auth/jwt-auth.guard";
import { JwtVerifierService } from "./infrastructure/auth/jwt-verifier.service";
import { GamesController } from "./presentation/controllers/games.controller";
import { BetsController } from "./presentation/controllers/bets.controller";
import { GameGateway } from "./presentation/gateways/game.gateway";

@Module({
  controllers: [GamesController, BetsController],
  providers: [
    {
      provide: InMemoryRoundRepository,
      useValue: new InMemoryRoundRepository(),
    },
    {
      provide: InMemoryInbox,
      useValue: new InMemoryInbox(),
    },
    RabbitMqCommandPublisher,
    {
      provide: InMemoryOutbox,
      useFactory: (repo: IRoundRepository, pub: RabbitMqCommandPublisher) =>
        new InMemoryOutbox(repo, pub),
      inject: [InMemoryRoundRepository, RabbitMqCommandPublisher],
    },
    {
      provide: RoundLifecycleService,
      useFactory: (repo: IRoundRepository) => new RoundLifecycleService(repo),
      inject: [InMemoryRoundRepository],
    },
    {
      provide: GetRoundVerificationUseCase,
      inject: [InMemoryRoundRepository],
      useFactory: (repo: IRoundRepository) => new GetRoundVerificationUseCase(repo),
    },
    {
      provide: PlaceBetUseCase,
      inject: [InMemoryRoundRepository, InMemoryOutbox],
      useFactory: (repo: IRoundRepository, outbox: InMemoryOutbox) =>
        new PlaceBetUseCase(repo, outbox),
    },
    {
      provide: CashoutUseCase,
      inject: [InMemoryRoundRepository, InMemoryOutbox],
      useFactory: (repo: IRoundRepository, outbox: InMemoryOutbox) =>
        new CashoutUseCase(repo, outbox),
    },
    {
      provide: HandleWalletDebitedUseCase,
      inject: [InMemoryRoundRepository, InMemoryOutbox],
      useFactory: (repo: IRoundRepository, outbox: InMemoryOutbox) =>
        new HandleWalletDebitedUseCase(repo, outbox),
    },
    {
      provide: HandleWalletDebitFailedUseCase,
      inject: [InMemoryRoundRepository],
      useFactory: (repo: IRoundRepository) => new HandleWalletDebitFailedUseCase(repo),
    },
    JwtVerifierService,
    JwtAuthGuard,
    RabbitMqWalletEventsConsumer,
    GameGateway,
  ],
})
export class AppModule {}
