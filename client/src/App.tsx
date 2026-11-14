import { Navigate, Route, BrowserRouter, Routes } from "react-router-dom";
import { useAuthStore } from "./store/authStore";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import AppShell from "./pages/AppShell";
import UpdateBanner from "./components/UpdateBanner";
import DesktopAppBanner from "./components/DesktopAppBanner";
import DesktopUpdateBanner from "./components/DesktopUpdateBanner";
import ScreenSourcePicker from "./components/ScreenSourcePicker";
import ThemeFlames from "./components/ThemeFlames";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <UpdateBanner />
      <DesktopAppBanner />
      <DesktopUpdateBanner />
      <ScreenSourcePicker />
      <ThemeFlames />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
