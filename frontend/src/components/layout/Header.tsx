import { useAuth } from "@/auth/useAuth";
import styles from "./Header.module.css";

export function Header() {
  const auth = useAuth();
  const user = auth.user?.profile;

  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <span className={styles.brandIcon}>🚀</span>
        <span className={styles.brandName}>Crash Game</span>
      </div>

      <nav className={styles.nav}>
        <div className={styles.userInfo}>
          {user && (
            <span className={styles.userName}>
              {user.preferred_username ?? user.email ?? "Player"}
            </span>
          )}
          <button
            className={styles.logoutButton}
            onClick={() => auth.signoutRedirect()}
          >
            Sign out
          </button>
        </div>
      </nav>
    </header>
  );
}
