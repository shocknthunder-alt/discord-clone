import { useEffect, useState } from "react";
import { handOffToDesktop } from "../api/oauth.api";
import OAuthButtons from "../components/OAuthButtons";
import { useAuthStore } from "../store/authStore";
import { tr } from "../i18n";

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
          <h1>{tr("Невалиден линк", "Invalid link")}</h1>
          <p>{tr("Натисни „Влез с Google / Microsoft“ в приложението пак.", "Press \"Sign in with Google / Microsoft\" in the app again.")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>{tr("Вход за десктоп приложението", "Desktop app sign-in")}</h1>
        {state === "done" ? (
          <div className="success">{tr("✓ Готово! Върни се в приложението ШмиркаТа — вече си вътре. Този таб може да се затвори.", "✓ Done! Go back to the ШмиркаТа app — you're signed in. You can close this tab.")}</div>
        ) : token && user && !justSignedIn ? (
          <>
            <p>
              {tr("В този браузър вече си влязъл като", "In this browser you're already signed in as")} <b>{user.username}</b>.
            </p>
            <button type="button" disabled={state === "sending"} onClick={() => void send()}>
              {state === "sending" ? tr("Свързване…", "Connecting…") : `${tr("Влез в приложението като", "Sign in to the app as")} ${user.username}`}
            </button>
            <div className="switch-link">
              {tr("Друг акаунт?", "Another account?")} <a onClick={() => useAuthStore.getState().logout()}>{tr("Излез оттук", "Log out here")}</a> {tr("и влез наново.", "and sign in again.")}
            </div>
          </>
        ) : (
          <>
            <p>{tr("Влез с бутона отдолу — после се върни в приложението.", "Sign in with the button below — then go back to the app.")}</p>
            <OAuthButtons
              onSignedIn={({ user: u, token: t }) => {
                setAuth(u, t, true);
                setJustSignedIn(true);
              }}
            />
          </>
        )}
        {state === "error" && <div className="error">{tr("Не стана — натисни бутона в приложението пак.", "That didn't work — press the button in the app again.")}</div>}
      </div>
    </div>
  );
}
