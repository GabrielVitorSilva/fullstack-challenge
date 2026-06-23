import { describe, it, expect } from "vitest";
import { formatMultiplier, multiplierTier } from "@/utils/game";

describe("formatMultiplier", () => {
  it("formats 1.00 with × suffix", () => {
    expect(formatMultiplier(1.0)).toBe("1.00×");
  });

  it("formats two decimal places", () => {
    expect(formatMultiplier(12.34)).toBe("12.34×");
    expect(formatMultiplier(1.5)).toBe("1.50×");
  });

  it("pads a single decimal place to two", () => {
    // toFixed always produces exactly two digits
    expect(formatMultiplier(2.1)).toBe("2.10×");
  });
});

describe("multiplierTier", () => {
  it("returns low for values below 2×", () => {
    expect(multiplierTier(1.0)).toBe("low");
    expect(multiplierTier(1.99)).toBe("low");
  });

  it("returns mid for values between 2× and 5×", () => {
    expect(multiplierTier(2.0)).toBe("mid");
    expect(multiplierTier(4.99)).toBe("mid");
  });

  it("returns high for values at or above 5×", () => {
    expect(multiplierTier(5.0)).toBe("high");
    expect(multiplierTier(100.0)).toBe("high");
  });
});
