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

function getStatusLabel(status: LiveBet["status"]): string {
  switch (status) {
    case "active":
      return "Active";
    case "cashed_out":
      return "Cashed out";
    case "lost":
      return "Lost";
  }
}

export function LiveBets({ liveBets }: Props) {
  return (
    <section className={styles.section} aria-label="Live bets">
      <div className={styles.sectionHeader}>
        <span className={styles.label}>Live bets</span>
        {liveBets.length > 0 && (
          <span className={styles.count}>{liveBets.length}</span>
        )}
      </div>

      {liveBets.length === 0 ? (
        <p className={styles.empty}>No bets this round yet</p>
      ) : (
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
                  {getStatusLabel(bet.status)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
