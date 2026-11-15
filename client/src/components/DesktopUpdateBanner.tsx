import { useEffect, useState } from "react";
import { useVoiceStore } from "../store/voiceStore";
import { DESKTOP_DOWNLOAD_URL } from "./DesktopAppBanner";
import { rememberVoiceForRestart } from "../webrtc/voiceResume";
import { tr } from "../i18n";

const OLD_SHELL_HIDE_KEY = "desktopSelfUpdateBannerHiddenUntil";
const OLD_SHELL_HIDE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Desktop app only.
 *  - 1.6.0+: a new app version was downloaded in the background → "Рестартирай" installs it
 *    (or it installs by itself the next time the app is closed).
 *  - older shells (no self-update): ask once to install the new version by hand — from then on
 *    it updates itself.
 */
export default function DesktopUpdateBanner() {
  const desktop = window.shmirkaDesktop;
  const [readyVersion, setReadyVersion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const inCall = useVoiceStore((s) => !!s.activeVoiceChannelId);
  const [oldShellVisible, setOldShellVisible] = useState(() => {
    if (!desktop || desktop.onUpdateReady) return false;
    try {
      return Date.now() > Number(localStorage.getItem(OLD_SHELL_HIDE_KEY) || 0);
    } catch {
      return true;
    }
  });

  useEffect(() => desktop?.onUpdateReady?.((version) => setReadyVersion(version)), [desktop]);

  // Install by itself at a quiet moment: not in a call (or streaming), and the app has been in the
  // background for a minute or untouched for 5 minutes. A restart takes a few seconds.
  useEffect(() => {
    if (!readyVersion || !desktop?.installUpdate) return;
    let lastInput = Date.now();
    let hiddenSince = document.hasFocus() ? 0 : Date.now();
    const onInput = () => (lastInput = Date.now());
    const onFocus = () => (hiddenSince = 0);
    const onBlur = () => (hiddenSince = Date.now());
    const events = ["keydown", "pointerdown", "pointermove", "wheel"] as const;
    events.forEach((e) => window.addEventListener(e, onInput, { passive: true }));
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    const id = setInterval(() => {
      const v = useVoiceStore.getState();
      if (v.activeVoiceChannelId || v.isScreenSharing) return;
      const now = Date.now();
      const background = hiddenSince > 0 && now - hiddenSince > 60_000;
      const idle = now - lastInput > 5 * 60_000;
      if (background || idle) desktop.installUpdate?.();
    }, 15_000);
    return () => {
      clearInterval(id);
      events.forEach((e) => window.removeEventListener(e, onInput));
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, [readyVersion, desktop]);

  if (!desktop) return null;

  if (readyVersion && !dismissed && desktop.installUpdate) {
    return (
      <div className="desktop-app-banner" role="status">
        <span>
          🆕 {tr("Нова версия на приложението", "A new app version")} ({readyVersion}) {tr("е готова.", "is ready.")}
          {inCall
            ? tr(
                " Ще се инсталира сама, когато излезеш от разговора — или рестартирай сега (влизаш пак в същия канал).",
                " It installs itself once you leave the call — or restart now (you rejoin the same channel).",
              )
            : tr(" Ще се инсталира сама след малко, когато не ползваш приложението.", " It installs itself shortly, when you're not using the app.")}
        </span>
        <button
          className="update-now"
          onClick={() => {
            rememberVoiceForRestart();
            desktop.installUpdate?.();
          }}
        >
          {tr("Рестартирай", "Restart")}
        </button>
        <button
          className="update-later"
          onClick={() => setDismissed(true)}
          title={tr("По-късно — ще се инсталира сама, когато затвориш приложението", "Later — it installs itself when you close the app")}
          aria-label={tr("По-късно", "Later")}
        >
          ✕
        </button>
      </div>
    );
  }

  if (oldShellVisible) {
    const hide = () => {
      try {
        localStorage.setItem(OLD_SHELL_HIDE_KEY, String(Date.now() + OLD_SHELL_HIDE_MS));
      } catch {
        // storage blocked — hide for this session
      }
      setOldShellVisible(false);
    };
    return (
      <div className="desktop-app-banner" role="status">
        <span>💻 {tr("Инсталирай новата версия на приложението веднъж — оттам нататък ще се обновява само.", "Install the new app version once — from then on it updates itself.")}</span>
        <a className="update-now" href={DESKTOP_DOWNLOAD_URL} target="_blank" rel="noreferrer" onClick={hide}>
          {tr("Изтегли", "Download")}
        </a>
        <button className="update-later" onClick={hide} aria-label={tr("Скрий", "Hide")} title={tr("Скрий за 3 дни", "Hide for 3 days")}>
          ✕
        </button>
      </div>
    );
  }

  return null;
}
