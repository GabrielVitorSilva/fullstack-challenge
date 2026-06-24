import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { connect, type Channel, type ChannelModel } from "amqplib";
import type { MessageEnvelope } from "@crash/contracts";
import type { IEventPublisher } from "../../domain/ports/event-publisher.port";
import { RABBITMQ_EVENTS_EXCHANGE } from "./rabbitmq-topology";

type RoutableMessage = MessageEnvelope & { readonly type: string };

@Injectable()
export class RabbitMqEventPublisher implements IEventPublisher, OnModuleDestroy {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;

  async publish<T extends MessageEnvelope>(message: T): Promise<void> {
    const routable = message as unknown as RoutableMessage;
    const channel = await this.getChannel();
    channel.publish(
      RABBITMQ_EVENTS_EXCHANGE,
      routable.type,
      Buffer.from(JSON.stringify(routable)),
      {
        contentType: "application/json",
        deliveryMode: 2,
        messageId: `${routable.type}:${routable.correlationId}`,
        timestamp: Date.now(),
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }

  private async getChannel(): Promise<Channel> {
    if (this.channel) return this.channel;

    const connection = await connect(process.env.RABBITMQ_URL ?? "amqp://localhost:5672");
    const channel = await connection.createChannel();
    await channel.assertExchange(RABBITMQ_EVENTS_EXCHANGE, "topic", { durable: true });

    this.connection = connection;
    this.channel = channel;
    return channel;
  }
}
