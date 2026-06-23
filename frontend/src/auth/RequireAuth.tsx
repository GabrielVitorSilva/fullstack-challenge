import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface RequireAuthProps {
  children: React.ReactNode;
}

export function RequireAuth({ children }: RequireAuthProps) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.isLoading) {
    return (
      <div className="full-screen-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
