import { useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { useGame } from "@/hooks/useGame";
import { MultiplierDisplay } from "@/components/game/MultiplierDisplay";
import { BetPanel } from "@/components/game/BetPanel";
import { RoundHistory } from "@/components/game/RoundHistory";
import styles from "./GamePage.module.css";

export function GamePage() {
  const { balance, isLoading: isBalanceLoading } = useWallet();
  const game = useGame();

  const [betAmount, setBetAmount] = useState("10.00");
  const [autoCashout, setAutoCashout] = useState("2.00");

  return (
    <div className={styles.page}>
      <div className={styles.gameArea}>
        <MultiplierDisplay
          phase={game.phase}
          multiplier={game.multiplier}
          bettingCountdown={game.bettingCountdown}
        />
        <BetPanel
          phase={game.phase}
          balance={balance}
          isBalanceLoading={isBalanceLoading}
          betAmount={betAmount}
          onBetAmountChange={setBetAmount}
          autoCashout={autoCashout}
          onAutoCashoutChange={setAutoCashout}
          onPlaceBet={() => {}}
          onCashout={() => {}}
        />
      </div>
      <RoundHistory history={game.history} />
    </div>
  );
}
