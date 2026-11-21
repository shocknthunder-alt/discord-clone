import { CURSOR_COLORS, CURSOR_SIZES, CURSOR_SKINS, cursorSvg, svgDataUrl, skinById } from "./cursorSkins";
import { useCursorStore } from "./cursorStore";
import { tr } from "../i18n";

/** Settings → Външен вид → 🖱️ Курсор. Applied (and kept on this device) as soon as it's clicked. */
export default function CursorCard() {
  const { skinId, color, size, set } = useCursorStore();
  const skin = skinById(skinId);
  const shownColor = color ?? skin?.defaultColor ?? "#4c8dff";
  const touchOnly = typeof matchMedia === "function" && matchMedia("(hover: none)").matches;

  const art = (id: string, kind: "arrow" | "pointer", px: number) => {
    const s = skinById(id)!;
    return svgDataUrl(cursorSvg(s, kind, id === skinId ? shownColor : s.defaultColor, px).svg);
  };

  return (
    <section className="set-card cursor-card">
      <h3 className="set-card-title">{tr("🖱️ Курсор", "🖱️ Cursor")}</h3>
      <p className="set-card-hint">
        {touchOnly
          ? tr("На телефон няма курсор — това е за компютъра.", "Phones have no cursor — this is for the computer.")
          : tr(
              "Модел, цвят и размер на мишката в Шмирката. Вляво стрелката, вдясно ръчичката над бутони и линкове. Важи на това устройство.",
              "Model, colour and size of the mouse pointer in Shmirka. Left: the arrow, right: the hand over buttons and links. Applies on this device.",
            )}
      </p>
      <div className="set-card-body">
        <div className="cursor-grid">
          <button type="button" className={`cursor-skin ${!skin ? "selected" : ""}`} onClick={() => set({ skinId: "system" })}>
            <span className="cursor-skin-art">
              <span className="system-arrow">↖</span>
            </span>
            {tr("Обикновен", "System")}
          </button>
          {CURSOR_SKINS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`cursor-skin ${skinId === s.id ? "selected" : ""}`}
              data-skin={s.id}
              onClick={() => set({ skinId: s.id, color: skinId === s.id ? color : null })}
            >
              <span className="cursor-skin-art">
                <img src={art(s.id, "arrow", 40)} alt="" />
                <img src={art(s.id, "pointer", 40)} alt="" />
              </span>
              {tr(s.name[0], s.name[1])}
            </button>
          ))}
        </div>

        {skin && (
          <>
            <div className="cursor-row">
              <span className="cursor-row-label">{tr("Цвят", "Colour")}</span>
              <button
                type="button"
                className={`cursor-swatch ${color === null ? "on" : ""}`}
                style={{ background: skin.defaultColor }}
                title={tr("Цветът на модела", "The model's own colour")}
                onClick={() => set({ color: null })}
              >
                ★
              </button>
              {CURSOR_COLORS.map((c) => (
                <button key={c} type="button" className={`cursor-swatch ${color === c ? "on" : ""}`} style={{ background: c }} title={c} aria-label={c} onClick={() => set({ color: c })} />
              ))}
              <label className={`cursor-swatch ${color && !CURSOR_COLORS.includes(color) ? "on" : ""}`} title={tr("Друг цвят", "Another colour")} style={color && !CURSOR_COLORS.includes(color) ? { background: color } : undefined}>
                🎨
                <input type="color" value={shownColor} onChange={(e) => set({ color: e.target.value })} />
              </label>
            </div>
            <div className="cursor-row">
              <span className="cursor-row-label">{tr("Размер", "Size")}</span>
              <div className="cursor-sizes">
                {CURSOR_SIZES.map((px) => (
                  <button key={px} type="button" className={size === px ? "on" : ""} onClick={() => set({ size: px })}>
                    {px}px
                  </button>
                ))}
              </div>
            </div>
            {size > 32 && (
              <p className="set-hint">
                {tr(
                  "Големите курсори (над 32px) браузърът понякога сменя с обикновения съвсем до ръба на прозореца — това е нормално.",
                  "Big cursors (over 32px) are sometimes swapped for the normal one right at the window edge by the browser — that's normal.",
                )}
              </p>
            )}
            <div className="cursor-test">
              <span className="cursor-test-big">
                <img src={svgDataUrl(cursorSvg(skin, "arrow", shownColor, 64).svg)} alt="" />
                <img src={svgDataUrl(cursorSvg(skin, "pointer", shownColor, 64).svg)} alt="" />
              </span>
              <span>{tr("Мини с мишката тук и над бутона →", "Move the mouse here and over the button →")}</span>
              <button type="button" className="set-button primary">
                {tr("Бутон", "Button")}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
