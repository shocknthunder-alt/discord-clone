import { useEffect, useState } from "react";
import { nativeInfo, isNativeApp } from "../native/native";
import { tr } from "../i18n";

/**
 * Settings sidebar, above "Изход": which app the person runs and its version (desktop / Android),
 * plus the site version (commit + build date) that every kind of app loads.
 */
export default function AppVersion() {
  const [app, setApp] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const desktop = window.shmirkaDesktop;
    if (desktop) {
      if (desktop.getVersion) {
        desktop
          .getVersion()
          .then((v) => !cancelled && setApp(tr(`🖥️ Десктоп ${v}`, `🖥️ Desktop ${v}`)))
          .catch(() => !cancelled && setApp(tr("🖥️ Десктоп", "🖥️ Desktop")));
      } else setApp(tr("🖥️ Десктоп (стара, под 1.6.0)", "🖥️ Desktop (old, below 1.6.0)"));
    } else if (isNativeApp()) {
      void nativeInfo().then((i) => !cancelled && setApp(i ? `📱 Android ${i.version}` : "📱 Android"));
    } else {
      setApp(tr("🌐 Браузър", "🌐 Browser"));
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const id = __BUILD_ID__;
  const site = /^[0-9a-f]{40}$/i.test(id) ? id.slice(0, 7) : "dev";
  const built = new Date(__BUILD_TIME__);
  const date = isNaN(built.getTime()) ? "" : built.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <div className="set-version" title={tr(`Сайт: ${id}`, `Site: ${id}`)}>
      <span className="set-version-app">{app ?? "…"}</span>
      <span className="set-version-site">
        {tr("Сайт", "Site")} {site}
        {date && ` · ${date}`}
      </span>
    </div>
  );
}
