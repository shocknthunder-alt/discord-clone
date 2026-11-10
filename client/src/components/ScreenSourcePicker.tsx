import { useEffect, useState } from "react";
import { closeScreenPicker, useScreenPickerStore } from "../store/screenPickerStore";
import { useEscapeKey } from "../hooks/useEscapeKey";

/** Desktop-app-only picker: choose a whole screen or a single window (e.g. a game) to share. */
export default function ScreenSourcePicker() {
  const open = useScreenPickerStore((s) => s.open);
  return open ? <PickerDialog /> : null;
}

function PickerDialog() {
  useEscapeKey(() => closeScreenPicker(null));
  const [sources, setSources] = useState<DesktopScreenSource[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [audio, setAudio] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.shmirkaDesktop
      ?.getScreenSources()
      .then((list) => {
        if (cancelled) return;
        setSources(list);
        setSelected(list.find((s) => s.isScreen)?.id ?? list[0]?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setSources([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const screens = sources?.filter((s) => s.isScreen) ?? [];
  const windows = sources?.filter((s) => !s.isScreen) ?? [];

  function renderGroup(title: string, list: DesktopScreenSource[]) {
    if (list.length === 0) return null;
    return (
      <>
        <div className="modal-label">{title}</div>
        <div className="screen-picker-grid">
          {list.map((src) => (
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
      </>
    );
  }

  return (
    <div className="modal-overlay" onClick={() => closeScreenPicker(null)}>
      <div className="modal-card screen-picker-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-back" onClick={() => closeScreenPicker(null)} aria-label="Затвори">
          ✕
        </button>
        <h1 className="modal-title">Сподели екран или прозорец</h1>

        {sources === null && <p className="modal-subtitle">Зареждане…</p>}
        {sources?.length === 0 && <p className="modal-subtitle">Не са намерени екрани или прозорци.</p>}
        {renderGroup("Екрани", screens)}
        {renderGroup("Прозорци", windows)}

        <label className="screen-picker-audio">
          <input type="checkbox" checked={audio} onChange={(e) => setAudio(e.target.checked)} />
          Сподели и звука на компютъра
        </label>
        <p className="modal-subtitle screen-picker-hint">
          Внимание: това включва всичко, което чуваш, и гласовете от канала, така че другите може да чуят себе си с
          ехо. Най-добре е със слушалки и само когато трябва.
        </p>

        <button
          className="modal-join-button"
          disabled={!selected}
          onClick={() => selected && closeScreenPicker({ id: selected, audio })}
        >
          Сподели
        </button>
      </div>
    </div>
  );
}
