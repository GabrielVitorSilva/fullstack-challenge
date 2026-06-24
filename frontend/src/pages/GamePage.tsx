import { useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { useGame } from "@/hooks/useGame";
import { MultiplierDisplay } from "@/components/game/MultiplierDisplay";
import { BetPanel } from "@/components/game/BetPanel";
import { RoundHistory } from "@/components/game/RoundHistory";
import { LiveBets } from "@/components/game/LiveBets";
import { decimalDollarsToCents } from "@/utils/money";
import styles from "./GamePage.module.css";

export function GamePage() {
  const { balance, isLoading: isBalanceLoading, refetch: refetchWallet } = useWallet();
  const game = useGame();

  const [betAmount, setBetAmount] = useState("10.00");
  const [autoCashout, setAutoCashout] = useState("2.00");

  function handlePlaceBet() {
    const cents = decimalDollarsToCents(betAmount);
    if (cents === null || cents <= 0n) return;
    game.placeBet(cents);
    refetchWallet();
  }

  function handleCashout() {
    game.cashout();
    refetchWallet();
  }

  const isDisconnected = game.connectionState !== "connected";

  return (
    <div className={styles.page}>
      {isDisconnected && (
        <div className={styles.connectionBanner} role="status" aria-live="polite">
          <span className={styles.connectionBannerDot} aria-hidden="true" />
          {game.connectionState === "connecting"
            ? "Connecting to game server…"
            : "Connection lost. Reconnecting…"}
        </div>
      )}

      <div className={styles.gameArea}>
        <MultiplierDisplay
          phase={game.phase}
          multiplier={game.multiplier}
          bettingCountdown={game.bettingCountdown}
          connectionState={game.connectionState}
        />
        <BetPanel
          phase={game.phase}
          balance={balance}
          isBalanceLoading={isBalanceLoading}
          betAmount={betAmount}
          onBetAmountChange={setBetAmount}
          autoCashout={autoCashout}
          onAutoCashoutChange={setAutoCashout}
          onPlaceBet={handlePlaceBet}
          onCashout={handleCashout}
          hasPendingBet={game.activeBet !== null && !game.activeBet.cashedOut}
          cashoutMultiplier={game.multiplier}
        />
      </div>

      <div className={styles.bottomGrid}>
        <LiveBets liveBets={game.liveBets} />
        <RoundHistory history={game.history} />
      </div>
    </div>
  );
}
