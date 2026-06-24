import { describe, expect, it } from "bun:test";

const API_BASE = process.env.E2E_API_BASE_URL ?? "http://localhost:8000";
const KEYCLOAK_BASE = process.env.E2E_KEYCLOAK_BASE_URL ?? "http://localhost:8080";
const CLIENT_ID = process.env.E2E_CLIENT_ID ?? "crash-game-client";
const USERNAME = process.env.E2E_USERNAME ?? "player";
const PASSWORD = process.env.E2E_PASSWORD ?? "player123";

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function getToken(): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "password",
    client_id: CLIENT_ID,
    username: USERNAME,
    password: PASSWORD,
  });

  const response = await fetch(
    `${KEYCLOAK_BASE}/realms/crash-game/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );

  expect(response.ok).toBe(true);
  const payload = (await response.json()) as { access_token: string };
  return payload.access_token;
}

async function api<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });

  expect(response.ok).toBe(true);
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function waitForCurrentRound(
  token: string,
  phase: "BETTING" | "IN_PROGRESS",
  timeoutMs = 20_000,
): Promise<{ roundId: string; phase: string; bets?: Array<{ betId: string; status: string }> }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const round = await api<{ roundId: string; phase: string; bets?: Array<{ betId: string; status: string }> }>(
      "/games/rounds/current",
      token,
    );
    if (round.phase === phase) return round;
    await sleep(500);
  }

  throw new Error(`Timed out waiting for round phase ${phase}`);
}

const runStackE2E = process.env.RUN_STACK_E2E === "true";

describe("Docker stack E2E", () => {
  it("is opt-in to avoid failing when Docker is not running", () => {
    expect(true).toBe(true);
  });

  if (runStackE2E) {
    it("authenticates, loads wallet, places a bet, confirms via RabbitMQ, and cashes out", async () => {
      const token = await getToken();

      const walletBefore = await api<{ balanceCents: string }>("/wallets/me", token);
      const bettingRound = await waitForCurrentRound(token, "BETTING");

      const bet = await api<{ roundId: string; betId: string }>("/games/bet", token, {
        method: "POST",
        body: JSON.stringify({ amountCents: "1000" }),
      });

      expect(bet.roundId).toBe(bettingRound.roundId);

      let confirmed = false;
      for (let i = 0; i < 20; i += 1) {
        const bets = await api<Array<{ betId: string; status: string }>>("/games/bets/me", token);
        confirmed = bets.some((item) => item.betId === bet.betId && item.status === "CONFIRMED");
        if (confirmed) break;
        await sleep(250);
      }
      expect(confirmed).toBe(true);

      const walletAfterDebit = await api<{ balanceCents: string }>("/wallets/me", token);
      expect(BigInt(walletAfterDebit.balanceCents)).toBeLessThan(BigInt(walletBefore.balanceCents));

      await waitForCurrentRound(token, "IN_PROGRESS");

      await api("/games/bet/cashout", token, {
        method: "POST",
        body: JSON.stringify({ betId: bet.betId }),
      });

      const walletAfterCashout = await api<{ balanceCents: string }>("/wallets/me", token);
      expect(BigInt(walletAfterCashout.balanceCents)).toBeGreaterThanOrEqual(
        BigInt(walletAfterDebit.balanceCents),
      );
    }, 40_000);
  }
});
