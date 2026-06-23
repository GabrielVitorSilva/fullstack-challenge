import { Routes, Route, Navigate } from "react-router-dom";
import { RequireAuth } from "@/auth/RequireAuth";
import { LoginPage } from "@/pages/LoginPage";
import { CallbackPage } from "@/pages/CallbackPage";
import { AppLayout } from "@/components/layout/AppLayout";
import { GamePage } from "@/pages/GamePage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<CallbackPage />} />

      <Route
        path="/"
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/game" replace />} />
        <Route path="game" element={<GamePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
