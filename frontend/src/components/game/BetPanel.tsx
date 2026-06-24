import styles from "./BetPanel.module.css";
import type { GamePhase } from "@/hooks/useGame";
import { formatMultiplier } from "@/utils/game";

interface Props {
  phase: GamePhase;
  balance: string;
  isBalanceLoading: boolean;
  betAmount: string;
  onBetAmountChange: (value: string) => void;
  autoCashout: string;
  onAutoCashoutChange: (value: string) => void;
  onPlaceBet: () => void;
  onCashout: () => void;
  hasPendingBet: boolean;
  cashoutMultiplier: number;
}

const QUICK_AMOUNTS = [1, 5, 25] as const;

export function BetPanel({
  phase,
  balance,
  isBalanceLoading,
  betAmount,
  onBetAmountChange,
  autoCashout,
  onAutoCashoutChange,
  onPlaceBet,
  onCashout,
  hasPendingBet,
  cashoutMultiplier,
}: Props) {
  const canBet = phase === "BETTING" && !hasPendingBet;
  const canCashout = phase === "IN_PROGRESS" && hasPendingBet;
  const isBetPlaced = phase === "BETTING" && hasPendingBet;

  const potentialWin = canCashout
    ? (parseFloat(betAmount) * cashoutMultiplier).toFixed(2)
    : null;

  function handleQuickAdd(amount: number) {
    const current = parseFloat(betAmount) || 0;
    onBetAmountChange((current + amount).toFixed(2));
  }

  function betButtonLabel(): string {
    if (hasPendingBet) return "Bet Placed";
    if (phase === "IN_PROGRESS") return "Betting Closed";
    if (phase === "CRASHED") return "Round Ended";
    return "Place Bet";
  }

  return (
    <div className={styles.panel}>
      {/* Balance */}
      <div className={styles.balanceSection}>
        <span className={styles.balanceLabel}>Your balance</span>
        {isBalanceLoading ? (
          <span className={styles.balanceSkeleton} aria-label="Loading balance" />
        ) : (
          <span className={styles.balanceValue}>${balance}</span>
        )}
      </div>

      <div className={styles.divider} />

      {/* Bet amount */}
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="bet-amount">
          Bet amount
        </label>
        <div className={styles.inputRow}>
          <div className={styles.inputPrefix}>$</div>
          <input
            id="bet-amount"
            className={styles.input}
            type="number"
            min="0.01"
            step="0.01"
            value={betAmount}
            onChange={(e) => onBetAmountChange(e.target.value)}
            disabled={!canBet}
            aria-label="Bet amount in dollars"
          />
        </div>
        <div className={styles.quickRow}>
          {QUICK_AMOUNTS.map((amount) => (
            <button
              key={amount}
              className={styles.quickBtn}
              onClick={() => handleQuickAdd(amount)}
              disabled={!canBet}
              type="button"
            >
              +${amount}
            </button>
          ))}
        </div>
      </div>

      {/* Auto-cashout */}
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="auto-cashout">
          Auto cash-out at
          <span className={styles.optional}> (optional)</span>
        </label>
        <div className={styles.inputRow}>
          <input
            id="auto-cashout"
            className={styles.input}
            type="number"
            min="1.01"
            step="0.01"
            value={autoCashout}
            onChange={(e) => onAutoCashoutChange(e.target.value)}
            disabled={!canBet}
            aria-label="Auto cashout multiplier"
          />
          <div className={styles.inputSuffix}>×</div>
        </div>
      </div>

      {/* Bet placed confirmation (waiting for round to start) */}
      {isBetPlaced && (
        <div className={styles.betPlacedBanner} role="status">
          <span className={styles.betPlacedIcon} aria-hidden="true">✓</span>
          <span>Bet placed — waiting for round to start</span>
        </div>
      )}

      {/* Potential win (live during round) */}
      {potentialWin !== null && (
        <div className={styles.potentialWin}>
          <span className={styles.potentialWinLabel}>Potential win</span>
          <span className={styles.potentialWinValue}>${potentialWin}</span>
        </div>
      )}

      <div className={styles.actions}>
        <button
          className={styles.betButton}
          onClick={onPlaceBet}
          disabled={!canBet}
          type="button"
        >
          {betButtonLabel()}
        </button>

        <button
          className={`${styles.cashoutButton} ${canCashout ? styles.cashoutButtonActive : ""}`}
          onClick={onCashout}
          disabled={!canCashout}
          type="button"
        >
          Cash Out
          {canCashout && (
            <span className={styles.cashoutMultiplier}> @ {formatMultiplier(cashoutMultiplier)}</span>
          )}
        </button>
      </div>
    </div>
  );
}
