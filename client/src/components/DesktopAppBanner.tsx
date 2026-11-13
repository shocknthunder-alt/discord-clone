import { useState } from "react";

const DOWNLOAD_URL = "https://drive.google.com/file/d/1J4Vo5LS3kC1j0wPeLS_kq4TXzpA8ftTc/view?usp=sharing";
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
        💻 Имаме десктоп приложение — push-to-talk в игри, по-гладък стрийм през видеокартата и звук от
        отделни приложения.
      </span>
      <a className="update-now" href={DOWNLOAD_URL} target="_blank" rel="noreferrer" onClick={hide}>
        Изтегли
      </a>
      <button className="update-later" onClick={hide} aria-label="Скрий" title="Скрий за 7 дни">
        ✕
      </button>
    </div>
  );
}
