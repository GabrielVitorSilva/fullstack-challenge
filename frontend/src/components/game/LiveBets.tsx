import styles from "./LiveBets.module.css";
import type { LiveBet } from "@/hooks/useGame";
import { bigintCentsToDisplay } from "@/utils/money";
import { formatMultiplier } from "@/utils/game";

interface Props {
  liveBets: LiveBet[];
}

function truncatePlayerId(playerId: string): string {
  return playerId.length > 12 ? `${playerId.slice(0, 6)}…${playerId.slice(-4)}` : playerId;
}

export function LiveBets({ liveBets }: Props) {
  if (liveBets.length === 0) return null;

  return (
    <section className={styles.section} aria-label="Live bets">
      <span className={styles.label}>Live bets</span>
      <ul className={styles.list} role="list">
        {liveBets.map((bet) => (
          <li key={bet.betId} className={`${styles.row} ${styles[bet.status]}`} role="listitem">
            <span className={styles.player} title={bet.playerId}>
              {truncatePlayerId(bet.playerId)}
            </span>
            <span className={styles.amount}>${bigintCentsToDisplay(bet.amountCents)}</span>
            {bet.status === "cashed_out" && bet.cashoutMultiplier !== undefined && bet.payoutCents !== undefined ? (
              <span className={styles.payout}>
                {formatMultiplier(bet.cashoutMultiplier)} · ${bigintCentsToDisplay(bet.payoutCents)}
              </span>
            ) : (
              <span className={`${styles.badge} ${styles[`badge_${bet.status}`]}`}>
                {bet.status === "active" ? "Active" : "Lost"}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
