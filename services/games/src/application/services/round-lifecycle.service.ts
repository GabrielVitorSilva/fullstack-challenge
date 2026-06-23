import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { generateRoundSeeds, computeCrashPoint } from "../../domain/provably-fair/crash-point-computer";
import { Round } from "../../domain/round";
import type { IRoundRepository } from "../../domain/ports/round-repository.port";
import type {
  BetCashedOutEvent,
  BetPlacedEvent,
  GameWsEvent,
  RoundBettingEvent,
  RoundCrashedEvent,
  RoundStartedEvent,
  RoundTickEvent,
} from "../../domain/game-events";
import { GAME_WS_EVENT } from "../../domain/game-events";

export type BroadcastFn = (event: GameWsEvent) => void;

const BETTING_DURATION_MS = 10_000;
const POST_CRASH_PAUSE_MS = 5_000;
const TICK_INTERVAL_MS = 100;

// Exponential growth constant: multiplier(t) = e^(k * t_seconds)
// k = 0.06 → after 10s: ~1.82x, after 30s: ~6.05x
const GROWTH_K = 0.06;

/**
 * Converts a display multiplier (already rounded to 2 decimal places by
 * computeMultiplier) to its canonical integer representation in hundredths.
 *
 * WHY NOT Math.floor(multiplier * 100):
 *   parseFloat("1.14") in IEEE 754 is ~1.13999999999999990…
 *   1.13999… * 100 = 113.9999… → Math.floor = 113, not 114.
 *   This silently undercharges the player by 1 cent per dollar of bet.
 *
 * String parsing avoids any float multiplication and is exact for all
 * values produced by toFixed(2).
 */
export function multiplierToHundredths(multiplier: number): bigint {
  const str = multiplier.toFixed(2); // always "x.yz" with exactly 2 decimal digits
  const dotIndex = str.indexOf(".");
  const whole = str.slice(0, dotIndex);
  const frac = str.slice(dotIndex + 1).padEnd(2, "0");
  return BigInt(whole) * 100n + BigInt(frac);
}

@Injectable()
export class RoundLifecycleService implements OnModuleInit, OnModuleDestroy {
  private broadcast: BroadcastFn = () => {};
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private phaseTimer: ReturnType<typeof setTimeout> | null = null;
  private currentRound: Round | null = null;
  private roundStartedAt: number | null = null;
  private currentMultiplier = 1.0;
  // Authoritative integer representation used for payout calculations.
  // Updated atomically with currentMultiplier to avoid float-multiplication
  // precision errors at cashout time.
  private currentMultiplierHundredths = 100n;
  private currentBettingEndsAt: string | null = null;
  private stopped = false;
  // Cashout details keyed by betId for the current round only.
  // Populated by broadcastCashout so that handleConnection can include
  // cashoutMultiplier and payoutCents in the round.state snapshot.
  // Cleared at the start of every new betting phase.
  private readonly cashoutByBetId = new Map<string, { multiplier: number; payoutCents: string }>();

  constructor(private readonly rounds: IRoundRepository) {}

  onModuleInit(): void {
    // Defer one tick so NestJS finishes wiring all providers (including
    // GameGateway.afterInit which sets the broadcast callback) before the
    // game loop emits its first event.
    setImmediate(() => void this.beginBettingPhase());
  }

  onModuleDestroy(): void {
    this.stop();
  }

  setBroadcast(fn: BroadcastFn): void {
    this.broadcast = fn;
  }

  getCurrentRound(): Round | null {
    return this.currentRound;
  }

  getCurrentMultiplier(): number {
    return this.currentMultiplier;
  }

  getCurrentMultiplierHundredths(): bigint {
    return this.currentMultiplierHundredths;
  }

  getCurrentBettingEndsAt(): string | null {
    return this.currentBettingEndsAt;
  }

  broadcastBetPlaced(event: Omit<BetPlacedEvent, "type">): void {
    this.broadcast({ type: GAME_WS_EVENT.BET_PLACED, ...event });
  }

  broadcastCashout(event: Omit<BetCashedOutEvent, "type">): void {
    this.cashoutByBetId.set(event.betId, { multiplier: event.multiplier, payoutCents: event.payoutCents });
    this.broadcast({ type: GAME_WS_EVENT.BET_CASHEDOUT, ...event });
  }

  getCashoutDetail(betId: string): { multiplier: number; payoutCents: string } | undefined {
    return this.cashoutByBetId.get(betId);
  }

  stop(): void {
    this.stopped = true;
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.phaseTimer !== null) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
    }
  }

  private setMultiplier(multiplier: number): void {
    this.currentMultiplier = multiplier;
    this.currentMultiplierHundredths = multiplierToHundredths(multiplier);
  }

  private async beginBettingPhase(): Promise<void> {
    if (this.stopped) return;

    const roundId = randomBytes(8).toString("hex");
    const seeds = generateRoundSeeds(roundId);
    const crashPoint = computeCrashPoint(seeds.serverSeed, seeds.nonce);

    const round = new Round(roundId, seeds, crashPoint);
    await this.rounds.save(round);

    this.currentRound = round;
    this.setMultiplier(1.0);
    this.roundStartedAt = null;
    this.cashoutByBetId.clear();

    const bettingEndsAt = new Date(Date.now() + BETTING_DURATION_MS).toISOString();
    this.currentBettingEndsAt = bettingEndsAt;

    const event: RoundBettingEvent = {
      type: GAME_WS_EVENT.ROUND_BETTING,
      roundId,
      bettingEndsAt,
      hashedServerSeed: seeds.hashedServerSeed,
    };
    this.broadcast(event);

    this.phaseTimer = setTimeout(() => {
      void this.beginInProgressPhase(round, crashPoint);
    }, BETTING_DURATION_MS);
  }

  private async beginInProgressPhase(
    round: Round,
    crashPoint: ReturnType<typeof computeCrashPoint>,
  ): Promise<void> {
    if (this.stopped) return;

    round.start();
    await this.rounds.save(round);

    this.roundStartedAt = Date.now();
    this.setMultiplier(1.0);
    this.currentBettingEndsAt = null;

    const startedAt = new Date(this.roundStartedAt).toISOString();
    const startEvent: RoundStartedEvent = {
      type: GAME_WS_EVENT.ROUND_STARTED,
      roundId: round.id,
      startedAt,
    };
    this.broadcast(startEvent);

    const targetMultiplier = Number(crashPoint.toHundredths()) / 100;

    this.tickTimer = setInterval(() => {
      const elapsedMs = Date.now() - (this.roundStartedAt ?? Date.now());
      const newMultiplier = this.computeMultiplier(elapsedMs);
      this.setMultiplier(newMultiplier);

      const tickEvent: RoundTickEvent = {
        type: GAME_WS_EVENT.ROUND_TICK,
        roundId: round.id,
        multiplier: newMultiplier,
        elapsedMs,
      };
      this.broadcast(tickEvent);

      if (newMultiplier >= targetMultiplier) {
        void this.crashRound(round, newMultiplier);
      }
    }, TICK_INTERVAL_MS);
  }

  private async crashRound(round: Round, crashMultiplier: number): Promise<void> {
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }

    round.crash();
    await this.rounds.save(round);

    const crashEvent: RoundCrashedEvent = {
      type: GAME_WS_EVENT.ROUND_CRASHED,
      roundId: round.id,
      crashMultiplier,
    };
    this.broadcast(crashEvent);
    this.setMultiplier(crashMultiplier);

    this.phaseTimer = setTimeout(() => {
      void this.beginBettingPhase();
    }, POST_CRASH_PAUSE_MS);
  }

  computeMultiplier(elapsedMs: number): number {
    const t = elapsedMs / 1000;
    return parseFloat(Math.max(1.0, Math.exp(GROWTH_K * t)).toFixed(2));
  }
}
