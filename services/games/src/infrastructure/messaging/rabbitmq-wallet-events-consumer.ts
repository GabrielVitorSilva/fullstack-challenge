import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { connect, type Channel, type ChannelModel, type ConsumeMessage } from "amqplib";
import {
  WALLET_DEBIT_FAILED_EVENT,
  WALLET_DEBITED_EVENT,
  type MessageEnvelope,
  type WalletDebitFailedEvent,
  type WalletDebitedEvent,
} from "@crash/contracts";
import { HandleWalletDebitedUseCase } from "../../application/use-cases/handle-wallet-debited.use-case";
import { HandleWalletDebitFailedUseCase } from "../../application/use-cases/handle-wallet-debit-failed.use-case";
import { InMemoryInbox } from "./in-memory-inbox";
import {
  RABBITMQ_EVENTS_EXCHANGE,
  RABBITMQ_GAMES_WALLET_EVENTS_QUEUE,
} from "./rabbitmq-topology";

type RoutableMessage = MessageEnvelope & { readonly type: string };

@Injectable()
export class RabbitMqWalletEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;

  constructor(
    private readonly handleWalletDebited: HandleWalletDebitedUseCase,
    private readonly handleWalletDebitFailed: HandleWalletDebitFailedUseCase,
    private readonly inbox: InMemoryInbox,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!process.env.RABBITMQ_URL) return;

    const connection = await connect(process.env.RABBITMQ_URL);
    const channel = await connection.createChannel();
    await channel.assertExchange(RABBITMQ_EVENTS_EXCHANGE, "topic", { durable: true });
    await channel.assertQueue(RABBITMQ_GAMES_WALLET_EVENTS_QUEUE, { durable: true });
    await channel.bindQueue(
      RABBITMQ_GAMES_WALLET_EVENTS_QUEUE,
      RABBITMQ_EVENTS_EXCHANGE,
      WALLET_DEBITED_EVENT,
    );
    await channel.bindQueue(
      RABBITMQ_GAMES_WALLET_EVENTS_QUEUE,
      RABBITMQ_EVENTS_EXCHANGE,
      WALLET_DEBIT_FAILED_EVENT,
    );
    await channel.prefetch(10);
    await channel.consume(RABBITMQ_GAMES_WALLET_EVENTS_QUEUE, (message) => {
      void this.handleMessage(channel, message);
    });

    this.connection = connection;
    this.channel = channel;
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }

  private async handleMessage(channel: Channel, message: ConsumeMessage | null): Promise<void> {
    if (!message) return;

    try {
      const event = JSON.parse(message.content.toString("utf8")) as RoutableMessage;
      const inboxKey = `${event.type}:${event.correlationId}`;
      if (await this.inbox.hasProcessed(inboxKey)) {
        channel.ack(message);
        return;
      }

      if (event.type === WALLET_DEBITED_EVENT) {
        await this.handleWalletDebited.execute(event as WalletDebitedEvent);
      } else if (event.type === WALLET_DEBIT_FAILED_EVENT) {
        await this.handleWalletDebitFailed.execute(event as WalletDebitFailedEvent);
      }

      await this.inbox.markProcessed(inboxKey);
      channel.ack(message);
    } catch (error) {
      console.error("Failed to process wallet event", error);
      channel.nack(message, false, false);
    }
  }
}
