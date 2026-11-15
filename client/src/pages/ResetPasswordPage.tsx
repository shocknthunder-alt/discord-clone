import axios from "axios";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import PasswordInput from "../components/PasswordInput";
import { resetPassword } from "../api/auth.api";
import { useAuthStore } from "../store/authStore";
import { tr } from "../i18n";

/** Behind a reset link (from the e-mail or from the server owner): pick a new password → logged in. */
export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 6) return setError(tr("Паролата трябва да е поне 6 знака.", "The password must be at least 6 characters."));
    if (newPassword !== confirm) return setError(tr("Паролите не съвпадат.", "The passwords don't match."));
    setBusy(true);
    try {
      const { user, token: session } = await resetPassword(token, newPassword);
      setAuth(user, session, true);
      navigate("/");
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error : undefined;
      setError(typeof message === "string" ? message : tr("Не стана — опитай пак.", "That didn't work — try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <h1>{tr("Нова парола", "New password")}</h1>
        {!token ? (
          <div className="error">{tr("Линкът е непълен — отвори го отново от писмото/съобщението.", "The link is incomplete — open it again from the e-mail/message.")}</div>
        ) : (
          <>
            <label htmlFor="rp-new">{tr("Нова парола", "New password")}</label>
            <PasswordInput id="rp-new" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
            <label htmlFor="rp-confirm">{tr("Повтори паролата", "Repeat the password")}</label>
            <PasswordInput id="rp-confirm" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            {error && <div className="error">{error}</div>}
            <button type="submit" disabled={busy}>
              {busy ? tr("Запазване…", "Saving…") : tr("Запази и влез", "Save and sign in")}
            </button>
          </>
        )}
        <div className="switch-link">
          <Link to="/login">← {tr("Към входа", "To login")}</Link>
        </div>
      </form>
    </div>
  );
}
