import { useEffect } from "react";
import { Navigate, Route, BrowserRouter, Routes, useLocation, useNavigate } from "react-router-dom";
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

/**
 * Login, register and the app share ONE route element, so a logged-in person pressing Back (mouse
 * button) onto /login or /register keeps the app mounted — it just puts the address back to "/".
 * Before, AppShell unmounted there: its socket closed (the others lost us from the voice channel)
 * while the call's audio kept playing, and coming "forward" again left us invisible in the channel.
 */
function Root() {
  const token = useAuthStore((s) => s.token);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const onAuthPage = pathname === "/login" || pathname === "/register";
  useEffect(() => {
    if (token && onAuthPage) navigate("/", { replace: true });
  }, [token, onAuthPage, navigate]);

  if (token) return <AppShell />;
  if (pathname === "/register") return <RegisterPage />;
  if (pathname === "/login") return <LoginPage />;
  return <Navigate to="/login" replace />;
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
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/*" element={<Root />} />
      </Routes>
    </BrowserRouter>
  );
}
