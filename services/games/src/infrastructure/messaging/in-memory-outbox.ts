import type { MessageEnvelope } from "@crash/contracts";
import type { IOutbox } from "../../application/ports/outbox.port";
import type { IEventPublisher } from "../../domain/ports/event-publisher.port";
import type { IRoundRepository } from "../../domain/ports/round-repository.port";
import type { Round } from "../../domain/round";

/**
 * In-memory outbox for tests.
 *
 * Saves the round then publishes events inline — trivially "atomic" because
 * both operations are in-process and synchronous under the same call stack.
 *
 * A real implementation would wrap both writes in a DB transaction:
 *   BEGIN
 *     UPDATE rounds SET ... WHERE id = $1
 *     INSERT INTO outbox (payload) VALUES ($2)
 *   COMMIT
 * and a relay process would drain the outbox table to the broker.
 */
export class InMemoryOutbox implements IOutbox {
  constructor(
    private readonly repo: IRoundRepository,
    private readonly publisher: IEventPublisher,
  ) {}

  async saveAndEmit(round: Round, events: ReadonlyArray<MessageEnvelope>): Promise<void> {
    await this.repo.save(round);
    for (const event of events) {
      await this.publisher.publish(event);
    }
  }
}
