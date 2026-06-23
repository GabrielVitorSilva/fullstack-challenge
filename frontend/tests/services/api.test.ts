import { describe, it, expect, vi, beforeEach } from "vitest";
import { api, ApiError } from "@/services/api";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
  // Provide a stable import.meta.env value
  vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8000");
});

describe("api.get", () => {
  it("injects Authorization header when token is provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ id: "1" }),
    });

    await api.get("/wallets/me", "my-token");

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer my-token",
    );
  });

  it("throws ApiError on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => "Unauthorized",
    });

    await expect(api.get("/wallets/me", "bad-token")).rejects.toThrow(ApiError);
  });

  it("returns parsed JSON on success", async () => {
    const data = { balanceCents: 5000 };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify(data),
    });

    const result = await api.get("/wallets/me");
    expect(result).toEqual(data);
  });
});
