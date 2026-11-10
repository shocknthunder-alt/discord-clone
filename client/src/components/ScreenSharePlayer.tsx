import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

interface Props {
  stream: MediaStream;
}

const VOLUME_KEY = "streamVolume";
const MUTED_KEY = "streamMuted";

function loadVolume(): number {
  const raw = Number(localStorage.getItem(VOLUME_KEY));
  return Number.isFinite(raw) && localStorage.getItem(VOLUME_KEY) !== null ? Math.min(Math.max(raw, 0), 100) : 50;
}

const ScreenSharePlayer = forwardRef<HTMLVideoElement, Props>(function ScreenSharePlayer({ stream }, forwardedRef) {
  const ref = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(forwardedRef, () => ref.current as HTMLVideoElement, []);
  const [volume, setVolume] = useState(loadVolume);
  const [muted, setMuted] = useState(() => localStorage.getItem(MUTED_KEY) === "1");
  const hasAudio = stream.getAudioTracks().length > 0;

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);

  // The stream's sound plays through this <video>, so its volume IS the stream volume.
  useEffect(() => {
    if (!ref.current) return;
    ref.current.volume = volume / 100;
    ref.current.muted = muted;
    localStorage.setItem(VOLUME_KEY, String(volume));
    localStorage.setItem(MUTED_KEY, muted ? "1" : "0");
  }, [volume, muted]);

  // Fullscreen the wrapper (not the bare <video>) so the volume control stays usable.
  function toggleFullscreen() {
    if (!wrapRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      wrapRef.current.requestFullscreen();
    }
  }

  const silent = muted || volume === 0;

  return (
    <div className="screen-share-wrap" ref={wrapRef}>
      <video
        className="screen-share-video"
        ref={ref}
        autoPlay
        playsInline
        onClick={toggleFullscreen}
        title="Click to toggle fullscreen"
      />
      <div className="stream-volume" onClick={(e) => e.stopPropagation()}>
        <button
          className="stream-volume-button"
          onClick={() => {
            if (silent && volume === 0) setVolume(50);
            setMuted(!silent);
          }}
          title={silent ? "Включи звука" : "Заглуши стрийма"}
        >
          {silent ? "🔇" : volume < 50 ? "🔉" : "🔊"}
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={muted ? 0 : volume}
          onChange={(e) => {
            setVolume(Number(e.target.value));
            setMuted(false);
          }}
          aria-label="Сила на звука на стрийма"
        />
        {!hasAudio && <span className="stream-volume-note">няма звук</span>}
      </div>
    </div>
  );
});

export default ScreenSharePlayer;
