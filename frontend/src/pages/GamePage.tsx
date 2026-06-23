import { useWallet } from "@/hooks/useWallet";
import styles from "./GamePage.module.css";

export function GamePage() {
  const { balance, isLoading, error } = useWallet();

  return (
    <div className={styles.container}>
      <div className={styles.balanceBar}>
        <span className={styles.balanceLabel}>Balance</span>
        {isLoading ? (
          <span className={styles.balanceSkeleton} aria-label="Loading balance" />
        ) : error ? (
          <span className={styles.balanceError}>Unavailable</span>
        ) : (
          <span className={styles.balanceValue}>${balance}</span>
        )}
      </div>

      <div className={styles.gameArea}>
        <div className={styles.crashCanvas}>
          <p className={styles.comingSoon}>Crash game coming soon</p>
          <p className={styles.comingSoonSub}>
            Multiplier display, bet controls and WebSocket feed will go here.
          </p>
        </div>

        <div className={styles.controls}>
          <div className={styles.controlGroup}>
            <label className={styles.controlLabel} htmlFor="bet-amount">
              Bet amount
            </label>
            <input
              id="bet-amount"
              className={styles.controlInput}
              type="number"
              defaultValue={1}
              min={0.01}
              step={0.01}
              disabled
              aria-label="Bet amount"
            />
          </div>

          <button className={styles.betButton} disabled>
            Place bet
          </button>
        </div>
      </div>
    </div>
  );
}
