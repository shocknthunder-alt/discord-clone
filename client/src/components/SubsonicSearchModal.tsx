import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addSubsonicToQueue, fetchSubsonicAlbum, searchSubsonic, type SubsonicAlbum, type SubsonicSong } from "../api/music.api";
import { unlockMusicAudio } from "../music/musicPlayerEngine";
import { tr } from "../i18n";

function fmt(sec: number) {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  return `${m}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

/**
 * 🎧 Search the music server (yogurthub — its own library plus Tidal) and queue songs or whole
 * albums for everyone in the voice channel.
 */
export default function SubsonicSearchModal({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [songs, setSongs] = useState<SubsonicSong[]>([]);
  const [albums, setAlbums] = useState<SubsonicAlbum[]>([]);
  const [openAlbum, setOpenAlbum] = useState<{ album: SubsonicAlbum; songs: SubsonicSong[] | null } | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const searchSeq = useRef(0);

  useEffect(() => {
    inputRef.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  async function run(e?: React.FormEvent) {
    e?.preventDefault();
    const query = q.trim();
    if (!query) return;
    const seq = ++searchSeq.current;
    setBusy(true);
    setError(null);
    setOpenAlbum(null);
    try {
      const r = await searchSubsonic(query);
      if (seq !== searchSeq.current) return;
      setSongs(r.songs);
      setAlbums(r.albums);
      if (r.songs.length === 0 && r.albums.length === 0) setError(tr("Нищо не намерих.", "Nothing found."));
    } catch {
      if (seq === searchSeq.current) setError(tr("Музикалният сървър не отговаря. Опитай пак след малко.", "The music server isn't answering. Try again in a moment."));
    } finally {
      if (seq === searchSeq.current) setBusy(false);
    }
  }

  async function showAlbum(album: SubsonicAlbum) {
    setOpenAlbum({ album, songs: null });
    try {
      const list = await fetchSubsonicAlbum(album.id);
      setOpenAlbum((cur) => (cur?.album.id === album.id ? { album, songs: list } : cur));
    } catch {
      setOpenAlbum(null);
      setError(tr("Не успях да отворя албума.", "Couldn't open the album."));
    }
  }

  function addSong(s: SubsonicSong) {
    unlockMusicAudio();
    addSubsonicToQueue([s]);
    setAdded((prev) => new Set(prev).add(s.id));
  }

  async function addAlbum(a: SubsonicAlbum) {
    unlockMusicAudio();
    const key = `album:${a.id}`;
    setAdded((prev) => new Set(prev).add(key));
    try {
      const list = openAlbum?.album.id === a.id && openAlbum.songs ? openAlbum.songs : await fetchSubsonicAlbum(a.id);
      addSubsonicToQueue(list);
    } catch {
      setAdded((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      setError(tr("Не успях да добавя албума.", "Couldn't add the album."));
    }
  }

  const songRow = (s: SubsonicSong) => (
    <div key={s.id} className="subsonic-row">
      {s.coverUrl ? <img src={s.coverUrl} alt="" loading="lazy" /> : <span className="subsonic-cover-ph">🎵</span>}
      <div className="subsonic-text">
        <b>{s.title}</b>
        <small>
          {s.artist}
          {s.album ? ` · ${s.album}` : ""}
        </small>
      </div>
      <span className="subsonic-dur">{fmt(s.durationSeconds)}</span>
      <button className={added.has(s.id) ? "done" : ""} onClick={() => addSong(s)} title={tr("Добави в опашката", "Add to the queue")}>
        {added.has(s.id) ? "✓" : tr("+ Добави", "+ Add")}
      </button>
    </div>
  );

  return createPortal(
    <div className="subsonic-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="subsonic-modal" role="dialog" aria-label={tr("Музика от yogurthub", "Music from yogurthub")}>
        <div className="subsonic-head">
          <h3>🎧 {tr("Музика от yogurthub", "Music from yogurthub")}</h3>
          <button className="subsonic-close" onClick={onClose} aria-label={tr("Затвори", "Close")}>
            ✕
          </button>
        </div>
        <form className="subsonic-search" onSubmit={(e) => void run(e)}>
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Песен, изпълнител или албум…", "Song, artist or album…")} />
          <button type="submit" disabled={!q.trim() || busy}>
            {busy ? tr("Търся…", "Searching…") : tr("Търси", "Search")}
          </button>
        </form>
        <p className="subsonic-note">{tr("Търси в библиотеката и в Tidal. Песен от Tidal може да тръгне след няколко секунди.", "Searches the library and Tidal. A song from Tidal may take a few seconds to start.")}</p>
        {error && <p className="subsonic-error">{error}</p>}

        <div className="subsonic-results">
          {openAlbum ? (
            <>
              <div className="subsonic-album-head">
                <button className="subsonic-back" onClick={() => setOpenAlbum(null)}>
                  ← {tr("Назад", "Back")}
                </button>
                <div className="subsonic-text">
                  <b>{openAlbum.album.name}</b>
                  <small>{openAlbum.album.artist}</small>
                </div>
                <button
                  className={`subsonic-add-all ${added.has(`album:${openAlbum.album.id}`) ? "done" : ""}`}
                  onClick={() => void addAlbum(openAlbum.album)}
                >
                  {added.has(`album:${openAlbum.album.id}`) ? tr("✓ Добавен", "✓ Added") : tr("+ Добави всичко", "+ Add all")}
                </button>
              </div>
              {openAlbum.songs === null ? <p className="subsonic-note">{tr("Зареждам…", "Loading…")}</p> : openAlbum.songs.map(songRow)}
            </>
          ) : (
            <>
              {songs.length > 0 && <div className="subsonic-section">{tr("Песни", "Songs")}</div>}
              {songs.map(songRow)}
              {albums.length > 0 && <div className="subsonic-section">{tr("Албуми и плейлисти", "Albums and playlists")}</div>}
              {albums.map((a) => (
                <div key={a.id} className="subsonic-row album" onClick={() => void showAlbum(a)}>
                  {a.coverUrl ? <img src={a.coverUrl} alt="" loading="lazy" /> : <span className="subsonic-cover-ph">💿</span>}
                  <div className="subsonic-text">
                    <b>{a.name}</b>
                    <small>
                      {a.artist}
                      {a.year ? ` · ${a.year}` : ""} · {a.songCount} {tr("песни", "songs")}
                    </small>
                  </div>
                  <button
                    className={added.has(`album:${a.id}`) ? "done" : ""}
                    onClick={(e) => {
                      e.stopPropagation();
                      void addAlbum(a);
                    }}
                    title={tr("Добави всички песни", "Add all songs")}
                  >
                    {added.has(`album:${a.id}`) ? "✓" : tr("+ Всички", "+ All")}
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
