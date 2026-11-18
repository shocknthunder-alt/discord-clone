import { useEffect } from "react";
import { Navigate, Route, BrowserRouter, Routes, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "./store/authStore";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import DesktopLoginPage from "./pages/DesktopLoginPage";
import AppShell from "./pages/AppShell";
import UpdateBanner from "./components/UpdateBanner";
import DesktopAppBanner from "./components/DesktopAppBanner";
import DesktopUpdateBanner from "./components/DesktopUpdateBanner";
import ScreenSourcePicker from "./components/ScreenSourcePicker";
import ThemeFlames from "./components/ThemeFlames";
import { useLang } from "./i18n";
import { captureInviteFromUrl } from "./utils/invite";

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
  // /invite/<code>: remember it, then log in / register (or straight into the app) — AppShell joins.
  const inviting = captureInviteFromUrl(pathname);
  useEffect(() => {
    if (token && (onAuthPage || inviting)) navigate("/", { replace: true });
  }, [token, onAuthPage, inviting, navigate]);
  if (inviting && !token) return <Navigate to="/register" replace />;

  if (token) return <AppShell />;
  if (pathname === "/register") return <RegisterPage />;
  if (pathname === "/login") return <LoginPage />;
  return <Navigate to="/login" replace />;
}

export default function App() {
  // Subscribing here re-renders the whole tree when the interface language changes, so texts
  // written with tr() follow too. (No `key`: remounting would drop the voice call.)
  useLang();
  return (
    <BrowserRouter>
      <UpdateBanner />
      <DesktopAppBanner />
      <DesktopUpdateBanner />
      <ScreenSourcePicker />
      <ThemeFlames />
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/desktop-login" element={<DesktopLoginPage />} />
        <Route path="/*" element={<Root />} />
      </Routes>
    </BrowserRouter>
  );
}
