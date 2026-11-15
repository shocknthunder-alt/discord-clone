import { setLang, useLang } from "../i18n";

/** Small БГ / EN switch (login and register pages, top-right corner). */
export default function LanguageSwitch() {
  const lang = useLang();
  return (
    <div className="lang-switch" role="group" aria-label="Language">
      <button type="button" className={lang === "bg" ? "on" : ""} onClick={() => setLang("bg")}>
        БГ
      </button>
      <button type="button" className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>
        EN
      </button>
    </div>
  );
}
