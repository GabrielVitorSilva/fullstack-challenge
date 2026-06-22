import type { MessageEnvelope } from "@crash/contracts";

export interface IEventPublisher {
  publish<T extends MessageEnvelope>(message: T): Promise<void>;
}
