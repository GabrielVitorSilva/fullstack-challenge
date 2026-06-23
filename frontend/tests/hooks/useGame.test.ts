import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useGame } from "@/hooks/useGame";

describe("useGame", () => {
  it("returns BETTING phase on mount", () => {
    const { result } = renderHook(() => useGame());
    expect(result.current.phase).toBe("BETTING");
  });

  it("returns multiplier of 1.00 in BETTING phase", () => {
    const { result } = renderHook(() => useGame());
    expect(result.current.multiplier).toBe(1.0);
  });

  it("returns a positive bettingCountdown", () => {
    const { result } = renderHook(() => useGame());
    expect(result.current.bettingCountdown).toBeGreaterThan(0);
  });

  it("returns a non-empty history array with valid shape", () => {
    const { result } = renderHook(() => useGame());
    expect(result.current.history.length).toBeGreaterThan(0);
    const first = result.current.history[0];
    expect(first).toHaveProperty("id");
    expect(first).toHaveProperty("crashMultiplier");
    expect(first.crashMultiplier).toBeGreaterThan(1);
  });

  it("exposes a roundId", () => {
    const { result } = renderHook(() => useGame());
    expect(result.current.roundId).toBeTruthy();
  });
});
