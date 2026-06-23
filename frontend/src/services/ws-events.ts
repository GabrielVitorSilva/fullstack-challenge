/**
 * WebSocket event types received from the games service.
 *
 * Mirror of the server-side `GameWsEvent` union from `domain/game-events.ts`.
 * Kept in sync by convention — shared via contract documentation, not a
 * shared npm package, to avoid coupling the frontend build to the backend.
 */

export type GameServerEvent =
  | {
      type: "round.betting";
      roundId: string;
      bettingEndsAt: string;
      hashedServerSeed: string;
    }
  | {
      type: "round.started";
      roundId: string;
      startedAt: string;
    }
  | {
      type: "round.tick";
      roundId: string;
      multiplier: number;
      elapsedMs: number;
    }
  | {
      type: "round.crashed";
      roundId: string;
      crashMultiplier: number;
    }
  | {
      type: "round.state";
      roundId: string;
      phase: "BETTING" | "IN_PROGRESS" | "CRASHED";
      multiplier: number;
      bettingEndsAt?: string;
    }
  | {
      type: "bet.placed";
      roundId: string;
      betId: string;
      playerId: string;
      amountCents: string;
    }
  | {
      type: "bet.cashedout";
      roundId: string;
      betId: string;
      playerId: string;
      multiplier: number;
      payoutCents: string;
    };

export function parseGameEvent(raw: string): GameServerEvent | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "type" in parsed &&
      typeof (parsed as Record<string, unknown>).type === "string"
    ) {
      return parsed as GameServerEvent;
    }
    return null;
  } catch {
    return null;
  }
}
