import { useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { useGame } from "@/hooks/useGame";
import { MultiplierDisplay } from "@/components/game/MultiplierDisplay";
import { BetPanel } from "@/components/game/BetPanel";
import { RoundHistory } from "@/components/game/RoundHistory";
import styles from "./GamePage.module.css";

export function GamePage() {
  const { balance, isLoading: isBalanceLoading, refetch: refetchWallet } = useWallet();
  const game = useGame();

  const [betAmount, setBetAmount] = useState("10.00");
  const [autoCashout, setAutoCashout] = useState("2.00");

  function handlePlaceBet() {
    const dollars = parseFloat(betAmount);
    if (!Number.isFinite(dollars) || dollars <= 0) return;
    // Convert to cents without floating-point arithmetic
    const cents = BigInt(Math.round(dollars * 100));
    game.placeBet(cents);
    refetchWallet();
  }

  function handleCashout() {
    game.cashout();
    refetchWallet();
  }

  return (
    <div className={styles.page}>
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
      <RoundHistory history={game.history} />
    </div>
  );
}
