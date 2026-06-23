import styles from "./BetPanel.module.css";
import type { GamePhase } from "@/hooks/useGame";

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
}: Props) {
  const canBet = phase === "BETTING";
  const canCashout = phase === "IN_PROGRESS";

  function handleQuickAdd(amount: number) {
    const current = parseFloat(betAmount) || 0;
    onBetAmountChange((current + amount).toFixed(2));
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

      <div className={styles.actions}>
        <button
          className={styles.betButton}
          onClick={onPlaceBet}
          disabled={!canBet}
          type="button"
        >
          {canBet ? "Place Bet" : phase === "IN_PROGRESS" ? "Betting Closed" : "Round Ended"}
        </button>

        <button
          className={styles.cashoutButton}
          onClick={onCashout}
          disabled={!canCashout}
          type="button"
        >
          Cash Out
          {canCashout && <span className={styles.cashoutMultiplier}> @ 1.00×</span>}
        </button>
      </div>
    </div>
  );
}
