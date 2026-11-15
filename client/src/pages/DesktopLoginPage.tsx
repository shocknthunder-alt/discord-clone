import { useEffect, useState } from "react";
import { handOffToDesktop } from "../api/oauth.api";
import OAuthButtons from "../components/OAuthButtons";
import { useAuthStore } from "../store/authStore";

/**
 * Opened in the REAL browser by the desktop app's "Влез с Google/Microsoft" (Google refuses sign-in
 * inside an app's built-in browser): sign in here, the session is handed to the app waiting with
 * the same code, and the app logs itself in.
 */
export default function DesktopLoginPage() {
  const code = new URLSearchParams(window.location.search).get("code") ?? "";
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const setAuth = useAuthStore((s) => s.setAuth);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function send() {
    setState("sending");
    try {
      await handOffToDesktop(code);
      setState("done");
    } catch {
      setState("error");
    }
  }

  // Signed in just now with a button on this page → hand over straight away.
  const [justSignedIn, setJustSignedIn] = useState(false);
  useEffect(() => {
    if (justSignedIn && token && state === "idle") void send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justSignedIn, token]);

  if (!/^[A-Za-z0-9_-]{32,128}$/.test(code)) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Невалиден линк</h1>
          <p>Натисни „Влез с Google / Microsoft“ в приложението пак.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Вход за десктоп приложението</h1>
        {state === "done" ? (
          <div className="success">✓ Готово! Върни се в приложението ШмиркаТа — вече си вътре. Този таб може да се затвори.</div>
        ) : token && user && !justSignedIn ? (
          <>
            <p>
              В този браузър вече си влязъл като <b>{user.username}</b>.
            </p>
            <button type="button" disabled={state === "sending"} onClick={() => void send()}>
              {state === "sending" ? "Свързване…" : `Влез в приложението като ${user.username}`}
            </button>
            <div className="switch-link">
              Друг акаунт? <a onClick={() => useAuthStore.getState().logout()}>Излез оттук</a> и влез наново.
            </div>
          </>
        ) : (
          <>
            <p>Влез с бутона отдолу — после се върни в приложението.</p>
            <OAuthButtons
              onSignedIn={({ user: u, token: t }) => {
                setAuth(u, t, true);
                setJustSignedIn(true);
              }}
            />
          </>
        )}
        {state === "error" && <div className="error">Не стана — натисни бутона в приложението пак.</div>}
      </div>
    </div>
  );
}
