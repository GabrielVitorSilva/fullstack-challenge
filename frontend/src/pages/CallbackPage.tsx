import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export function CallbackPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;

    if (auth.isAuthenticated) {
      handled.current = true;
      navigate("/game", { replace: true });
    }
  }, [auth.isAuthenticated, navigate]);

  if (auth.error) {
    return (
      <div className="full-screen-center">
        <div style={{ textAlign: "center", color: "var(--color-error)" }}>
          <p>Authentication failed: {auth.error.message}</p>
          <button onClick={() => navigate("/login", { replace: true })}>
            Back to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="full-screen-center">
      <LoadingSpinner label="Signing you in…" />
    </div>
  );
}
