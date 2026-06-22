import type { MessageEnvelope } from "@crash/contracts";
import type { IEventPublisher } from "../../domain/ports/event-publisher.port";

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
