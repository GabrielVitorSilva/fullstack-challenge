import { describe, it, expect, vi, beforeEach } from "vitest";
import { getWallet } from "@/services/wallets";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8000");
});

describe("getWallet", () => {
  it("calls GET /wallets/me with Bearer token", async () => {
    const payload = { id: "w1", userId: "u1", balanceCents: 5000 };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify(payload),
    });

    await getWallet("tok-abc");

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/wallets/me");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer tok-abc",
    );
  });

  it("returns typed WalletResponse on success", async () => {
    const payload = { id: "w1", userId: "u1", balanceCents: 12345 };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify(payload),
    });

    const result = await getWallet("tok-abc");

    expect(result.id).toBe("w1");
    expect(result.userId).toBe("u1");
    expect(result.balanceCents).toBe(12345);
  });
});
