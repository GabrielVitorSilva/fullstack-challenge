import type { RoundStateEvent, LiveBetSnapshot } from "../../domain/game-events";
import { GAME_WS_EVENT, betStatusToSnapshotStatus } from "../../domain/game-events";
import type { Round } from "../../domain/round";
import { RoundStatus } from "../../domain/round-status";

export function roundStatusToPhase(round: Round): RoundStateEvent["phase"] {
  if (round.status === RoundStatus.BETTING) return "BETTING";
  if (round.status === RoundStatus.IN_PROGRESS) return "IN_PROGRESS";
  return "CRASHED";
}

export function visibleBetSnapshots(
  round: Round,
  getCashoutDetail: (betId: string) => { multiplier: number; payoutCents: string } | undefined,
): LiveBetSnapshot[] {
  return round.bets
    .map((bet) => {
      const snapshotStatus = betStatusToSnapshotStatus(bet.status);
      if (!snapshotStatus) return null;

      const base: LiveBetSnapshot = {
        betId: bet.id,
        playerId: bet.playerId,
        amountCents: bet.amount.toCents().toString(),
        status: snapshotStatus,
      };

      if (snapshotStatus === "cashed_out") {
        const detail = getCashoutDetail(bet.id);
        if (detail) {
          return { ...base, cashoutMultiplier: detail.multiplier, payoutCents: detail.payoutCents };
        }
      }

      return base;
    })
    .filter((bet): bet is LiveBetSnapshot => bet !== null);
}

export function buildRoundStateEvent(
  round: Round,
  multiplier: number,
  bettingEndsAt: string | null,
  getCashoutDetail: (betId: string) => { multiplier: number; payoutCents: string } | undefined,
): RoundStateEvent {
  const bets = visibleBetSnapshots(round, getCashoutDetail);

  return {
    type: GAME_WS_EVENT.ROUND_STATE,
    roundId: round.id,
    phase: roundStatusToPhase(round),
    multiplier,
    ...(bettingEndsAt ? { bettingEndsAt } : {}),
    ...(bets.length > 0 ? { bets } : {}),
  };
}
