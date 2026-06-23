import { describe, it, expect } from "vitest";
import { centsToDisplay } from "@/utils/money";

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
