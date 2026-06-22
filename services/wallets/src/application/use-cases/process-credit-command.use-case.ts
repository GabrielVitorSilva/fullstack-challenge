import {
  buildWalletCreditedEvent,
  type CreditWalletCommand,
} from "@crash/contracts";
import { Money } from "../../domain/money";
import { IEventPublisher } from "../../domain/ports/event-publisher.port";
import { IWalletRepository } from "../../domain/ports/wallet-repository.port";

/**
 * Handles an incoming CreditWalletCommand from the Game service (cashout).
 * The wallet is always credited — Game guarantees the bet was valid before
 * emitting this command. Publishes WalletCreditedEvent on success.
 */
export class ProcessCreditCommandUseCase {
  constructor(
    private readonly wallets: IWalletRepository,
    private readonly publisher: IEventPublisher,
  ) {}

  async execute(command: CreditWalletCommand): Promise<void> {
    const wallet = await this.wallets.findByUserId(command.playerId);
    if (!wallet) throw new Error(`Wallet not found for player ${command.playerId}`);

    const amount = Money.ofCents(BigInt(command.amountCents));
    wallet.credit(amount);

    await this.wallets.save(wallet);

    await this.publisher.publish(
      buildWalletCreditedEvent(
        command.betId,
        command.roundId,
        command.playerId,
        amount.toCents(),
      ),
    );
  }
}
