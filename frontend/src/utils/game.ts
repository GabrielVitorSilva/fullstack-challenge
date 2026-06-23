export type MultiplierTier = "low" | "mid" | "high";

export function formatMultiplier(value: number): string {
  return `${value.toFixed(2)}×`;
}

export function multiplierTier(value: number): MultiplierTier {
  if (value < 2) return "low";
  if (value < 5) return "mid";
  return "high";
}
