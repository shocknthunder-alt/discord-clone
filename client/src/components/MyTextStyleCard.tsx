import { useEffect, useRef, useState } from "react";
import { TEXT_FONTS, cleanTextStyle, type TextFont, type TextStyle } from "@discord-clone/shared";
import { updateProfile } from "../api/auth.api";
import { useAuthStore } from "../store/authStore";
import { TEXT_COLORS, fontLabel, textStyleCss, FONT_FAMILIES } from "../utils/textStyle";
import { tr } from "../i18n";

/**
 * Settings → Чат → "Моят текст": colour / bold / italic / font of all my messages — everyone sees it.
 * Saved on its own right away (not with "Запази промените"), like the status.
 */
export default function MyTextStyleCard() {
  const saved = useAuthStore((s) => s.user?.textStyle ?? null);
  const [style, setStyle] = useState<TextStyle>(saved ?? {});
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function change(patch: Partial<TextStyle>, delay = 0) {
    const next = { ...style, ...patch };
    setStyle(next);
    if (timer.current) clearTimeout(timer.current);
    // The colour wheel fires on every move — save when it stops.
    timer.current = setTimeout(() => void save(next), delay);
  }

  async function save(next: TextStyle) {
    setState("saving");
    try {
      const user = await updateProfile({ textStyle: cleanTextStyle(next) });
      const auth = useAuthStore.getState();
      if (auth.user) auth.setUser({ ...auth.user, ...user });
      setState("saved");
    } catch {
      setState("error");
    }
  }

  const color = style.color ?? null;

  return (
    <section className="set-card my-text-card">
      <h3 className="set-card-title">
        {tr("Моят текст", "My text")}
        <span className={`my-text-state ${state}`}>
          {state === "saving" ? tr("Запазвам…", "Saving…") : state === "saved" ? tr("✓ Запазено", "✓ Saved") : state === "error" ? tr("Не стана — опитай пак", "Failed — try again") : ""}
        </span>
      </h3>
      <p className="set-card-hint">
        {tr("Как изглеждат всичките ти съобщения — виждат го всички. За отделни думи ползвай Aa до полето за писане.", "How all your messages look — everyone sees it. For single words use Aa next to the message box.")}
      </p>
      <div className="set-card-body">
        <div className="my-text-row">
          <span className="my-text-label">{tr("Цвят", "Colour")}</span>
          <div className="my-text-colors">
            <button type="button" className={`my-text-swatch none ${!color ? "on" : ""}`} onClick={() => change({ color: null })} title={tr("Обикновен (по темата)", "Normal (theme)")}>
              ⊘
            </button>
            {TEXT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`my-text-swatch ${color === c ? "on" : ""}`}
                style={{ background: c }}
                onClick={() => change({ color: c })}
                title={c}
                aria-label={c}
              />
            ))}
            <label className={`my-text-swatch custom ${color && !TEXT_COLORS.includes(color) ? "on" : ""}`} title={tr("Друг цвят", "Another colour")} style={color && !TEXT_COLORS.includes(color) ? { background: color } : undefined}>
              🎨
              <input type="color" value={color ?? "#ff5c5c"} onChange={(e) => change({ color: e.target.value }, 400)} />
            </label>
          </div>
        </div>

        <div className="my-text-row">
          <span className="my-text-label">{tr("Стил", "Style")}</span>
          <div className="my-text-buttons">
            <button type="button" className={style.bold ? "on" : ""} onClick={() => change({ bold: !style.bold })} aria-pressed={!!style.bold}>
              <b>{tr("Удебелен", "Bold")}</b>
            </button>
            <button type="button" className={style.italic ? "on" : ""} onClick={() => change({ italic: !style.italic })} aria-pressed={!!style.italic}>
              <i>{tr("Курсив", "Italic")}</i>
            </button>
          </div>
        </div>

        <div className="my-text-row">
          <span className="my-text-label">{tr("Шрифт", "Font")}</span>
          <div className="my-text-buttons">
            {([null, ...TEXT_FONTS] as (TextFont | null)[]).map((f) => (
              <button
                key={f ?? "normal"}
                type="button"
                className={(style.font ?? null) === f ? "on" : ""}
                style={f ? { fontFamily: FONT_FAMILIES[f] } : undefined}
                onClick={() => change({ font: f })}
              >
                {fontLabel(f)}
              </button>
            ))}
          </div>
        </div>

        <div className="set-preview my-text-preview">
          <span style={textStyleCss(cleanTextStyle(style))}>
            {tr("Здрасти! Така ще виждат съобщенията ми. 👋", "Hi! This is how everyone will see my messages. 👋")}
          </span>
        </div>
      </div>
    </section>
  );
}
