import type { MessageEnvelope } from "@crash/contracts";

/**
 * Domain port for outbound integration messages.
 * The concrete implementation (RabbitMQ, Kafka, etc.) lives in infrastructure/.
 */
export interface IEventPublisher {
  publish<T extends MessageEnvelope>(message: T): Promise<void>;
}
