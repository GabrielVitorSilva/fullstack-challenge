import type { MessageEnvelope } from "@crash/contracts";
import type { IEventPublisher } from "../../domain/ports/event-publisher.port";

/**
 * Test-only publisher that collects messages in memory.
 * Replace with a real broker adapter (RabbitMQ, Kafka, etc.) in infrastructure/.
 */
export class InMemoryEventPublisher implements IEventPublisher {
  private readonly _messages: MessageEnvelope[] = [];

  async publish<T extends MessageEnvelope>(message: T): Promise<void> {
    this._messages.push(message);
  }

  get messages(): ReadonlyArray<MessageEnvelope> {
    return [...this._messages];
  }

  clear(): void {
    this._messages.length = 0;
  }
}
