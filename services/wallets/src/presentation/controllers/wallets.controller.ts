import { Controller, Get, Headers, Inject } from "@nestjs/common";
import { Money } from "../../domain/money";
import type { IWalletRepository } from "../../domain/ports/wallet-repository.port";
import { Wallet } from "../../domain/wallet";
import { HealthCheckResponseDto } from "../dtos/health-check-response.dto";
import { WalletResponseDto } from "../dtos/wallet-response.dto";

const INITIAL_BALANCE_CENTS = 100_000n;

function decodeBase64UrlJson(value: string): unknown {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(base64));
}

function getUserIdFromAuthorization(authorization?: string): string {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const payload = token?.split(".")[1];
  if (!payload) return "local-player";

  try {
    const decoded = decodeBase64UrlJson(payload);
    if (
      decoded &&
      typeof decoded === "object" &&
      "sub" in decoded &&
      typeof decoded.sub === "string"
    ) {
      return decoded.sub;
    }
  } catch {
    return "local-player";
  }

  return "local-player";
}

@Controller()
export class WalletsController {
  constructor(@Inject("IWalletRepository") private readonly wallets: IWalletRepository) {}

  @Get("health")
  check(): HealthCheckResponseDto {
    return { status: "ok", service: "wallets" };
  }

  @Get("me")
  async me(@Headers("authorization") authorization?: string): Promise<WalletResponseDto> {
    const userId = getUserIdFromAuthorization(authorization);
    let wallet = await this.wallets.findByUserId(userId);

    if (!wallet) {
      wallet = new Wallet(`wallet-${userId}`, userId, Money.ofCents(INITIAL_BALANCE_CENTS));
      await this.wallets.save(wallet);
    }

    return {
      id: wallet.id,
      userId: wallet.userId,
      balanceCents: wallet.balance.toCents().toString(),
    };
  }
}
