import { useEffect, useState } from "react";
import { useAuth } from "@/auth/useAuth";
import { getWallet } from "@/services/wallets";
import { bigintCentsToDisplay } from "@/utils/money";

interface WalletState {
  balance: string;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useWallet(): WalletState {
  const auth = useAuth();
  const accessToken = auth.user?.access_token;

  const [balance, setBalance] = useState<string>("0.00");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    getWallet(accessToken)
      .then((wallet) => {
        if (!cancelled) {
          setBalance(bigintCentsToDisplay(BigInt(wallet.balanceCents)));
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load wallet");
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, tick]);

  return {
    balance,
    isLoading,
    error,
    refetch: () => setTick((t) => t + 1),
  };
}
