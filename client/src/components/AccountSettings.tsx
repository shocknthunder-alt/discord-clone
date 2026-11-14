import axios from "axios";
import { useState, type ReactNode } from "react";
import { changeMyEmail, changeMyPassword } from "../api/auth.api";
import { useAuthStore } from "../store/authStore";
import PasswordInput from "./PasswordInput";

function apiError(err: unknown, fallback: string) {
  const message = axios.isAxiosError(err) ? err.response?.data?.error : undefined;
  return typeof message === "string" ? message : fallback;
}

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="set-card">
      <h3 className="set-card-title">{title}</h3>
      {hint && <p className="set-card-hint">{hint}</p>}
      <div className="set-card-body">{children}</div>
    </section>
  );
}

/** Settings → Акаунт: change password and e-mail (each saved on its own button, not with "Запази"). */
export default function AccountSettings() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  const [email, setEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 6) return setPwMsg({ ok: false, text: "Новата парола трябва да е поне 6 знака." });
    if (next !== confirm) return setPwMsg({ ok: false, text: "Новите пароли не съвпадат." });
    setPwBusy(true);
    setPwMsg(null);
    try {
      await changeMyPassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setPwMsg({ ok: true, text: "✓ Паролата е сменена." });
    } catch (err) {
      setPwMsg({ ok: false, text: apiError(err, "Паролата не се смени.") });
    } finally {
      setPwBusy(false);
    }
  }

  async function saveEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailBusy(true);
    setEmailMsg(null);
    try {
      const updated = await changeMyEmail(email, emailPassword);
      setUser(updated); // same session, only the stored user changes
      setEmail("");
      setEmailPassword("");
      setEmailMsg({ ok: true, text: `✓ Имейлът вече е ${updated.email}.` });
    } catch (err) {
      setEmailMsg({ ok: false, text: apiError(err, "Имейлът не се смени.") });
    } finally {
      setEmailBusy(false);
    }
  }

  return (
    <>
      <Card title="Влизане" hint="Можеш да влизаш и с имейла, и с потребителското си име.">
        <div className="set-account-row">
          <span className="set-field-label">Имейл</span>
          <span>{user?.email}</span>
        </div>
      </Card>

      <Card title="Смяна на паролата">
        <form className="set-account-form" onSubmit={savePassword}>
          <label className="set-field-label" htmlFor="acc-current">
            Сегашна парола
          </label>
          <PasswordInput id="acc-current" className="set-input" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          <label className="set-field-label" htmlFor="acc-new">
            Нова парола
          </label>
          <PasswordInput id="acc-new" className="set-input" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
          <label className="set-field-label" htmlFor="acc-confirm">
            Повтори новата парола
          </label>
          <PasswordInput id="acc-confirm" className="set-input" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          {pwMsg && <div className={pwMsg.ok ? "set-ok" : "set-error"}>{pwMsg.text}</div>}
          <div className="set-row">
            <button type="submit" className="set-button" disabled={pwBusy}>
              {pwBusy ? "Запазване…" : "Смени паролата"}
            </button>
          </div>
        </form>
      </Card>

      <Card title="Смяна на имейла" hint="На него идват линковете за забравена парола.">
        <form className="set-account-form" onSubmit={saveEmail}>
          <label className="set-field-label" htmlFor="acc-email">
            Нов имейл
          </label>
          <input id="acc-email" type="email" className="set-input" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label className="set-field-label" htmlFor="acc-email-pass">
            Парола (за потвърждение)
          </label>
          <PasswordInput id="acc-email-pass" className="set-input" autoComplete="current-password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} required />
          {emailMsg && <div className={emailMsg.ok ? "set-ok" : "set-error"}>{emailMsg.text}</div>}
          <div className="set-row">
            <button type="submit" className="set-button" disabled={emailBusy}>
              {emailBusy ? "Запазване…" : "Смени имейла"}
            </button>
          </div>
        </form>
      </Card>
    </>
  );
}
