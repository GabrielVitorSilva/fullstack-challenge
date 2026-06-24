import type { IRoundRepository } from "../../domain/ports/round-repository.port";
import type { Round } from "../../domain/round";

/**
 * Volatile in-memory repository — data is lost on process restart.
 * Suitable for local development and integration tests.
 * Replace with a database-backed implementation for production.
 */
export class InMemoryRoundRepository implements IRoundRepository {
  private readonly store = new Map<string, Round>();

  async findById(id: string): Promise<Round | undefined> {
    return this.store.get(id);
  }

  async findAll(): Promise<Round[]> {
    return [...this.store.values()];
  }

  async save(round: Round): Promise<void> {
    this.store.set(round.id, round);
  }
}
