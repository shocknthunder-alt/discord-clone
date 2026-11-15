import { PublicClientApplication } from "@azure/msal-browser";
import axios from "axios";
import { useEffect, useRef, useState } from "react";
import {
  fetchOAuthConfig,
  oauthLinkWithPassword,
  oauthSignIn,
  takeDesktopHandoff,
  type OAuthConfig,
  type OAuthProvider,
  type OAuthResult,
} from "../api/oauth.api";
import PasswordInput from "./PasswordInput";
import { useLang, useT } from "../i18n";

/**
 * "Влез с Google / Microsoft" under the login and register forms.
 * Browser: the providers' own sign-in windows. Desktop app: Google refuses sign-in inside an app's
 * built-in browser, so one button opens the real browser at /desktop-login and the app waits there
 * for the session to be handed over.
 */

interface GoogleId {
  accounts: {
    id: {
      initialize(o: { client_id: string; callback: (r: { credential?: string }) => void; ux_mode?: string; auto_select?: boolean }): void;
      renderButton(el: HTMLElement, o: Record<string, unknown>): void;
    };
  };
}
declare global {
  interface Window {
    google?: GoogleId;
  }
}

let gsiPromise: Promise<GoogleId> | null = null;
function loadGoogle(): Promise<GoogleId> {
  gsiPromise ??= new Promise<GoogleId>((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve(window.google);
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => (window.google?.accounts?.id ? resolve(window.google) : reject(new Error("gsi missing")));
    s.onerror = () => {
      gsiPromise = null;
      reject(new Error("gsi failed to load"));
    };
    document.head.appendChild(s);
  });
  return gsiPromise;
}

let msal: { clientId: string; app: Promise<PublicClientApplication> } | null = null;
function microsoftApp(clientId: string) {
  if (!msal || msal.clientId !== clientId) {
    const app = new PublicClientApplication({
      auth: {
        clientId,
        authority: "https://login.microsoftonline.com/common",
        redirectUri: `${window.location.origin}/msal-redirect.html`,
      },
      cache: { cacheLocation: "sessionStorage" },
    });
    msal = { clientId, app: app.initialize().then(() => app) };
  }
  return msal.app;
}

function errorText(err: unknown, fallback: string) {
  const m = axios.isAxiosError(err) ? err.response?.data?.error : undefined;
  return typeof m === "string" ? m : fallback;
}

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export default function OAuthButtons({ onSignedIn }: { onSignedIn: (r: { user: import("@discord-clone/shared").UserDTO; token: string }) => void }) {
  const t = useT();
  const lang = useLang();
  const [config, setConfig] = useState<OAuthConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<OAuthProvider | "desktop" | null>(null);
  const [link, setLink] = useState<Extract<OAuthResult, { kind: "needsPassword" }> | null>(null);
  const [linkPassword, setLinkPassword] = useState("");
  const googleRef = useRef<HTMLDivElement>(null);
  const desktop = !!window.shmirkaDesktop;
  const onSignedInRef = useRef(onSignedIn);
  onSignedInRef.current = onSignedIn;

  useEffect(() => {
    void fetchOAuthConfig().then(setConfig);
  }, []);

  async function finish(provider: OAuthProvider, idToken: string) {
    setError(null);
    setBusy(provider);
    try {
      const r = await oauthSignIn(provider, idToken);
      if (r.kind === "ok") onSignedInRef.current(r);
      else setLink(r);
    } catch (err) {
      setError(errorText(err, t("Входът не стана. Опитай пак.", "Sign-in failed. Try again.")));
    } finally {
      setBusy(null);
    }
  }
  const finishRef = useRef(finish);
  finishRef.current = finish;

  // Google draws its own button (required by its rules) into our box.
  useEffect(() => {
    if (desktop || !config?.google || !googleRef.current) return;
    const el = googleRef.current;
    let cancelled = false;
    loadGoogle()
      .then((g) => {
        if (cancelled) return;
        g.accounts.id.initialize({
          client_id: config.google!,
          ux_mode: "popup",
          callback: (r) => r.credential && void finishRef.current("google", r.credential),
        });
        el.innerHTML = "";
        g.accounts.id.renderButton(el, { theme: "filled_black", size: "large", text: "continue_with", shape: "pill", width: 300, locale: lang });
      })
      .catch(() => !cancelled && setError(t("Google входът не се зареди (провери интернета/блокер на реклами).", "Google sign-in didn't load (check the internet / ad blocker).")));
    return () => {
      cancelled = true;
    };
  }, [config?.google, desktop, lang]);

  async function microsoft() {
    if (!config?.microsoft) return;
    setError(null);
    setBusy("microsoft");
    try {
      const app = await microsoftApp(config.microsoft);
      const r = await app.loginPopup({ scopes: ["openid", "profile", "email"], prompt: "select_account" });
      setBusy(null);
      await finish("microsoft", r.idToken);
    } catch (err) {
      setBusy(null);
      const code = (err as { errorCode?: string }).errorCode;
      if (code !== "user_cancelled") setError(t("Microsoft входът не стана. Опитай пак.", "Microsoft sign-in failed. Try again."));
    }
  }

  // Desktop: real browser + wait for the hand-over (5 min).
  const pollRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
  }, []);
  function desktopSignIn() {
    const code = randomCode();
    setError(null);
    setBusy("desktop");
    window.open(`${window.location.origin}/desktop-login?code=${code}`, "_blank"); // → system browser
    const started = Date.now();
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      if (Date.now() - started > 5 * 60_000) {
        window.clearInterval(pollRef.current!);
        pollRef.current = null;
        setBusy(null);
        setError(t("Времето изтече — натисни бутона пак.", "Timed out — press the button again."));
        return;
      }
      const r = await takeDesktopHandoff(code);
      if (r) {
        window.clearInterval(pollRef.current!);
        pollRef.current = null;
        setBusy(null);
        onSignedInRef.current(r);
      }
    }, 2000);
  }

  async function submitLink(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!link || !linkPassword) return;
    setError(null);
    try {
      onSignedInRef.current(await oauthLinkWithPassword(link.linkToken, linkPassword));
    } catch (err) {
      setError(errorText(err, t("Грешна парола.", "Wrong password.")));
    }
  }

  if (!config || (!config.google && !config.microsoft)) return null;

  if (link) {
    return (
      <div className="oauth-box">
        <div className="oauth-link-text">
          {t("Имейлът", "The e-mail")} ({link.email}) {t("вече има акаунт", "already has an account")} <b>{link.username}</b>.{" "}
          {t(
            "Въведи паролата му веднъж и следващия път влизаш само с Microsoft.",
            "Enter its password once and next time Microsoft alone signs you in.",
          )}
        </div>
        {/* Not a <form>: this sits inside the login form (forms can't nest). */}
        <div
          className="oauth-link-form"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submitLink(e);
            }
          }}
        >
          <PasswordInput autoComplete="current-password" value={linkPassword} onChange={(e) => setLinkPassword(e.target.value)} />
          <button type="button" className="oauth-btn" disabled={!linkPassword} onClick={(e) => void submitLink(e)}>
            {t("Свържи и влез", "Link and sign in")}
          </button>
        </div>
        {error && <div className="error">{error}</div>}
        <a className="oauth-cancel" onClick={() => setLink(null)}>
          {t("Отказ", "Cancel")}
        </a>
      </div>
    );
  }

  return (
    <div className="oauth-box">
      <div className="oauth-or">
        <span>{t("или", "or")}</span>
      </div>
      {desktop ? (
        <>
          <button type="button" className="oauth-btn" disabled={busy === "desktop"} onClick={desktopSignIn}>
            {busy === "desktop" ? t("Чакам да влезеш в браузъра…", "Waiting for you to sign in in the browser…") : `${t("Влез с", "Sign in with")} ${[config.google && "Google", config.microsoft && "Microsoft"].filter(Boolean).join(t(" или ", " or "))}`}
          </button>
          {busy === "desktop" && (
            <div className="oauth-hint">
              {t("Отвори се браузърът ти — влез там и се върни тук.", "Your browser opened — sign in there and come back.")} <a onClick={() => desktopSignIn()}>{t("Отвори пак", "Open again")}</a>
            </div>
          )}
        </>
      ) : (
        <>
          {config.google && <div className="oauth-google" ref={googleRef} />}
          {config.microsoft && (
            <button type="button" className="oauth-btn microsoft" disabled={busy === "microsoft"} onClick={() => void microsoft()}>
              <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
                <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
              </svg>
              {busy === "microsoft" ? t("Влизане…", "Signing in…") : t("Продължи с Microsoft", "Continue with Microsoft")}
            </button>
          )}
        </>
      )}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
