import styles from "./MultiplierDisplay.module.css";
import type { GamePhase } from "@/hooks/useGame";
import type { ConnectionState } from "@/services/gameSocket";
import { formatMultiplier } from "@/utils/game";

interface Props {
  phase: GamePhase;
  multiplier: number;
  bettingCountdown: number | null;
  connectionState: ConnectionState;
}

const PHASE_LABEL: Record<GamePhase, string> = {
  BETTING: "Accepting Bets",
  IN_PROGRESS: "In Progress",
  CRASHED: "Crashed",
};

const BADGE_CLASS: Record<GamePhase, string> = {
  BETTING: styles.badgeBetting,
  IN_PROGRESS: styles.badgeInProgress,
  CRASHED: styles.badgeCrashed,
};

const MULT_CLASS: Record<GamePhase, string> = {
  BETTING: styles.multBetting,
  IN_PROGRESS: styles.multInProgress,
  CRASHED: styles.multCrashed,
};

export function MultiplierDisplay({ phase, multiplier, bettingCountdown, connectionState }: Props) {
  return (
    <div className={styles.display}>
      <div className={styles.header}>
        <span className={`${styles.badge} ${BADGE_CLASS[phase]}`}>
          {connectionState === "disconnected" ? "Connecting…" : PHASE_LABEL[phase]}
        </span>
        {phase === "BETTING" && bettingCountdown !== null && connectionState === "connected" && (
          <span className={styles.countdown}>
            Starting in <strong>{bettingCountdown}s</strong>
          </span>
        )}
      </div>

      <div className={styles.graphWrapper}>
        <CrashGraph phase={phase} />
        <div className={styles.multiplierOverlay}>
          <span
            className={`${styles.multiplierValue} ${MULT_CLASS[phase]}`}
            aria-label={`Current multiplier: ${formatMultiplier(multiplier)}`}
          >
            {formatMultiplier(multiplier)}
          </span>
          {phase === "BETTING" && (
            <span className={styles.phaseHint}>Place your bets</span>
          )}
          {phase === "CRASHED" && (
            <span className={styles.phaseHint}>
              Crashed at {formatMultiplier(multiplier)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function CrashGraph({ phase }: { phase: GamePhase }) {
  const curveColor =
    phase === "CRASHED"
      ? "var(--color-error)"
      : phase === "IN_PROGRESS"
        ? "var(--color-success)"
        : "var(--color-accent)";

  const curveOpacity = phase === "BETTING" ? 0.25 : 1;

  // Cubic bezier approximating exponential growth from 1× at x=0 to ~5× at x=540
  // viewBox is 0 0 600 300; graph area spans y=20 (top/5×) to y=280 (bottom/1×)
  const curvePath = "M 0 280 C 150 275 350 200 540 20";
  const fillPath = "M 0 280 C 150 275 350 200 540 20 L 540 280 Z";

  // Grid: y positions for 1× through 5×
  const gridLines = [
    { multiplier: 5, y: 20 },
    { multiplier: 4, y: 85 },
    { multiplier: 3, y: 150 },
    { multiplier: 2, y: 215 },
    { multiplier: 1, y: 280 },
  ];

  return (
    <svg
      viewBox="0 0 600 300"
      preserveAspectRatio="none"
      className={styles.graph}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="crash-graph-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={curveColor} stopOpacity={0.18 * curveOpacity} />
          <stop offset="100%" stopColor={curveColor} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {gridLines.map(({ multiplier, y }) => (
        <g key={multiplier}>
          <line
            x1="0"
            y1={y}
            x2="600"
            y2={y}
            stroke="var(--color-border)"
            strokeWidth="1"
            strokeDasharray="4 6"
          />
          <text
            x="590"
            y={y - 5}
            fill="var(--color-text-muted)"
            fontSize="11"
            textAnchor="end"
            fontFamily="var(--font-mono)"
          >
            {multiplier}×
          </text>
        </g>
      ))}

      {/* Area fill */}
      <path d={fillPath} fill="url(#crash-graph-fill)" />

      {/* Curve */}
      <path
        d={curvePath}
        fill="none"
        stroke={curveColor}
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity={curveOpacity}
      />

      {/* Crash endpoint indicator */}
      {phase !== "BETTING" && (
        <>
          <line
            x1="540"
            y1="20"
            x2="540"
            y2="280"
            stroke={curveColor}
            strokeWidth="1"
            strokeDasharray="4 4"
            opacity="0.4"
          />
          <circle cx="540" cy="20" r="5" fill={curveColor} />
        </>
      )}
    </svg>
  );
}
