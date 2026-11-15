import { useState } from "react";
import { tr } from "../i18n";

// Always the newest desktop release (the page lists Shmirka-Setup-X.exe under "Assets").
export const DESKTOP_DOWNLOAD_URL = "https://github.com/shocknthunder-alt/discord-clone/releases/latest";
const DOWNLOAD_URL = DESKTOP_DOWNLOAD_URL;
const HIDE_KEY = "desktopAppBannerHiddenUntil";
const HIDE_FOR_MS = 7 * 24 * 60 * 60 * 1000;

function shouldShow(): boolean {
  if (window.shmirkaDesktop) return false; // already in the desktop app
  if (!/Windows/i.test(navigator.userAgent)) return false; // the installer is Windows-only
  try {
    return Date.now() > Number(localStorage.getItem(HIDE_KEY) || 0);
  } catch {
    return true;
  }
}

/** Browser users on Windows: tell them about the desktop app (hidden for a week once closed). */
export default function DesktopAppBanner() {
  const [visible, setVisible] = useState(shouldShow);
  if (!visible) return null;

  const hide = () => {
    try {
      localStorage.setItem(HIDE_KEY, String(Date.now() + HIDE_FOR_MS));
    } catch {
      // storage blocked — just hide for this session
    }
    setVisible(false);
  };

  return (
    <div className="desktop-app-banner" role="status">
      <span>
        💻{" "}
        {tr(
          "Имаме десктоп приложение — push-to-talk в игри, по-гладък стрийм през видеокартата и звук от отделни приложения.",
          "There's a desktop app — push-to-talk in games, smoother streaming on the graphics card and sound from single apps.",
        )}
      </span>
      <a className="update-now" href={DOWNLOAD_URL} target="_blank" rel="noreferrer" onClick={hide}>
        {tr("Изтегли", "Download")}
      </a>
      <button className="update-later" onClick={hide} aria-label={tr("Скрий", "Hide")} title={tr("Скрий за 7 дни", "Hide for 7 days")}>
        ✕
      </button>
    </div>
  );
}
