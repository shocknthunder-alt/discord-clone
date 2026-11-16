import type { GifDTO } from "@discord-clone/shared";
import { useEffect, useRef, useState } from "react";
import { gifsEnabled, searchGifs } from "../api/media.api";
import { tr } from "../i18n";

/** "GIF" button + search popover (GIPHY via our server). Hidden when the server has no key. */
export default function GifPicker({ onPick }: { onPick: (gif: GifDTO) => void }) {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    void gifsEnabled().then(setEnabled);
  }, []);
  if (!enabled) return null;
  return (
    <>
      <button
        type="button"
        className={`gif-toggle-button ${open ? "on" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title={tr("Търси GIF", "Search GIFs")}
      >
        GIF
      </button>
      {open && (
        <GifPopover
          onClose={() => setOpen(false)}
          onPick={(g) => {
            setOpen(false);
            onPick(g);
          }}
        />
      )}
    </>
  );
}

function GifPopover({ onPick, onClose }: { onPick: (gif: GifDTO) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [gifs, setGifs] = useState<GifDTO[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    const id = ++seq.current;
    const t = setTimeout(
      () => {
        setLoading(true);
        setError(false);
        searchGifs(q.trim())
          .then((r) => {
            if (id !== seq.current) return;
            setGifs(r.gifs);
            setNext(r.nextOffset);
          })
          .catch(() => id === seq.current && setError(true))
          .finally(() => id === seq.current && setLoading(false));
      },
      q ? 350 : 0,
    );
    return () => clearTimeout(t);
  }, [q]);

  function more() {
    if (next === null || loading) return;
    const id = seq.current;
    setLoading(true);
    searchGifs(q.trim(), next)
      .then((r) => {
        if (id !== seq.current) return;
        setGifs((g) => [...g, ...r.gifs.filter((x) => !g.some((y) => y.id === x.id))]);
        setNext(r.nextOffset);
      })
      .catch(() => {})
      .finally(() => id === seq.current && setLoading(false));
  }

  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (ref.current?.contains(t) || t.closest(".gif-toggle-button")) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Two columns, each GIF into the shorter one (keeps a tidy masonry without layout jumps).
  const cols: GifDTO[][] = [[], []];
  const heights = [0, 0];
  for (const g of gifs) {
    const c = heights[0] <= heights[1] ? 0 : 1;
    cols[c].push(g);
    heights[c] += g.height / Math.max(1, g.width);
  }

  return (
    <div className="gif-popover" ref={ref}>
      <input
        className="gif-search"
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={tr("🔎 Търси GIF… (празно = популярни)", "🔎 Search GIFs… (empty = trending)")}
      />
      <div
        className="gif-grid"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollTop + el.clientHeight > el.scrollHeight - 200) more();
        }}
      >
        {cols.map((col, ci) => (
          <div key={ci} className="gif-col">
            {col.map((g) => (
              <button key={g.id} type="button" className="gif-item" onClick={() => onPick(g)} title={g.title}>
                <img src={g.preview} alt={g.title} loading="lazy" style={{ aspectRatio: `${g.width} / ${g.height}` }} />
              </button>
            ))}
          </div>
        ))}
        {!loading && !error && gifs.length === 0 && <div className="gif-empty">{tr("Нищо не намерих.", "Nothing found.")}</div>}
        {error && <div className="gif-empty">{tr("Търсенето не сработи.", "Search failed.")}</div>}
      </div>
      <div className="gif-footer">{loading ? tr("Зареждам…", "Loading…") : "Powered by GIPHY"}</div>
    </div>
  );
}
