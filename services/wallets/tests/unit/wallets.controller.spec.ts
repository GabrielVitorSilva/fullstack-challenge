import { describe, expect, it } from "bun:test";
import { InMemoryWalletRepository } from "../../src/infrastructure/persistence/in-memory-wallet-repository";
import { WalletsController } from "../../src/presentation/controllers/wallets.controller";

function buildUnsignedToken(payload: Record<string, unknown>): string {
  const encodedPayload = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${encodedPayload}.signature`;
}

describe("WalletsController", () => {
  it("creates and returns a default wallet for the authenticated user", async () => {
    const controller = new WalletsController(new InMemoryWalletRepository());
    const token = buildUnsignedToken({ sub: "player-123" });

    const wallet = await controller.me(`Bearer ${token}`);

    expect(wallet.userId).toBe("player-123");
    expect(wallet.id).toBe("wallet-player-123");
    expect(wallet.balanceCents).toBe("100000");
  });

  it("reuses the same in-memory wallet on repeated calls", async () => {
    const repo = new InMemoryWalletRepository();
    const controller = new WalletsController(repo);
    const token = buildUnsignedToken({ sub: "player-123" });

    const first = await controller.me(`Bearer ${token}`);
    const second = await controller.me(`Bearer ${token}`);

    expect(second).toEqual(first);
  });

  it("falls back to local-player when authorization is missing", async () => {
    const controller = new WalletsController(new InMemoryWalletRepository());

    const wallet = await controller.me();

    expect(wallet.userId).toBe("local-player");
  });
});
