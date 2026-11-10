import { useEffect, useState } from "react";
import { initMusicPlayerEngine, setMusicLocallyMuted, setMusicVolume, unlockMusicAudio } from "../music/musicPlayerEngine";
import { useMusicStore } from "../store/musicStore";
import { useVoiceStore } from "../store/voiceStore";
import { useVoiceChannel } from "../webrtc/useVoiceChannel";

const ADD_ERROR_MESSAGES: Record<string, string> = {
  "invalid-url": "Not a YouTube link — paste a link, or type a song name to search.",
  "lookup-failed": "Couldn't look that video up — it may be private, age-restricted, or removed.",
  "not-found": "No results found for that search.",
  "search-unavailable": "Searching by name needs a YouTube API key that isn't set up yet — paste a link instead.",
};

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
  const [muted, setMuted] = useState(false);
  const [input, setInput] = useState("");
  // Starts low (and is remembered once changed): a new joiner used to be blasted by the music.
  const [volume, setVolume] = useState(() => {
    try {
      const saved = Number(localStorage.getItem("musicVolume"));
      return localStorage.getItem("musicVolume") !== null && Number.isFinite(saved) ? Math.min(Math.max(saved, 0), 100) : 15;
    } catch {
      return 15;
    }
  });

  useEffect(() => {
    initMusicPlayerEngine();
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
          <div className="music-mini-title">Join a voice channel to listen together</div>
        </div>
      </div>
    );
  }

  const currentItem =
    musicState && musicState.currentIndex < musicState.queue.length ? musicState.queue[musicState.currentIndex] : null;

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    unlockMusicAudio();
    if (!input.trim()) return;
    addMusic(input.trim());
    setInput("");
  }

  return (
    <div className="music-mini">
      <div className="music-mini-row">
        <button
          className="music-mini-toggle"
          onClick={toggleExpanded}
          title={expanded ? "Collapse the player" : "Expand the player"}
        >
          🎵
        </button>
        <div className="music-mini-title" title={currentItem?.title ?? ""}>
          {currentItem ? currentItem.title : "No music playing"}
        </div>
        <button
          className="music-mini-control"
          onClick={() => {
            setMuted(!muted);
            setMusicLocallyMuted(!muted);
          }}
          title={muted ? "Unmute music (only for you)" : "Mute music (only for you)"}
        >
          {muted ? "🔇" : "🔊"}
        </button>
        <button
          className="music-mini-control"
          onClick={() => {
            unlockMusicAudio();
            if (musicState?.isPlaying) pauseMusic();
            else playMusic();
          }}
          disabled={!currentItem}
          title={musicState?.isPlaying ? "Pause" : "Play"}
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
          title="Skip"
        >
          ⏭
        </button>
        <button
          className="music-mini-control music-mini-collapse"
          onClick={toggleExpanded}
          title={expanded ? "Collapse the player" : "Expand the player"}
          aria-label={expanded ? "Collapse the player" : "Expand the player"}
        >
          {expanded ? "▾" : "▸"}
        </button>
      </div>

      {audioLocked && (
        <button className="music-enable-sound" onClick={unlockMusicAudio}>
          🔇 Click to enable sound
        </button>
      )}

      {expanded && (
        <div className="music-mini-expanded">
          {addError && <p className="music-add-error">{ADD_ERROR_MESSAGES[addError] ?? "Couldn't add that."}</p>}

          <form className="music-add-form" onSubmit={handleAdd}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste a link or type a song name…"
            />
            <button type="submit" disabled={!input.trim()}>
              Add
            </button>
          </form>

          <div className="music-mini-volume-row">
            <span>🔊</span>
            <input type="range" min={0} max={100} value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
          </div>

          {musicState && musicState.queue.length > 0 && (
            <div className="music-queue">
              {musicState.queue.map((item, i) => (
                <div key={item.id} className={`music-queue-item ${i === musicState.currentIndex ? "active" : ""}`}>
                  <span className="music-queue-title">{item.title}</span>
                  <span className="music-queue-meta">added by {item.addedByUsername}</span>
                  <button onClick={() => removeMusic(item.id)} aria-label="Remove">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
