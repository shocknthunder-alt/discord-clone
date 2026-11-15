import { useEffect, useMemo, useState } from "react";
import { closeScreenPicker, useScreenPickerStore } from "../store/screenPickerStore";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { tr } from "../i18n";

/**
 * Desktop-app-only picker: what to stream. One page, no tabs — the whole screen comes first and is
 * pre-selected (one click on "Започни стрийм" is enough), windows are listed below it.
 *
 * Why the screen first: Windows captures a single WINDOW with "Windows Graphics Capture", which
 * draws a yellow border around it and, for a game, adds work to the game's own frames (people's
 * games stuttered). The whole screen is captured by desktop duplication — no border, much lighter.
 */
export default function ScreenSourcePicker() {
  const open = useScreenPickerStore((s) => s.open);
  return open ? <PickerDialog /> : null;
}

// Browser windows are told apart by their title ("YouTube - Brave", "… — Mozilla Firefox"). Windows
// hands out one entry per browser WINDOW (showing its active tab) — single tabs aren't separate.
const BROWSER_TITLE = /[-—–]\s*(google chrome|brave|microsoft\s*edge|opera( gx)?|vivaldi|mozilla firefox|firefox|yandex|chromium|arc)\s*$/i;

const LAST_KEY = "screenPicker:last";

function SourceCard({
  src,
  selected,
  onSelect,
  onStart,
  big,
}: {
  src: DesktopScreenSource;
  selected: boolean;
  onSelect: () => void;
  onStart: () => void;
  big?: boolean;
}) {
  return (
    <button
      className={`screen-picker-item${selected ? " selected" : ""}${big ? " big" : ""}`}
      onClick={onSelect}
      onDoubleClick={onStart}
      title={src.name}
    >
      <img src={src.thumbnail} alt="" />
      <span>
        {src.icon && <img className="screen-picker-icon" src={src.icon} alt="" />}
        {src.name}
      </span>
    </button>
  );
}

function PickerDialog() {
  useEscapeKey(() => closeScreenPicker(null));
  const [sources, setSources] = useState<DesktopScreenSource[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [showWindows, setShowWindows] = useState(false);
  const audio = true; // streams always carry sound

  const groups = useMemo(() => {
    const list = sources ?? [];
    const windows = list.filter((s) => !s.isScreen);
    return {
      screens: list.filter((s) => s.isScreen).map((s, i, all) => ({ ...s, name: all.length > 1 ? `${tr("Екран", "Screen")} ${i + 1}` : tr("Целият екран", "Entire screen") })),
      apps: windows.filter((s) => !BROWSER_TITLE.test(s.name)),
      browser: windows.filter((s) => BROWSER_TITLE.test(s.name)),
    };
  }, [sources]);

  useEffect(() => {
    let cancelled = false;
    window.shmirkaDesktop
      ?.getScreenSources()
      .then((list) => {
        if (cancelled) return;
        setSources(list);
        // Same thing as last time if it is still there, otherwise the (first) whole screen.
        let last: string | null = null;
        try {
          last = localStorage.getItem(LAST_KEY);
        } catch {
          /* ignore */
        }
        const again = last ? list.find((s) => s.id === last) : undefined;
        const pick = again ?? list.find((s) => s.isScreen) ?? list[0];
        setSelected(pick?.id ?? null);
        if (pick && !pick.isScreen) setShowWindows(true);
        if (!list.some((s) => s.isScreen)) setShowWindows(true);
      })
      .catch(() => {
        if (!cancelled) setSources([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function start(id: string | null) {
    if (!id) return;
    try {
      localStorage.setItem(LAST_KEY, id);
    } catch {
      /* ignore */
    }
    closeScreenPicker({ id, audio });
  }

  const chosen = sources?.find((s) => s.id === selected);
  const windowChosen = !!chosen && !chosen.isScreen;
  const windowCount = groups.apps.length + groups.browser.length;

  const card = (src: DesktopScreenSource, big?: boolean) => (
    <SourceCard
      key={src.id}
      src={src}
      big={big}
      selected={selected === src.id}
      onSelect={() => setSelected(src.id)}
      onStart={() => start(src.id)}
    />
  );

  return (
    <div className="modal-overlay" onClick={() => closeScreenPicker(null)}>
      <div className="modal-card screen-picker-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-back" onClick={() => closeScreenPicker(null)} aria-label={tr("Затвори", "Close")}>
          ✕
        </button>
        <h1 className="modal-title">{tr("Какво да стриймваш?", "What do you want to stream?")}</h1>

        <div className="screen-picker-body">
          {sources === null && <p className="modal-subtitle">{tr("Зареждане…", "Loading…")}</p>}
          {sources !== null && sources.length === 0 && <p className="modal-subtitle">{tr("Не са намерени екрани или прозорци.", "No screens or windows found.")}</p>}

          {groups.screens.length > 0 && (
            <>
              <div className="screen-picker-section">
                🖥 {tr("Цял екран", "Entire screen")} <span className="screen-picker-badge">{tr("препоръчано за игри", "recommended for games")}</span>
              </div>
              <div className="screen-picker-grid screens">{groups.screens.map((s) => card(s, true))}</div>
            </>
          )}

          {windowCount > 0 && !showWindows && (
            <button className="screen-picker-more" onClick={() => setShowWindows(true)}>
              {tr("Само един прозорец", "Just one window")} ({windowCount}) ▾
            </button>
          )}

          {showWindows && groups.apps.length > 0 && (
            <>
              <div className="screen-picker-section">🎮 {tr("Програми и игри (само прозорецът)", "Apps and games (just the window)")}</div>
              <div className="screen-picker-grid">{groups.apps.map((s) => card(s))}</div>
            </>
          )}
          {showWindows && groups.browser.length > 0 && (
            <>
              <div className="screen-picker-section">🌐 {tr("Браузър", "Browser")}</div>
              <div className="screen-picker-grid">{groups.browser.map((s) => card(s))}</div>
            </>
          )}
        </div>

        {windowChosen && !BROWSER_TITLE.test(chosen.name) && groups.screens.length > 0 && (
          <div className="screen-picker-warning">
            ⚠ {tr("За игра е по-добре", "For a game,")} <b>{tr("Цял екран", "Entire screen")}</b>{" "}
            {tr("е по-добре: стриймът на отделен прозорец слага жълта рамка и може да накъса играта.", "is better: streaming a single window adds a yellow border and can make the game stutter.")}{" "}
            <a onClick={() => setSelected(groups.screens[0].id)}>{tr("Избери Цял екран", "Pick Entire screen")}</a>
          </div>
        )}

        <div className="screen-picker-footer">
          <span className="screen-picker-hint">
            {windowChosen ? tr("Другите виждат само този прозорец. ", "Others only see this window. ") : chosen ? tr("Другите виждат целия екран. ", "Others see the whole screen. ") : ""}
            {tr("Звукът се споделя винаги.", "Sound is always shared.")}
          </span>
          <button className="modal-join-button screen-picker-go" disabled={!selected} onClick={() => start(selected)}>
            <span className="hud-live-dot" /> {tr("Започни стрийм", "Go Live")}
          </button>
        </div>
      </div>
    </div>
  );
}
