import { Module } from "@nestjs/common";
import { GetRoundVerificationUseCase } from "./application/use-cases/get-round-verification.use-case";
import { IRoundRepository } from "./domain/ports/round-repository.port";
import { InMemoryRoundRepository } from "./infrastructure/persistence/in-memory-round-repository";
import { GamesController } from "./presentation/controllers/games.controller";

@Module({
  controllers: [GamesController],
  providers: [
    // Infrastructure — replace with a database-backed implementation for production
    {
      provide: InMemoryRoundRepository,
      useValue: new InMemoryRoundRepository(),
    },
    {
      provide: GetRoundVerificationUseCase,
      inject: [InMemoryRoundRepository],
      useFactory: (repo: IRoundRepository) => new GetRoundVerificationUseCase(repo),
    },
  ],
})
export class AppModule {}
