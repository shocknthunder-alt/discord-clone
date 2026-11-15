import { useEffect, useMemo, useState } from "react";
import { closeScreenPicker, useScreenPickerStore } from "../store/screenPickerStore";
import { useEscapeKey } from "../hooks/useEscapeKey";

/** Desktop-app-only picker: what to stream — a game/app window, a browser window, or a whole screen. */
export default function ScreenSourcePicker() {
  const open = useScreenPickerStore((s) => s.open);
  return open ? <PickerDialog /> : null;
}

type Tab = "apps" | "browser" | "screens";

// Browser windows are told apart by their title ("YouTube - Brave", "… — Mozilla Firefox"). Windows
// hands out one entry per browser WINDOW (showing its active tab) — single tabs aren't separate.
const BROWSER_TITLE = /[-—–]\s*(google chrome|brave|microsoft\s*edge|opera( gx)?|vivaldi|mozilla firefox|firefox|yandex|chromium|arc)\s*$/i;

const TABS: { id: Tab; icon: string; label: string; empty: string }[] = [
  { id: "apps", icon: "🎮", label: "Игри и приложения", empty: "Няма отворени прозорци на игри или програми." },
  { id: "browser", icon: "🌐", label: "Браузър", empty: "Няма отворен браузър (Chrome, Brave, Edge, Firefox…)." },
  { id: "screens", icon: "🖥", label: "Цял екран", empty: "Не са намерени екрани." },
];

function PickerDialog() {
  useEscapeKey(() => closeScreenPicker(null));
  const [sources, setSources] = useState<DesktopScreenSource[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("apps");
  const audio = true; // streams always carry sound

  const groups = useMemo(() => {
    const list = sources ?? [];
    const windows = list.filter((s) => !s.isScreen);
    return {
      apps: windows.filter((s) => !BROWSER_TITLE.test(s.name)),
      browser: windows.filter((s) => BROWSER_TITLE.test(s.name)),
      screens: list.filter((s) => s.isScreen).map((s, i, all) => ({ ...s, name: all.length > 1 ? `Екран ${i + 1}` : "Целият екран" })),
    } satisfies Record<Tab, DesktopScreenSource[]>;
  }, [sources]);

  useEffect(() => {
    let cancelled = false;
    window.shmirkaDesktop
      ?.getScreenSources()
      .then((list) => {
        if (cancelled) return;
        setSources(list);
        // Start where there is something: games/apps first, else browser, else whole screen.
        const windows = list.filter((s) => !s.isScreen);
        const apps = windows.filter((s) => !BROWSER_TITLE.test(s.name));
        const first: Tab = apps.length ? "apps" : windows.length ? "browser" : "screens";
        setTab(first);
        setSelected((first === "apps" ? apps[0] : first === "browser" ? windows[0] : list.find((s) => s.isScreen))?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setSources([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = groups[tab];
  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div className="modal-overlay" onClick={() => closeScreenPicker(null)}>
      <div className="modal-card screen-picker-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-back" onClick={() => closeScreenPicker(null)} aria-label="Затвори">
          ✕
        </button>
        <h1 className="modal-title">Какво да стриймваш?</h1>

        <div className="screen-picker-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={`screen-picker-tab${tab === t.id ? " on" : ""}`}
              onClick={() => setTab(t.id)}
            >
              <span className="screen-picker-tab-icon">{t.icon}</span>
              {t.label}
              {sources && <span className="screen-picker-tab-count">{groups[t.id].length}</span>}
            </button>
          ))}
        </div>

        <div className="screen-picker-body">
          {sources === null && <p className="modal-subtitle">Зареждане…</p>}
          {sources !== null && shown.length === 0 && <p className="modal-subtitle">{current.empty}</p>}
          {shown.length > 0 && (
            <div className="screen-picker-grid">
              {shown.map((src) => (
                <button
                  key={src.id}
                  className={`screen-picker-item${selected === src.id ? " selected" : ""}`}
                  onClick={() => setSelected(src.id)}
                  onDoubleClick={() => closeScreenPicker({ id: src.id, audio })}
                  title={src.name}
                >
                  <img src={src.thumbnail} alt="" />
                  <span>
                    {src.icon && <img className="screen-picker-icon" src={src.icon} alt="" />}
                    {src.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="screen-picker-footer">
          <span className="screen-picker-hint">
            {tab === "apps" ? "Само прозорецът на играта/програмата — другите не виждат останалото. " : ""}
            Звукът се споделя винаги.
          </span>
          <button
            className="modal-join-button screen-picker-go"
            disabled={!selected}
            onClick={() => selected && closeScreenPicker({ id: selected, audio })}
          >
            <span className="hud-live-dot" /> Започни стрийм
          </button>
        </div>
      </div>
    </div>
  );
}
