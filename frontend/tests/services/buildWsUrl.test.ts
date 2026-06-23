import { describe, it, expect, vi, afterEach } from "vitest";

// buildWsUrl reads import.meta.env at call time, so we stub before importing
// by using vi.stubEnv (Vitest automatically resets between tests with afterEach).

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildWsUrl", () => {
  it("converts http API base to ws:// targeting Kong's /games/ws path", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8000");
    const { buildWsUrl } = await import("@/services/buildWsUrl");
    expect(buildWsUrl()).toBe("ws://localhost:8000/games/ws");
  });

  it("converts https API base to wss://", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");
    const { buildWsUrl } = await import("@/services/buildWsUrl");
    expect(buildWsUrl()).toBe("wss://api.example.com/games/ws");
  });

  it("preserves non-default port from the API base", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://gateway.local:9000");
    const { buildWsUrl } = await import("@/services/buildWsUrl");
    expect(buildWsUrl()).toBe("ws://gateway.local:9000/games/ws");
  });

  it("always appends /games/ws regardless of the base path", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8000");
    const { buildWsUrl } = await import("@/services/buildWsUrl");
    const url = buildWsUrl();
    expect(url.endsWith("/games/ws")).toBe(true);
  });

  it("never points to the nginx host or the /api/games path", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8000");
    const { buildWsUrl } = await import("@/services/buildWsUrl");
    const url = buildWsUrl();
    expect(url).not.toContain("/api/games");
    expect(url).not.toContain(":3000");
    expect(url).not.toContain(":5173");
  });
});
