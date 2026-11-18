import { useEffect, useState } from "react";
import { initMusicPlayerEngine, setMusicLocallyMuted, setMusicVolume, unlockMusicAudio } from "../music/musicPlayerEngine";
import { useMusicStore } from "../store/musicStore";
import { addSubsonicToQueue, searchSubsonic, subsonicAvailable } from "../api/music.api";
import SubsonicSearchModal from "./SubsonicSearchModal";
import { useVoiceStore } from "../store/voiceStore";
import { useVoiceChannel } from "../webrtc/useVoiceChannel";
import { getSocket } from "../socket/socket";
import { SocketEvents } from "@discord-clone/shared";
import { tr } from "../i18n";
import { useMusicVideoStore } from "./MusicVideoWindow";
import MusicProgress from "./MusicProgress";

/** New listeners start quiet — music under a voice call should never drown the voices. */
const MUSIC_DEFAULT_VOLUME = 10;

const ADD_ERROR_MESSAGES: Record<string, [string, string]> = {
  "invalid-url": ["Това не е YouTube линк — постави линк от YouTube или напиши името на песента.", "That's not a YouTube link — paste a YouTube link or type the song name."],
  "lookup-failed": ["Не мога да отворя това видео — може да е частно, с възрастово ограничение или изтрито.", "Can't open that video — it may be private, age-restricted or removed."],
  "not-found": ["Не намерих такава песен нито в yogurthub, нито в YouTube — опитай с изпълнителя или виж 🎧 търсачката.", "Couldn't find that song on yogurthub or YouTube — try with the artist or use the 🎧 browser."],
  "search-unavailable": ["Няма я в yogurthub, а търсенето в YouTube не е настроено на сървъра — постави YouTube линк.", "Not on yogurthub, and YouTube search isn't set up on the server — paste a YouTube link."],
  "playlist-unavailable": ["Този плейлист не може да се прочете — може да е частен или празен.", "That playlist can't be read — it may be private or empty."],
  "playlist-needs-key": ["За плейлисти трябва YouTube API ключ на сървъра — пусни отделни песни засега.", "Playlists need a YouTube API key on the server — add single songs for now."],
  "subsonic-unavailable": ["Музиката от yogurthub не е настроена на сървъра.", "yogurthub music isn't set up on the server."],
  "no-links": ["Линкове вече не се приемат — напиши името на песента.", "Links aren't accepted — type the song name."],
  "subsonic-failed": ["yogurthub не отговори — опитай пак след малко.", "yogurthub didn't answer — try again in a moment."],
};

/** Queue items are stored as "Artist — Song" (yogurthub); show the song first, the artist under it. */
function splitTitle(title: string): { song: string; artist: string | null } {
  const at = title.indexOf(" — ");
  if (at <= 0) return { song: title, artist: null };
  return { song: title.slice(at + 3), artist: title.slice(0, at) };
}

function playItemNow(itemId: string) {
  const voiceChannelId = useVoiceStore.getState().activeVoiceChannelId;
  if (voiceChannelId) getSocket()?.emit(SocketEvents.MusicPlayItem, { voiceChannelId, itemId });
}

function moveMusic(itemId: string, toIndex: number) {
  const voiceChannelId = useVoiceStore.getState().activeVoiceChannelId;
  if (voiceChannelId) getSocket()?.emit(SocketEvents.MusicMove, { voiceChannelId, itemId, toIndex });
}

export default function MusicMiniPlayer() {
  const activeVoiceChannelId = useVoiceStore((s) => s.activeVoiceChannelId);
  const musicState = useMusicStore((s) => s.state);
  const addError = useMusicStore((s) => s.addError);
  const audioLocked = useMusicStore((s) => s.audioLocked);
  const setAddError = useMusicStore((s) => s.setAddError);
  const { addMusic, removeMusic, playMusic, pauseMusic, skipMusic } = useVoiceChannel();
  // Open by default; the choice is remembered per browser.
  const [expanded, setExpanded] = useState(() => {
    try {
      return localStorage.getItem("musicPlayerExpanded") !== "false";
    } catch {
      return true;
    }
  });
  const videoOpen = useMusicVideoStore((s) => s.open);
  const toggleVideo = useMusicVideoStore((s) => s.toggle);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [dropAfter, setDropAfter] = useState(false);
  const [muted, setMuted] = useState(false);
  const [input, setInput] = useState("");
  // Starts low (and is remembered once changed): a new joiner used to be blasted by the music.
  const [volume, setVolume] = useState(() => {
    try {
      const raw = localStorage.getItem("musicVolume");
      const saved = Number(raw);
      // The old default (15) got saved for everyone on first load — it wasn't a choice, so it
      // moves to the new default (10). Any other saved value is kept.
      if (localStorage.getItem("musicVolumeV2") === null) {
        localStorage.setItem("musicVolumeV2", "1");
        if (raw === "15") return MUSIC_DEFAULT_VOLUME;
      }
      return raw !== null && Number.isFinite(saved) ? Math.min(Math.max(saved, 0), 100) : MUSIC_DEFAULT_VOLUME;
    } catch {
      return MUSIC_DEFAULT_VOLUME;
    }
  });

  useEffect(() => {
    initMusicPlayerEngine();
  }, []);

  // 🎧 yogurthub search — only when the server has it set up.
  const [subsonic, setSubsonic] = useState(false);
  const [showSubsonic, setShowSubsonic] = useState(false);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    void subsonicAvailable().then(setSubsonic);
  }, []);

  function toggleExpanded() {
    setExpanded((v) => {
      try {
        localStorage.setItem("musicPlayerExpanded", String(!v));
      } catch {
        // private mode etc. — the toggle still works for this session
      }
      return !v;
    });
  }

  useEffect(() => {
    setMusicVolume(volume);
    try {
      localStorage.setItem("musicVolume", String(volume));
    } catch {
      // not fatal
    }
  }, [volume]);

  useEffect(() => {
    if (addError) {
      const timeout = setTimeout(() => setAddError(null), 5000);
      return () => clearTimeout(timeout);
    }
  }, [addError, setAddError]);

  // Music is synced per voice channel, so there's nothing to control until you're in one —
  // but hiding the player entirely left new users with no sign it exists at all.
  if (!activeVoiceChannelId) {
    return (
      <div className="music-mini">
        <div className="music-mini-row">
          <span className="music-mini-toggle">🎵</span>
          <div className="music-mini-title">{tr("Влез в гласов канал, за да слушате заедно", "Join a voice channel to listen together")}</div>
        </div>
      </div>
    );
  }

  const currentItem =
    musicState && musicState.currentIndex < musicState.queue.length ? musicState.queue[musicState.currentIndex] : null;

  const { song: nowSong, artist: nowArtist } = currentItem ? splitTitle(currentItem.title) : { song: "", artist: null };

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    unlockMusicAudio();
    const text = input.trim();
    if (!text || searching) return;
    // yogurthub first: the best match for the typed name is queued and plays. YouTube is the
    // backup — when yogurthub has nothing (or doesn't answer), and for pasted YouTube links.
    setAddError(null);
    if (/^https?:\/\//i.test(text)) {
      addMusic(text); // YouTube link (anything else is rejected there)
      setInput("");
      return;
    }
    if (!subsonic) {
      addMusic(text);
      setInput("");
      return;
    }
    setSearching(true);
    try {
      const { songs } = await searchSubsonic(text);
      if (songs.length > 0) addSubsonicToQueue([songs[0]]);
      else addMusic(text); // not on yogurthub → YouTube search
      setInput("");
    } catch {
      addMusic(text); // yogurthub down → YouTube
      setInput("");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="music-mini">
      <div className="music-now">
        {currentItem?.thumbnailUrl ? (
          <img className="music-now-cover" src={currentItem.thumbnailUrl} alt="" onClick={toggleExpanded} />
        ) : (
          <button className="music-now-cover music-now-cover-empty" onClick={toggleExpanded} title={expanded ? tr("Свий плейъра", "Collapse the player") : tr("Разгъни плейъра", "Expand the player")}>
            🎵
          </button>
        )}
        <div className="music-now-text" title={currentItem?.title ?? ""}>
          {currentItem ? (
            <>
              <span className="music-now-song">{nowSong}</span>
              {nowArtist && <span className="music-now-artist">{nowArtist}</span>}
            </>
          ) : (
            <span className="music-now-idle">{tr("Не свири музика", "No music playing")}</span>
          )}
        </div>
        <button className="music-mini-collapse" onClick={toggleExpanded} title={expanded ? tr("Свий плейъра", "Collapse the player") : tr("Разгъни плейъра", "Expand the player")} aria-label={expanded ? tr("Свий плейъра", "Collapse the player") : tr("Разгъни плейъра", "Expand the player")}>
          {expanded ? "▾" : "▸"}
        </button>
      </div>

      <div className="music-controls">
        <button
          className={`music-mini-control ${videoOpen ? "on" : ""}`}
          onClick={() => {
            unlockMusicAudio();
            toggleVideo();
          }}
          title={tr(
            "Гледай видеото заедно — пусни YouTube линк и всеки, който отвори 📺, вижда същия момент",
            "Watch the video together — paste a YouTube link; everyone who opens 📺 sees the same moment",
          )}
        >
          📺
        </button>
        <button
          className="music-mini-control"
          onClick={() => {
            setMuted(!muted);
            setMusicLocallyMuted(!muted);
          }}
          title={muted ? tr("Включи музиката (само за теб)", "Unmute music (only for you)") : tr("Заглуши музиката (само за теб)", "Mute music (only for you)")}
        >
          {muted ? "🔇" : "🔊"}
        </button>
        <button
          className="music-mini-control music-mini-play"
          onClick={() => {
            unlockMusicAudio();
            if (musicState?.isPlaying) pauseMusic();
            else playMusic();
          }}
          disabled={!currentItem}
          title={musicState?.isPlaying ? tr("Пауза", "Pause") : tr("Пусни", "Play")}
        >
          {musicState?.isPlaying ? "⏸" : "▶"}
        </button>
        <button
          className="music-mini-control"
          onClick={() => {
            unlockMusicAudio();
            skipMusic();
          }}
          disabled={!currentItem}
          title={tr("Следваща", "Skip")}
        >
          ⏭
        </button>
      </div>

      {currentItem && <MusicProgress />}

      {audioLocked && (
        <button className="music-enable-sound" onClick={unlockMusicAudio}>
          🔇 {tr("Цъкни, за да пуснеш звука", "Click to enable sound")}
        </button>
      )}

      {expanded && (
        <div className="music-mini-expanded">
          {addError && <p className="music-add-error">{ADD_ERROR_MESSAGES[addError] ? tr(...ADD_ERROR_MESSAGES[addError]!) : tr("Не стана.", "Couldn't add that.")}</p>}

          <form className="music-add-form" onSubmit={(e) => void handleAdd(e)}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={tr("🔎 Напиши песен тук…", "🔎 Type a song here…")}
              title={tr("Напиши име на песен или изпълнител (или постави YouTube линк) и натисни Enter", "Type a song or artist name (or paste a YouTube link) and press Enter")}
            />
            <button type="submit" disabled={!input.trim() || searching}>
              {searching ? "…" : tr("Пусни", "Play")}
            </button>
          </form>
          {subsonic && (
            <button className="music-subsonic-open" onClick={() => setShowSubsonic(true)} title={tr("Търси в yogurthub (библиотеката + Tidal)", "Search yogurthub (library + Tidal)")}>
              🎧 {tr("Разгледай — албуми, плейлисти, друга версия", "Browse — albums, playlists, another version")}
            </button>
          )}
          {showSubsonic && <SubsonicSearchModal onClose={() => setShowSubsonic(false)} />}

          <div className="music-mini-volume-row">
            <span>🔊</span>
            <input type="range" min={0} max={100} value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
          </div>

          {musicState && musicState.queue.length > 0 && (
            <div className="music-queue">
              {musicState.queue.map((item, i) => {
                const { song, artist } = splitTitle(item.title);
                const movable = i > musicState.currentIndex;
                const dropHere = dragId !== null && dropIndex === i && dragId !== item.id;
                return (
                  <div
                    key={item.id}
                    className={`music-queue-item ${i === musicState.currentIndex ? "active" : ""}${movable ? " movable" : ""}${
                      dragId === item.id ? " dragging" : ""
                    }${dropHere ? (dropAfter ? " drop-after" : " drop-before") : ""}`}
                    draggable={movable}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", item.id);
                      setDragId(item.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setDropIndex(null);
                    }}
                    onDragOver={(e) => {
                      if (!dragId || !movable) return;
                      e.preventDefault();
                      const r = e.currentTarget.getBoundingClientRect();
                      setDropIndex(i);
                      setDropAfter(e.clientY > r.top + r.height / 2);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (!dragId || dropIndex === null) return;
                      const from = musicState.queue.findIndex((q) => q.id === dragId);
                      let to = dropIndex + (dropAfter ? 1 : 0);
                      if (from < to) to -= 1;
                      if (from !== -1 && to !== from) moveMusic(dragId, to);
                      setDragId(null);
                      setDropIndex(null);
                    }}
                    title={movable ? tr("Хвани и премести", "Drag to reorder") : undefined}
                  >
                    <span className="music-queue-grip" aria-hidden="true">
                      {i === musicState.currentIndex ? "▶" : "⋮⋮"}
                    </span>
                    <div className="music-queue-text">
                      <span className="music-queue-title" title={item.title}>
                        {song}
                      </span>
                      <span className="music-queue-meta">
                        {item.source !== "subsonic" ? "YouTube · " : ""}
                        {artist ? `${artist} · ` : ""}{tr("от", "by")} {item.addedByUsername}
                      </span>
                    </div>
                    {movable && (
                      <button
                        className="music-queue-play"
                        onClick={() => {
                          unlockMusicAudio();
                          playItemNow(item.id);
                        }}
                        aria-label={tr("Пусни сега", "Play now")}
                        title={tr("Пусни тази песен сега (за всички)", "Play this song now (for everyone)")}
                      >
                        ▶
                      </button>
                    )}
                    <button onClick={() => removeMusic(item.id)} aria-label={tr("Махни", "Remove")} title={tr("Махни от списъка", "Remove from the list")}>
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
