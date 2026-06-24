import { Controller, Get, Headers, Inject, Post, UseGuards } from "@nestjs/common";
import { Money } from "../../domain/money";
import type { IWalletRepository } from "../../domain/ports/wallet-repository.port";
import { Wallet } from "../../domain/wallet";
import { CurrentUser } from "../../infrastructure/auth/current-user.decorator";
import { JwtAuthGuard } from "../../infrastructure/auth/jwt-auth.guard";
import type { AuthenticatedUser } from "../../infrastructure/auth/authenticated-user";
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

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Headers("authorization") authorization?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<WalletResponseDto> {
    return this.findOrCreateWallet(user?.sub ?? getUserIdFromAuthorization(authorization));
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(
    @Headers("authorization") authorization?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<WalletResponseDto> {
    return this.findOrCreateWallet(user?.sub ?? getUserIdFromAuthorization(authorization));
  }

  private async findOrCreateWallet(userId: string): Promise<WalletResponseDto> {
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
