import styles from "./LoadingSpinner.module.css";

interface LoadingSpinnerProps {
  label?: string;
}

export function LoadingSpinner({ label }: LoadingSpinnerProps) {
  return (
    <div className={styles.wrapper} role="status" aria-label={label ?? "Loading"}>
      <div className={styles.spinner} />
      {label && <p className={styles.label}>{label}</p>}
    </div>
  );
}
