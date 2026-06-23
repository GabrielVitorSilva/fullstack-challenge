/**
 * Events broadcast over the WebSocket gateway to all connected clients.
 *
 * amountCents / payoutCents are stringified BigInts because JSON.stringify
 * does not handle BigInt natively.
 */

import { BetStatus } from "./bet-status";

export const GAME_WS_EVENT = {
  ROUND_BETTING: "round.betting",
  ROUND_STARTED: "round.started",
  ROUND_TICK: "round.tick",
  ROUND_CRASHED: "round.crashed",
  ROUND_STATE: "round.state",
  BET_PLACED: "bet.placed",
  BET_CASHEDOUT: "bet.cashedout",
} as const;

export type GameWsEventType = (typeof GAME_WS_EVENT)[keyof typeof GAME_WS_EVENT];

export interface RoundBettingEvent {
  type: typeof GAME_WS_EVENT.ROUND_BETTING;
  roundId: string;
  bettingEndsAt: string;
  hashedServerSeed: string;
}

export interface RoundStartedEvent {
  type: typeof GAME_WS_EVENT.ROUND_STARTED;
  roundId: string;
  startedAt: string;
}

export interface RoundTickEvent {
  type: typeof GAME_WS_EVENT.ROUND_TICK;
  roundId: string;
  multiplier: number;
  elapsedMs: number;
}

export interface RoundCrashedEvent {
  type: typeof GAME_WS_EVENT.ROUND_CRASHED;
  roundId: string;
  crashMultiplier: number;
}

/**
 * Snapshot of a single bet included in RoundStateEvent for late-joining
 * clients. Internal-only statuses (DEBIT_FAILED, VOIDED, VOIDED_COMPENSATED)
 * are omitted from the snapshot because they are not meaningful to the UI.
 */
export interface LiveBetSnapshot {
  betId: string;
  playerId: string;
  amountCents: string;
  status: "active" | "cashed_out" | "lost";
}

/**
 * Maps a domain BetStatus to the snapshot status sent to clients.
 * Returns null for internal states that should be excluded from the snapshot.
 */
export function betStatusToSnapshotStatus(status: BetStatus): LiveBetSnapshot["status"] | null {
  if (status === BetStatus.PENDING_DEBIT || status === BetStatus.CONFIRMED) return "active";
  if (status === BetStatus.CASHED_OUT) return "cashed_out";
  if (status === BetStatus.LOST) return "lost";
  return null;
}

/** Sent to a newly connected client so it can sync immediately. */
export interface RoundStateEvent {
  type: typeof GAME_WS_EVENT.ROUND_STATE;
  roundId: string;
  phase: "BETTING" | "IN_PROGRESS" | "CRASHED";
  multiplier: number;
  bettingEndsAt?: string;
  /** Active bets for the current round; absent when the round has no visible bets. */
  bets?: LiveBetSnapshot[];
}

export interface BetPlacedEvent {
  type: typeof GAME_WS_EVENT.BET_PLACED;
  roundId: string;
  betId: string;
  playerId: string;
  amountCents: string;
}

export interface BetCashedOutEvent {
  type: typeof GAME_WS_EVENT.BET_CASHEDOUT;
  roundId: string;
  betId: string;
  playerId: string;
  multiplier: number;
  payoutCents: string;
}

export type GameWsEvent =
  | RoundBettingEvent
  | RoundStartedEvent
  | RoundTickEvent
  | RoundCrashedEvent
  | RoundStateEvent
  | BetPlacedEvent
  | BetCashedOutEvent;
