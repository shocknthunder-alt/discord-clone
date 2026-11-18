import { useState } from "react";
import { tr } from "../i18n";
import { ANDROID_APK_URL, isNativeApp } from "../native/native";

// Always the newest desktop release (the page lists Shmirka-Setup-X.exe under "Assets").
export const DESKTOP_DOWNLOAD_URL = "https://github.com/shocknthunder-alt/discord-clone/releases/latest";
/** The Android release page (APK + how to install) — for people reading this on a PC. */
const ANDROID_PAGE_URL = "https://github.com/shocknthunder-alt/discord-clone/releases/tag/android";
// New key: the reworded banner shows once more to everyone who had closed the old one.
const HIDE_KEY = "appBannerHiddenUntil";
const HIDE_FOR_MS = 7 * 24 * 60 * 60 * 1000;

type Kind = "windows" | "android" | "ios";

function detect(): Kind | null {
  if (window.shmirkaDesktop || isNativeApp()) return null; // already in one of the apps
  const ua = navigator.userAgent;
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return standalone ? null : "ios";
  if (/Windows/i.test(ua)) return "windows";
  return null;
}

function shouldShow(): Kind | null {
  const kind = detect();
  if (!kind) return null;
  try {
    return Date.now() > Number(localStorage.getItem(HIDE_KEY) || 0) ? kind : null;
  } catch {
    return kind;
  }
}

/** Browser users: "still in the web app? get the real one" (hidden for a week once closed). */
export default function DesktopAppBanner() {
  const [kind, setKind] = useState(shouldShow);
  if (!kind) return null;

  const hide = () => {
    try {
      localStorage.setItem(HIDE_KEY, String(Date.now() + HIDE_FOR_MS));
    } catch {
      // storage blocked — just hide for this session
    }
    setKind(null);
  };

  return (
    <div className="desktop-app-banner app-banner" role="status">
      {kind === "windows" && (
        <span className="app-banner-text">
          <span>
            💻 {tr("Още си в Web приложението? Не бъди Пепега, изтегли десктоп приложението", "Still in the web app? Don't be a Pepega, get the desktop app")}{" "}
            <a className="app-banner-link" href={DESKTOP_DOWNLOAD_URL} target="_blank" rel="noreferrer" onClick={hide}>
              {tr("от тук", "here")}
            </a>
          </span>
          <span className="app-banner-sub">
            📱 {tr("Има и версия за телефона", "There's a phone version too")}{" "}
            <a className="app-banner-link" href={ANDROID_PAGE_URL} target="_blank" rel="noreferrer">
              {">> "}
              {tr("Android", "Android")}
              {" <<"}
            </a>
          </span>
        </span>
      )}
      {kind === "android" && (
        <span className="app-banner-text">
          <span>📱 {tr("Още си в браузъра? Не бъди Пепега, изтегли приложението за телефона", "Still in the browser? Don't be a Pepega, get the phone app")}</span>
          <span className="app-banner-sub">{tr("Гласът продължава и при заключен екран.", "Voice keeps going with the screen locked.")}</span>
        </span>
      )}
      {kind === "ios" && (
        <span className="app-banner-text">
          <span>📱 {tr("Още си в Safari? Не бъди Пепега, сложи Шмирката на началния екран", "Still in Safari? Don't be a Pepega, put Shmirka on your home screen")}</span>
          <span className="app-banner-sub">
            {tr("Натисни Сподели ⬆️ → „Добави към началния екран“ — така идват и известия.", "Tap Share ⬆️ → “Add to Home Screen” — that also gets you notifications.")}
          </span>
        </span>
      )}
      {kind === "windows" && (
        <a className="update-now" href={DESKTOP_DOWNLOAD_URL} target="_blank" rel="noreferrer" onClick={hide}>
          {tr("Изтегли", "Download")}
        </a>
      )}
      {kind === "android" && (
        <a className="update-now" href={ANDROID_APK_URL} onClick={hide}>
          {tr("Изтегли", "Download")}
        </a>
      )}
      <button className="update-later" onClick={hide} aria-label={tr("Скрий", "Hide")} title={tr("Скрий за 7 дни", "Hide for 7 days")}>
        ✕
      </button>
    </div>
  );
}
