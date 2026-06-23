import { Module } from "@nestjs/common";
import { GetRoundVerificationUseCase } from "./application/use-cases/get-round-verification.use-case";
import { PlaceBetUseCase } from "./application/use-cases/place-bet.use-case";
import { CashoutUseCase } from "./application/use-cases/cashout.use-case";
import { RoundLifecycleService } from "./application/services/round-lifecycle.service";
import type { IRoundRepository } from "./domain/ports/round-repository.port";
import { InMemoryRoundRepository } from "./infrastructure/persistence/in-memory-round-repository";
import { InMemoryEventPublisher } from "./infrastructure/messaging/in-memory-event-publisher";
import { InMemoryOutbox } from "./infrastructure/messaging/in-memory-outbox";
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
      provide: InMemoryEventPublisher,
      useValue: new InMemoryEventPublisher(),
    },
    {
      provide: InMemoryOutbox,
      useFactory: (repo: IRoundRepository, pub: InMemoryEventPublisher) =>
        new InMemoryOutbox(repo, pub),
      inject: [InMemoryRoundRepository, InMemoryEventPublisher],
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
    GameGateway,
  ],
})
export class AppModule {}
