import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { useAuth } from "@/auth/useAuth";
import { GameSocketService, type ConnectionState } from "@/services/gameSocket";
import { placeBet as apiBetPlace, cashout as apiCashout } from "@/services/game";
import { buildWsUrl } from "@/services/buildWsUrl";
import type { GameServerEvent } from "@/services/ws-events";

export type GamePhase = "BETTING" | "IN_PROGRESS" | "CRASHED";

export interface RoundSummary {
  id: string;
  crashMultiplier: number;
}

export interface ActiveBet {
  betId: string;
  amountCents: bigint;
  cashedOut: boolean;
}

export type LiveBetStatus = "active" | "cashed_out" | "lost";

export interface LiveBet {
  betId: string;
  playerId: string;
  amountCents: bigint;
  status: LiveBetStatus;
  cashoutMultiplier?: number;
  payoutCents?: bigint;
}

export interface GameState {
  phase: GamePhase;
  multiplier: number;
  roundId: string | null;
  bettingCountdown: number | null;
  history: RoundSummary[];
  liveBets: LiveBet[];
  connectionState: ConnectionState;
  activeBet: ActiveBet | null;
  placeBet: (amountCents: bigint) => void;
  cashout: () => void;
}

// ---------------------------------------------------------------------------
// State shape and reducer
// ---------------------------------------------------------------------------

interface InternalState {
  phase: GamePhase;
  multiplier: number;
  roundId: string | null;
  bettingEndsAt: string | null;
  history: RoundSummary[];
  liveBets: LiveBet[];
  connectionState: ConnectionState;
  activeBet: ActiveBet | null;
}

type Action =
  | { type: "WS_EVENT"; event: GameServerEvent }
  | { type: "CONNECTION_STATE"; state: ConnectionState }
  | { type: "BET_PLACED"; betId: string; amountCents: bigint }
  | { type: "BET_PLACE_FAILED" }
  | { type: "CASHOUT_SENT" }
  | { type: "CASHOUT_FAILED" };

const INITIAL_STATE: InternalState = {
  phase: "BETTING",
  multiplier: 1.0,
  roundId: null,
  bettingEndsAt: null,
  history: [],
  liveBets: [],
  connectionState: "connecting",
  activeBet: null,
};

const MAX_HISTORY = 20;

function reducer(state: InternalState, action: Action): InternalState {
  switch (action.type) {
    case "CONNECTION_STATE":
      return { ...state, connectionState: action.state };

    case "BET_PLACED":
      return {
        ...state,
        activeBet: { betId: action.betId, amountCents: action.amountCents, cashedOut: false },
      };

    case "BET_PLACE_FAILED":
      return { ...state, activeBet: null };

    case "CASHOUT_SENT":
      if (!state.activeBet) return state;
      return { ...state, activeBet: { ...state.activeBet, cashedOut: true } };

    case "CASHOUT_FAILED":
      if (!state.activeBet) return state;
      return { ...state, activeBet: { ...state.activeBet, cashedOut: false } };

    case "WS_EVENT":
      return applyEvent(state, action.event);

    default:
      return state;
  }
}

function applyEvent(state: InternalState, event: GameServerEvent): InternalState {
  switch (event.type) {
    case "round.state": {
      const isNewRound = state.roundId !== event.roundId;
      return {
        ...state,
        phase: event.phase,
        roundId: event.roundId,
        multiplier: event.multiplier,
        bettingEndsAt: event.bettingEndsAt ?? null,
        activeBet: isNewRound ? null : state.activeBet,
        liveBets: isNewRound ? [] : state.liveBets,
      };
    }

    case "round.betting":
      return {
        ...state,
        phase: "BETTING",
        roundId: event.roundId,
        multiplier: 1.0,
        bettingEndsAt: event.bettingEndsAt,
        activeBet: null,
        liveBets: [],
      };

    case "round.started":
      return {
        ...state,
        phase: "IN_PROGRESS",
        bettingEndsAt: null,
        multiplier: 1.0,
      };

    case "round.tick":
      if (event.roundId !== state.roundId) return state;
      return { ...state, multiplier: event.multiplier };

    case "round.crashed": {
      if (event.roundId !== state.roundId) return state;
      const summary: RoundSummary = {
        id: event.roundId,
        crashMultiplier: event.crashMultiplier,
      };
      return {
        ...state,
        phase: "CRASHED",
        multiplier: event.crashMultiplier,
        history: [summary, ...state.history].slice(0, MAX_HISTORY),
        liveBets: state.liveBets.map((b) =>
          b.status === "active" ? { ...b, status: "lost" as LiveBetStatus } : b,
        ),
      };
    }

    case "bet.placed": {
      if (event.roundId !== state.roundId) return state;
      const alreadyExists = state.liveBets.some((b) => b.betId === event.betId);
      if (alreadyExists) return state;
      const newBet: LiveBet = {
        betId: event.betId,
        playerId: event.playerId,
        amountCents: BigInt(event.amountCents),
        status: "active",
      };
      return { ...state, liveBets: [newBet, ...state.liveBets] };
    }

    case "bet.cashedout": {
      if (event.roundId !== state.roundId) return state;
      return {
        ...state,
        liveBets: state.liveBets.map((b) =>
          b.betId === event.betId
            ? {
                ...b,
                status: "cashed_out" as LiveBetStatus,
                cashoutMultiplier: event.multiplier,
                payoutCents: BigInt(event.payoutCents),
              }
            : b,
        ),
      };
    }

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Derive bettingCountdown from bettingEndsAt
// ---------------------------------------------------------------------------

function computeCountdown(bettingEndsAt: string | null): number | null {
  if (!bettingEndsAt) return null;
  const remaining = Math.ceil((new Date(bettingEndsAt).getTime() - Date.now()) / 1000);
  return Math.max(0, remaining);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGame(): GameState {
  const auth = useAuth();
  const accessToken = auth.user?.access_token ?? null;
  const userId = auth.user?.profile?.sub ?? null;

  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const socketRef = useRef<GameSocketService | null>(null);

  useEffect(() => {
    const socket = new GameSocketService(buildWsUrl());
    socketRef.current = socket;

    const unsubEvents = socket.onEvent((event) => {
      dispatch({ type: "WS_EVENT", event });
    });

    const unsubState = socket.onConnectionState((connectionState) => {
      dispatch({ type: "CONNECTION_STATE", state: connectionState });
    });

    socket.connect();

    return () => {
      unsubEvents();
      unsubState();
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const handlePlaceBet = useCallback(
    (amountCents: bigint) => {
      if (!accessToken || !userId || !state.roundId || state.phase !== "BETTING") return;

      const betId = crypto.randomUUID();
      dispatch({ type: "BET_PLACED", betId, amountCents });

      apiBetPlace(
        { roundId: state.roundId, betId, playerId: userId, amountCents },
        accessToken,
      ).catch(() => {
        dispatch({ type: "BET_PLACE_FAILED" });
      });
    },
    [accessToken, userId, state.roundId, state.phase],
  );

  const handleCashout = useCallback(() => {
    if (!accessToken || !userId || !state.roundId || !state.activeBet || state.phase !== "IN_PROGRESS") return;

    dispatch({ type: "CASHOUT_SENT" });

    apiCashout(
      { roundId: state.roundId, betId: state.activeBet.betId, playerId: userId },
      accessToken,
    ).catch(() => {
      dispatch({ type: "CASHOUT_FAILED" });
    });
  }, [accessToken, userId, state.roundId, state.activeBet, state.phase]);

  return useMemo(
    () => ({
      phase: state.phase,
      multiplier: state.multiplier,
      roundId: state.roundId,
      bettingCountdown: computeCountdown(state.bettingEndsAt),
      history: state.history,
      liveBets: state.liveBets,
      connectionState: state.connectionState,
      activeBet: state.activeBet,
      placeBet: handlePlaceBet,
      cashout: handleCashout,
    }),
    [state, handlePlaceBet, handleCashout],
  );
}
