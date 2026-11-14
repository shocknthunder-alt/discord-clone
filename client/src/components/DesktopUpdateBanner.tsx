import { useEffect, useState } from "react";
import { useVoiceStore } from "../store/voiceStore";
import { DESKTOP_DOWNLOAD_URL } from "./DesktopAppBanner";

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

  if (!desktop) return null;

  if (readyVersion && !dismissed && desktop.installUpdate) {
    return (
      <div className="desktop-app-banner" role="status">
        <span>
          🆕 Нова версия на приложението ({readyVersion}) е готова.
          {inCall ? " Рестартът ще те извади от разговора за няколко секунди." : ""}
        </span>
        <button className="update-now" onClick={() => desktop.installUpdate?.()}>
          Рестартирай
        </button>
        <button
          className="update-later"
          onClick={() => setDismissed(true)}
          title="По-късно — ще се инсталира сама, когато затвориш приложението"
          aria-label="По-късно"
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
        <span>💻 Инсталирай новата версия на приложението веднъж — оттам нататък ще се обновява само.</span>
        <a className="update-now" href={DESKTOP_DOWNLOAD_URL} target="_blank" rel="noreferrer" onClick={hide}>
          Изтегли
        </a>
        <button className="update-later" onClick={hide} aria-label="Скрий" title="Скрий за 3 дни">
          ✕
        </button>
      </div>
    );
  }

  return null;
}
