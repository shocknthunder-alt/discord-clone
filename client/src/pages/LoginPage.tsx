import PasswordInput from "../components/PasswordInput";
import axios from "axios";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { changePassword, forgotEmail, forgotPassword, loginUser } from "../api/auth.api";
import { useAuthStore } from "../store/authStore";

type Mode = "login" | "changePassword" | "forgotPassword" | "forgotEmail";

function apiError(err: unknown, fallback: string) {
  const message = axios.isAxiosError(err) ? err.response?.data?.error : undefined;
  return typeof message === "string" ? message : fallback;
}

/** English server messages of the older endpoints → Bulgarian. */
function bg(message: string) {
  const map: Record<string, string> = {
    "Invalid credentials": "Грешен имейл/потребител или парола.",
    "Current password is incorrect": "Сегашната парола е грешна.",
    "User not found": "Няма такъв потребител.",
    "newPassword must be at least 6 characters": "Новата парола трябва да е поне 6 знака.",
  };
  return map[message] ?? message;
}

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [username, setUsername] = useState("");

  function go(next: Mode) {
    setMode(next);
    setError(null);
    setInfo(null);
  }

  async function run(action: () => Promise<void>, fallback: string) {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(bg(apiError(err, fallback)));
    } finally {
      setBusy(false);
    }
  }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    void run(async () => {
      const { user, token } = await loginUser(login, password);
      setAuth(user, token, rememberMe);
      navigate("/");
    }, "Влизането не стана.");
  }

  function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) return setError("Новата парола трябва да е поне 6 знака.");
    if (newPassword !== confirmPassword) return setError("Новите пароли не съвпадат.");
    void run(async () => {
      await changePassword(login, currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setInfo("Паролата е сменена — вече можеш да влезеш.");
    }, "Паролата не се смени.");
  }

  function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    void run(async () => {
      const { mail } = await forgotPassword(login);
      setInfo(
        mail
          ? "Ако има такъв акаунт, пратихме линк за нова парола на имейла му (важи 1 час). Провери и в Спам."
          : "Изпращането на имейли още не е пуснато. Помоли собственика на сървъра за линк за нова парола (Членове → твоето име → 🔑).",
      );
    }, "Не стана — опитай пак.");
  }

  function handleForgotEmail(e: React.FormEvent) {
    e.preventDefault();
    void run(async () => {
      const { maskedEmail } = await forgotEmail(username);
      setInfo(`Акаунтът „${username}“ е с имейл ${maskedEmail}. Можеш да влезеш и директно с потребителското име.`);
    }, "Не стана — опитай пак.");
  }

  const backLink = (
    <div className="switch-link">
      <a onClick={() => go("login")}>← Обратно към вход</a>
    </div>
  );

  if (mode === "changePassword") {
    return (
      <div className="auth-page">
        <form className="auth-card" onSubmit={handleChangePassword}>
          <h1>Смяна на паролата</h1>
          <label htmlFor="cp-login">Имейл или потребителско име</label>
          <input id="cp-login" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" required />
          <label htmlFor="cp-current">Сегашна парола</label>
          <PasswordInput id="cp-current" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          <label htmlFor="cp-new">Нова парола</label>
          <PasswordInput id="cp-new" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
          <label htmlFor="cp-confirm">Повтори новата парола</label>
          <PasswordInput id="cp-confirm" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
          {error && <div className="error">{error}</div>}
          {info && <div className="success">{info}</div>}
          <button type="submit" disabled={busy}>
            {busy ? "Запазване…" : "Смени паролата"}
          </button>
          {backLink}
        </form>
      </div>
    );
  }

  if (mode === "forgotPassword") {
    return (
      <div className="auth-page">
        <form className="auth-card" onSubmit={handleForgotPassword}>
          <h1>Забравена парола</h1>
          <label htmlFor="fp-login">Имейл или потребителско име</label>
          <input id="fp-login" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" required />
          {error && <div className="error">{error}</div>}
          {info && <div className="success">{info}</div>}
          <button type="submit" disabled={busy}>
            {busy ? "Изпращане…" : "Прати ми линк за нова парола"}
          </button>
          {backLink}
        </form>
      </div>
    );
  }

  if (mode === "forgotEmail") {
    return (
      <div className="auth-page">
        <form className="auth-card" onSubmit={handleForgotEmail}>
          <h1>Забравен имейл</h1>
          <label htmlFor="fe-user">Потребителско име</label>
          <input id="fe-user" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
          {error && <div className="error">{error}</div>}
          {info && <div className="success">{info}</div>}
          <button type="submit" disabled={busy}>
            {busy ? "Търсене…" : "Покажи имейла ми"}
          </button>
          {backLink}
        </form>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleLogin}>
        <h1>Добре дошъл обратно!</h1>
        <label htmlFor="email">Имейл или потребителско име</label>
        <input id="email" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} required />
        <label htmlFor="password">Парола</label>
        <PasswordInput id="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <label className="checkbox-label">
          <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
          Запомни ме
        </label>
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={busy}>
          {busy ? "Влизане…" : "Влез"}
        </button>
        <div className="switch-link">
          Нямаш акаунт? <Link to="/register">Регистрирай се</Link>
        </div>
        <div className="switch-link auth-help-links">
          <a onClick={() => go("forgotPassword")}>Забравена парола</a>
          <span>·</span>
          <a onClick={() => go("forgotEmail")}>Забравен имейл</a>
          <span>·</span>
          <a onClick={() => go("changePassword")}>Смяна на паролата</a>
        </div>
      </form>
    </div>
  );
}
