export type GamePhase = "BETTING" | "IN_PROGRESS" | "CRASHED";

export interface RoundSummary {
  id: string;
  crashMultiplier: number;
}

export interface GameState {
  phase: GamePhase;
  multiplier: number;
  roundId: string | null;
  bettingCountdown: number | null;
  history: RoundSummary[];
}

const MOCK_HISTORY: RoundSummary[] = [
  { id: "r-010", crashMultiplier: 2.41 },
  { id: "r-009", crashMultiplier: 1.03 },
  { id: "r-008", crashMultiplier: 5.12 },
  { id: "r-007", crashMultiplier: 1.77 },
  { id: "r-006", crashMultiplier: 12.34 },
  { id: "r-005", crashMultiplier: 1.22 },
  { id: "r-004", crashMultiplier: 3.09 },
  { id: "r-003", crashMultiplier: 1.05 },
  { id: "r-002", crashMultiplier: 8.01 },
  { id: "r-001", crashMultiplier: 2.00 },
];

/**
 * Returns the current game state. Static mock today; will be replaced
 * by a WebSocket-driven implementation in the next branch without changing
 * the return shape.
 */
export function useGame(): GameState {
  return {
    phase: "BETTING",
    multiplier: 1.0,
    roundId: "round-preview",
    bettingCountdown: 8,
    history: MOCK_HISTORY,
  };
}
