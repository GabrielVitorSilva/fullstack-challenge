import styles from "./RoundHistory.module.css";
import type { RoundSummary } from "@/hooks/useGame";
import { formatMultiplier, multiplierTier } from "@/utils/game";

interface Props {
  history: RoundSummary[];
}

const TIER_CLASS = {
  low: styles.badgeLow,
  mid: styles.badgeMid,
  high: styles.badgeHigh,
} as const;

export function RoundHistory({ history }: Props) {
  return (
    <section className={styles.section} aria-label="Recent rounds">
      <span className={styles.label}>Recent rounds</span>
      {history.length === 0 ? (
        <p className={styles.empty}>No rounds yet</p>
      ) : (
        <div className={styles.strip} role="list">
          {history.map((round) => {
            const tier = multiplierTier(round.crashMultiplier);
            return (
              <span
                key={round.id}
                role="listitem"
                className={`${styles.badge} ${TIER_CLASS[tier]}`}
                title={`Round ${round.id} crashed at ${formatMultiplier(round.crashMultiplier)}`}
              >
                {formatMultiplier(round.crashMultiplier)}
              </span>
            );
          })}
        </div>
      )}
    </section>
  );
}
