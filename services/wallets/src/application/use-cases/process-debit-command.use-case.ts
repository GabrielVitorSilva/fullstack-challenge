import {
  buildWalletDebitFailedEvent,
  buildWalletDebitedEvent,
  type DebitWalletCommand,
} from "@crash/contracts";
import { InsufficientFundsError } from "../../domain/errors/insufficient-funds.error";
import { Money } from "../../domain/money";
import { IEventPublisher } from "../../domain/ports/event-publisher.port";
import { IWalletRepository } from "../../domain/ports/wallet-repository.port";

/**
 * Handles an incoming DebitWalletCommand from the Game service.
 * On success → publishes WalletDebitedEvent.
 * On failure → publishes WalletDebitFailedEvent (never throws to the broker).
 */
export class ProcessDebitCommandUseCase {
  constructor(
    private readonly wallets: IWalletRepository,
    private readonly publisher: IEventPublisher,
  ) {}

  async execute(command: DebitWalletCommand): Promise<void> {
    const wallet = await this.wallets.findByUserId(command.playerId);

    if (!wallet) {
      await this.publisher.publish(
        buildWalletDebitFailedEvent(
          command.betId,
          command.roundId,
          command.playerId,
          "WALLET_NOT_FOUND",
        ),
      );
      return;
    }

    const amount = Money.ofCents(BigInt(command.amountCents));

    try {
      wallet.debit(amount);
    } catch (err) {
      if (err instanceof InsufficientFundsError) {
        await this.publisher.publish(
          buildWalletDebitFailedEvent(
            command.betId,
            command.roundId,
            command.playerId,
            "INSUFFICIENT_FUNDS",
          ),
        );
        return;
      }
      throw err;
    }

    await this.wallets.save(wallet);

    await this.publisher.publish(
      buildWalletDebitedEvent(
        command.betId,
        command.roundId,
        command.playerId,
        amount.toCents(),
      ),
    );
  }
}
