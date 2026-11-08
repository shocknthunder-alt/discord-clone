import { useEffect, useRef, useState } from "react";
import { useMusicStore } from "../store/musicStore";
import { loadYouTubeIframeApi, YT } from "../utils/youtubePlayerApi";
import { useVoiceChannel } from "../webrtc/useVoiceChannel";

// How far the local player's actual position may drift from the server-extrapolated
// expected position before we force a correction — small drift is inaudible/invisible and
// constantly re-seeking would itself be jarring, so this is deliberately loose.
const RESYNC_THRESHOLD_SECONDS = 2.5;
const RESYNC_INTERVAL_MS = 4000;

function extrapolatedPosition(state: { positionSeconds: number; isPlaying: boolean; updatedAt: number }): number {
  if (!state.isPlaying) return state.positionSeconds;
  return state.positionSeconds + (Date.now() - state.updatedAt) / 1000;
}

export default function MusicPanel() {
  const musicState = useMusicStore((s) => s.state);
  const { addMusic, removeMusic, playMusic, pauseMusic, skipMusic, seekMusic } = useVoiceChannel();
  const [urlInput, setUrlInput] = useState("");
  const [volume, setVolume] = useState(70);
  const [collapsed, setCollapsed] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const loadedVideoIdRef = useRef<string | null>(null);

  const currentItem = musicState && musicState.currentIndex < musicState.queue.length ? musicState.queue[musicState.currentIndex] : null;

  // Player lifecycle: create once when a video first needs to play, destroy on unmount.
  useEffect(() => {
    let cancelled = false;
    let player: YT.Player | null = null;

    loadYouTubeIframeApi().then((YTApi) => {
      if (cancelled || !containerRef.current) return;
      player = new YTApi.Player(containerRef.current, {
        playerVars: { playsinline: 1 },
        events: {
          onReady: () => {
            player?.setVolume(volume);
          },
        },
      });
      playerRef.current = player;
    });

    return () => {
      cancelled = true;
      player?.destroy();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drives the player from server state: load a new video (seeking to the extrapolated
  // live position so latecomers join mid-song in the right place), or just flip
  // play/pause if the video itself hasn't changed.
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !musicState) return;

    if (!currentItem) {
      loadedVideoIdRef.current = null;
      return;
    }

    const expected = extrapolatedPosition(musicState);

    if (loadedVideoIdRef.current !== currentItem.videoId) {
      loadedVideoIdRef.current = currentItem.videoId;
      player.loadVideoById(currentItem.videoId, Math.max(0, expected));
      if (!musicState.isPlaying) {
        // loadVideoById always starts playing — pause right back if the server says paused
        // (e.g. a video someone queued while playback was paused).
        setTimeout(() => player.pauseVideo(), 300);
      }
      return;
    }

    if (musicState.isPlaying) player.playVideo();
    else player.pauseVideo();
  }, [musicState?.currentIndex, musicState?.isPlaying, currentItem?.videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Periodic drift correction — network latency and the extrapolation itself both
  // accumulate small errors over a long playback that a one-time seek on state change
  // wouldn't catch.
  useEffect(() => {
    if (!musicState?.isPlaying) return;
    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player || !musicState) return;
      const expected = extrapolatedPosition(musicState);
      const actual = player.getCurrentTime();
      if (Math.abs(actual - expected) > RESYNC_THRESHOLD_SECONDS) {
        player.seekTo(expected, true);
      }
    }, RESYNC_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [musicState]);

  useEffect(() => {
    playerRef.current?.setVolume(volume);
  }, [volume]);

  function handleAddUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!urlInput.trim()) return;
    addMusic(urlInput.trim());
    setUrlInput("");
  }

  return (
    <div className="music-panel">
      <div className="music-panel-header" onClick={() => setCollapsed((v) => !v)}>
        <span>🎵 Music</span>
        <span className="music-panel-toggle">{collapsed ? "▸" : "▾"}</span>
      </div>

      {!collapsed && (
        <>
          <div className="music-player-wrap" style={{ display: currentItem ? "block" : "none" }}>
            <div ref={containerRef} />
          </div>

          {currentItem ? (
            <div className="music-now-playing">
              <div className="music-now-playing-title">{currentItem.title}</div>
              <div className="music-controls">
                <button onClick={musicState?.isPlaying ? pauseMusic : playMusic}>
                  {musicState?.isPlaying ? "⏸" : "▶"}
                </button>
                <button onClick={skipMusic} title="Skip">
                  ⏭
                </button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  title="Music volume"
                />
              </div>
            </div>
          ) : (
            <p className="modal-hint">Nothing playing — paste a YouTube link below.</p>
          )}

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

          <form className="music-add-form" onSubmit={handleAddUrl}>
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Paste a YouTube link…"
            />
            <button type="submit" disabled={!urlInput.trim()}>
              Add
            </button>
          </form>
        </>
      )}
    </div>
  );
}
