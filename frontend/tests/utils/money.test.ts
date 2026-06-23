import { describe, it, expect } from "vitest";
import { centsToDisplay, bigintCentsToDisplay } from "@/utils/money";

describe("centsToDisplay", () => {
  it("converts zero", () => {
    expect(centsToDisplay(0)).toBe("0.00");
  });

  it("converts a whole-dollar amount", () => {
    expect(centsToDisplay(100)).toBe("1.00");
  });

  it("pads fractional cents", () => {
    expect(centsToDisplay(105)).toBe("1.05");
  });

  it("handles large amounts", () => {
    expect(centsToDisplay(123456)).toBe("1234.56");
  });

  it("handles negative amounts", () => {
    expect(centsToDisplay(-500)).toBe("-5.00");
  });

  it("truncates floating-point input", () => {
    expect(centsToDisplay(100.9)).toBe("1.00");
  });
});

describe("bigintCentsToDisplay", () => {
  it("converts zero", () => {
    expect(bigintCentsToDisplay(0n)).toBe("0.00");
  });

  it("converts a whole-dollar amount", () => {
    expect(bigintCentsToDisplay(100n)).toBe("1.00");
  });

  it("pads fractional cents", () => {
    expect(bigintCentsToDisplay(105n)).toBe("1.05");
  });

  it("handles large amounts", () => {
    expect(bigintCentsToDisplay(123456n)).toBe("1234.56");
  });

  it("handles negative amounts", () => {
    expect(bigintCentsToDisplay(-500n)).toBe("-5.00");
  });
});
