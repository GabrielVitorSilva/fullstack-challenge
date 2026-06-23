import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import styles from "./LoginPage.module.css";

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (auth.isAuthenticated) {
      navigate("/game", { replace: true });
    }
  }, [auth.isAuthenticated, navigate]);

  if (auth.isLoading) {
    return (
      <div className="full-screen-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>🚀</span>
          <h1 className={styles.title}>Crash Game</h1>
          <p className={styles.subtitle}>Place your bet. Cash out before it crashes.</p>
        </div>

        {auth.error && (
          <div className={styles.error} role="alert">
            <strong>Authentication error:</strong> {auth.error.message}
          </div>
        )}

        <button
          className={styles.loginButton}
          onClick={() => auth.signinRedirect()}
          disabled={auth.isLoading}
        >
          Sign in to play
        </button>

        <p className={styles.hint}>
          Demo credentials: <code>player</code> / <code>player123</code>
        </p>
      </div>
    </div>
  );
}
