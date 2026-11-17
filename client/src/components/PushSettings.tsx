import { useEffect, useState } from "react";
import { ANDROID_APK_URL, LATEST_ANDROID_VERSION_CODE, isNativeApp, nativeInfo, openExternal } from "../native/native";
import { disablePush, enablePush, getPushState, isStandalone, type PushState } from "../native/push";
import { promptInstall, useInstallStore } from "../native/install";
import { useT } from "../i18n";

/** Settings → Известия: 📱 phone push, install the site, the Android app. */
export default function PushSettings() {
  const t = useT();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shell, setShell] = useState<{ version: string; versionCode: number } | null>(null);
  const installPrompt = useInstallStore((s) => s.prompt);
  const native = isNativeApp();
  const android = /Android/i.test(navigator.userAgent);

  useEffect(() => {
    void getPushState().then(setState);
    if (native) void nativeInfo().then((i) => i && setShell(i));
  }, [native]);

  async function toggle(on: boolean) {
    setBusy(true);
    setError(null);
    try {
      const next = on ? await enablePush() : await disablePush();
      setState(next);
      if (on && next !== "on") setError(t("Не стана — разреши известията, когато телефонът/браузърът попита.", "That didn't work — allow notifications when the phone/browser asks."));
    } catch (err) {
      console.warn(err);
      setError(t("Не стана. Опитай пак.", "That didn't work. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <label className={`set-toggle ${state === "unsupported" || state === "needs-install" || busy ? "disabled" : ""}`}>
        <span className="set-toggle-text">
          <span className="set-toggle-label">📱 {t("Известия, докато приложението е затворено", "Notifications while the app is closed")}</span>
          <span className="set-toggle-hint">
            {t(
              "Push за @споменавания, лични съобщения и обаждания — на телефона и в браузъра, дори когато Шмирка не е отворена. Не идват, докато гледаш приложението на някое устройство.",
              "Push for @mentions, direct messages and calls — on the phone and in the browser, even with Shmirka closed. They don't come while you're looking at the app on any device.",
            )}
          </span>
        </span>
        <input
          type="checkbox"
          checked={state === "on"}
          disabled={state === null || state === "unsupported" || state === "needs-install" || busy}
          onChange={(e) => void toggle(e.target.checked)}
        />
        <span className="set-switch" aria-hidden />
      </label>
      {state === "denied" && (
        <p className="set-hint warn">{t("Известията са блокирани — разреши ги в настройките на телефона/браузъра за Шмирка.", "Notifications are blocked — allow them for Shmirka in the phone/browser settings.")}</p>
      )}
      {state === "needs-install" && (
        <p className="set-hint warn">
          {t("На iPhone известията работят само след „Сподели“ ⬆️ → „Добави към началния екран“ и отваряне оттам.", "On iPhone notifications only work after Share ⬆️ → “Add to Home Screen” and opening it from there.")}
        </p>
      )}
      {state === "unsupported" && native && (
        <p className="set-hint warn">{t("Тази версия на приложението още няма известия — инсталирай новата отдолу.", "This app version has no notifications yet — install the new one below.")}</p>
      )}
      {error && <p className="set-hint warn">{error}</p>}

      {!native && !isStandalone() && installPrompt && (
        <div>
          <button type="button" className="set-button" onClick={() => void promptInstall()}>
            ⬇️ {t("Инсталирай Шмирка като приложение", "Install Shmirka as an app")}
          </button>
        </div>
      )}
      {!native && android && (
        <p className="set-hint">
          {t("Android приложение (гласът продължава при заключен екран): ", "Android app (voice keeps going with the screen locked): ")}
          <a href={ANDROID_APK_URL} target="_blank" rel="noreferrer">
            {t("изтегли APK", "download the APK")}
          </a>
        </p>
      )}
      {native && shell && (
        <p className="set-hint">
          {t("Приложение", "App")} v{shell.version}
          {shell.versionCode < LATEST_ANDROID_VERSION_CODE && (
            <>
              {" — "}
              <a onClick={() => openExternal(ANDROID_APK_URL)}>{t("има нова версия, изтегли я", "a new version is out, download it")}</a>
            </>
          )}
        </p>
      )}
    </>
  );
}
