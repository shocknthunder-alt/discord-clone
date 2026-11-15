import PasswordInput from "../components/PasswordInput";
import OAuthButtons from "../components/OAuthButtons";
import LanguageSwitch from "../components/LanguageSwitch";
import axios from "axios";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { changePassword, forgotEmail, forgotPassword, loginUser } from "../api/auth.api";
import { useAuthStore } from "../store/authStore";
import { tr, useT } from "../i18n";

type Mode = "login" | "changePassword" | "forgotPassword" | "forgotEmail";

function apiError(err: unknown, fallback: string) {
  const message = axios.isAxiosError(err) ? err.response?.data?.error : undefined;
  return typeof message === "string" ? message : fallback;
}

/** English messages of the older endpoints → the interface language. */
function localize(message: string) {
  const map: Record<string, [string, string]> = {
    "Invalid credentials": ["Грешен имейл/потребител или парола.", "Wrong e-mail/username or password."],
    "Current password is incorrect": ["Сегашната парола е грешна.", "The current password is wrong."],
    "User not found": ["Няма такъв потребител.", "No such user."],
    "newPassword must be at least 6 characters": ["Новата парола трябва да е поне 6 знака.", "The new password must be at least 6 characters."],
  };
  const pair = map[message];
  return pair ? tr(pair[0], pair[1]) : message;
}

export default function LoginPage() {
  const t = useT();
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
      setError(localize(apiError(err, fallback)));
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
    }, t("Влизането не стана.", "Couldn't log in."));
  }

  function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) return setError(t("Новата парола трябва да е поне 6 знака.", "The new password must be at least 6 characters."));
    if (newPassword !== confirmPassword) return setError(t("Новите пароли не съвпадат.", "The new passwords don't match."));
    void run(async () => {
      await changePassword(login, currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setInfo(t("Паролата е сменена — вече можеш да влезеш.", "Password changed — you can log in now."));
    }, t("Паролата не се смени.", "The password wasn't changed."));
  }

  function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    void run(async () => {
      const { mail } = await forgotPassword(login);
      setInfo(
        mail
          ? t(
              "Ако има такъв акаунт, пратихме линк за нова парола на имейла му (важи 1 час). Провери и в Спам.",
              "If that account exists, we've e-mailed it a link for a new password (valid for 1 hour). Check Spam too.",
            )
          : t(
              "Изпращането на имейли още не е пуснато. Помоли собственика на сървъра за линк за нова парола (Членове → твоето име → 🔑).",
              "E-mail sending isn't set up yet. Ask the server owner for a new-password link (Members → your name → 🔑).",
            ),
      );
    }, t("Не стана — опитай пак.", "That didn't work — try again."));
  }

  function handleForgotEmail(e: React.FormEvent) {
    e.preventDefault();
    void run(async () => {
      const { maskedEmail } = await forgotEmail(username);
      setInfo(
        t(
          `Акаунтът „${username}“ е с имейл ${maskedEmail}. Можеш да влезеш и директно с потребителското име.`,
          `The account "${username}" uses the e-mail ${maskedEmail}. You can also log in with the username directly.`,
        ),
      );
    }, t("Не стана — опитай пак.", "That didn't work — try again."));
  }

  const backLink = (
    <div className="switch-link">
      <a onClick={() => go("login")}>{t("← Обратно към вход", "← Back to login")}</a>
    </div>
  );

  if (mode === "changePassword") {
    return (
      <div className="auth-page">
        <LanguageSwitch />
        <form className="auth-card" onSubmit={handleChangePassword}>
          <h1>{t("Смяна на паролата", "Change password")}</h1>
          <label htmlFor="cp-login">{t("Имейл или потребителско име", "E-mail or username")}</label>
          <input id="cp-login" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" required />
          <label htmlFor="cp-current">{t("Сегашна парола", "Current password")}</label>
          <PasswordInput id="cp-current" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          <label htmlFor="cp-new">{t("Нова парола", "New password")}</label>
          <PasswordInput id="cp-new" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
          <label htmlFor="cp-confirm">{t("Повтори новата парола", "Repeat the new password")}</label>
          <PasswordInput id="cp-confirm" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
          {error && <div className="error">{error}</div>}
          {info && <div className="success">{info}</div>}
          <button type="submit" disabled={busy}>
            {busy ? t("Запазване…", "Saving…") : t("Смени паролата", "Change password")}
          </button>
          {backLink}
        </form>
      </div>
    );
  }

  if (mode === "forgotPassword") {
    return (
      <div className="auth-page">
        <LanguageSwitch />
        <form className="auth-card" onSubmit={handleForgotPassword}>
          <h1>{t("Забравена парола", "Forgot password")}</h1>
          <label htmlFor="fp-login">{t("Имейл или потребителско име", "E-mail or username")}</label>
          <input id="fp-login" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" required />
          {error && <div className="error">{error}</div>}
          {info && <div className="success">{info}</div>}
          <button type="submit" disabled={busy}>
            {busy ? t("Изпращане…", "Sending…") : t("Прати ми линк за нова парола", "Send me a new-password link")}
          </button>
          {backLink}
        </form>
      </div>
    );
  }

  if (mode === "forgotEmail") {
    return (
      <div className="auth-page">
        <LanguageSwitch />
        <form className="auth-card" onSubmit={handleForgotEmail}>
          <h1>{t("Забравен имейл", "Forgot e-mail")}</h1>
          <label htmlFor="fe-user">{t("Потребителско име", "Username")}</label>
          <input id="fe-user" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
          {error && <div className="error">{error}</div>}
          {info && <div className="success">{info}</div>}
          <button type="submit" disabled={busy}>
            {busy ? t("Търсене…", "Searching…") : t("Покажи имейла ми", "Show my e-mail")}
          </button>
          {backLink}
        </form>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <LanguageSwitch />
      <form className="auth-card" onSubmit={handleLogin}>
        <h1>{t("Добре дошъл обратно!", "Welcome back!")}</h1>
        <label htmlFor="email">{t("Имейл или потребителско име", "E-mail or username")}</label>
        <input id="email" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} required />
        <label htmlFor="password">{t("Парола", "Password")}</label>
        <PasswordInput id="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <label className="checkbox-label">
          <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
          {t("Запомни ме", "Remember me")}
        </label>
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={busy}>
          {busy ? t("Влизане…", "Logging in…") : t("Влез", "Log in")}
        </button>
        <OAuthButtons
          onSignedIn={({ user, token }) => {
            setAuth(user, token, rememberMe);
            navigate("/");
          }}
        />
        <div className="switch-link">
          {t("Нямаш акаунт?", "Need an account?")} <Link to="/register">{t("Регистрирай се", "Register")}</Link>
        </div>
        <div className="switch-link auth-help-links">
          <a onClick={() => go("forgotPassword")}>{t("Забравена парола", "Forgot password")}</a>
          <span>·</span>
          <a onClick={() => go("forgotEmail")}>{t("Забравен имейл", "Forgot e-mail")}</a>
          <span>·</span>
          <a onClick={() => go("changePassword")}>{t("Смяна на паролата", "Change password")}</a>
        </div>
      </form>
    </div>
  );
}
