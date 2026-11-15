import PasswordInput from "../components/PasswordInput";
import OAuthButtons from "../components/OAuthButtons";
import LanguageSwitch from "../components/LanguageSwitch";
import axios from "axios";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { registerUser } from "../api/auth.api";
import { useAuthStore } from "../store/authStore";
import { useT } from "../i18n";

export default function RegisterPage() {
  const t = useT();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { user, token } = await registerUser(username, email, password);
      setAuth(user, token);
      navigate("/");
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error : undefined;
      setError(message ?? t("Регистрацията не стана.", "Registration failed."));
    }
  }

  return (
    <div className="auth-page">
      <LanguageSwitch />
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>{t("Създай акаунт", "Create an account")}</h1>
        <label htmlFor="username">{t("Потребителско име", "Username")}</label>
        <input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        <label htmlFor="email">{t("Имейл", "Email")}</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label htmlFor="password">{t("Парола", "Password")}</label>
        <PasswordInput id="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
        {error && <div className="error">{error}</div>}
        <button type="submit">{t("Регистрирай се", "Register")}</button>
        <OAuthButtons
          onSignedIn={({ user, token }) => {
            setAuth(user, token);
            navigate("/");
          }}
        />
        <div className="switch-link">
          {t("Вече имаш акаунт?", "Already have an account?")} <Link to="/login">{t("Влез", "Log in")}</Link>
        </div>
      </form>
    </div>
  );
}
