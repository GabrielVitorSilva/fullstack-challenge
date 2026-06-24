import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { connect, type Channel, type ChannelModel, type ConsumeMessage } from "amqplib";
import {
  CREDIT_WALLET_COMMAND,
  DEBIT_WALLET_COMMAND,
  type CreditWalletCommand,
  type DebitWalletCommand,
  type MessageEnvelope,
} from "@crash/contracts";
import { ProcessDebitCommandUseCase } from "../../application/use-cases/process-debit-command.use-case";
import { ProcessCreditCommandUseCase } from "../../application/use-cases/process-credit-command.use-case";
import { InMemoryInbox } from "./in-memory-inbox";
import {
  RABBITMQ_COMMANDS_EXCHANGE,
  RABBITMQ_WALLETS_COMMANDS_QUEUE,
} from "./rabbitmq-topology";

type RoutableMessage = MessageEnvelope & { readonly type: string };

@Injectable()
export class RabbitMqWalletCommandsConsumer implements OnModuleInit, OnModuleDestroy {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;

  constructor(
    private readonly processDebitCommand: ProcessDebitCommandUseCase,
    private readonly processCreditCommand: ProcessCreditCommandUseCase,
    private readonly inbox: InMemoryInbox,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!process.env.RABBITMQ_URL) return;

    const connection = await connect(process.env.RABBITMQ_URL);
    const channel = await connection.createChannel();
    await channel.assertExchange(RABBITMQ_COMMANDS_EXCHANGE, "topic", { durable: true });
    await channel.assertQueue(RABBITMQ_WALLETS_COMMANDS_QUEUE, { durable: true });
    await channel.bindQueue(
      RABBITMQ_WALLETS_COMMANDS_QUEUE,
      RABBITMQ_COMMANDS_EXCHANGE,
      DEBIT_WALLET_COMMAND,
    );
    await channel.bindQueue(
      RABBITMQ_WALLETS_COMMANDS_QUEUE,
      RABBITMQ_COMMANDS_EXCHANGE,
      CREDIT_WALLET_COMMAND,
    );
    await channel.prefetch(10);
    await channel.consume(RABBITMQ_WALLETS_COMMANDS_QUEUE, (message) => {
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
      const command = JSON.parse(message.content.toString("utf8")) as RoutableMessage;
      const inboxKey = `${command.type}:${command.correlationId}`;
      if (await this.inbox.hasProcessed(inboxKey)) {
        channel.ack(message);
        return;
      }

      if (command.type === DEBIT_WALLET_COMMAND) {
        await this.processDebitCommand.execute(command as DebitWalletCommand);
      } else if (command.type === CREDIT_WALLET_COMMAND) {
        await this.processCreditCommand.execute(command as CreditWalletCommand);
      }

      await this.inbox.markProcessed(inboxKey);
      channel.ack(message);
    } catch (error) {
      console.error("Failed to process wallet command", error);
      channel.nack(message, false, false);
    }
  }
}
