import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { canPopOutWindows, closePopout, popOutStream, usePopoutStore } from "../webrtc/streamPopouts";
import { cancelControl, requestControl, sendControlInput, useControlStore } from "../webrtc/remoteControl";

interface Props {
  stream: MediaStream;
  /** Own-stream preview: never play its sound back (echo), no volume control. */
  preview?: boolean;
  /** Someone else's stream: enables "pop out" (key = their socket id, nameKey = user id, title = name). */
  popout?: { key: string; nameKey: string; title: string };
}

const VOLUME_KEY = "streamVolume";
const MUTED_KEY = "streamMuted";

function loadVolume(): number {
  const raw = Number(localStorage.getItem(VOLUME_KEY));
  return Number.isFinite(raw) && localStorage.getItem(VOLUME_KEY) !== null ? Math.min(Math.max(raw, 0), 100) : 50;
}

const ScreenSharePlayer = forwardRef<HTMLVideoElement, Props>(function ScreenSharePlayer({ stream, preview = false, popout }, forwardedRef) {
  const ref = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(forwardedRef, () => ref.current as HTMLVideoElement, []);
  const [volume, setVolume] = useState(loadVolume);
  const [muted, setMuted] = useState(() => localStorage.getItem(MUTED_KEY) === "1");
  const hasAudio = stream.getAudioTracks().length > 0;
  // Popped out into its own window (which then plays the sound) — or, on older desktop apps, PiP.
  const inWindow = usePopoutStore((s) => !!popout && s.open.has(popout.key));
  const [inPip, setInPip] = useState(false);
  const poppedOut = inWindow || inPip;
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);

  // The stream's sound plays through this <video>, so its volume IS the stream volume. Quiet while
  // a pop-out window plays it instead.
  useEffect(() => {
    if (!ref.current) return;
    if (preview || inWindow) {
      ref.current.muted = true;
      return;
    }
    ref.current.volume = volume / 100;
    ref.current.muted = muted;
    localStorage.setItem(VOLUME_KEY, String(volume));
    localStorage.setItem(MUTED_KEY, muted ? "1" : "0");
  }, [volume, muted, preview, inWindow]);

  // Fullscreen the wrapper (not the bare <video>) so the volume control stays usable.
  function toggleFullscreen() {
    if (!wrapRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      wrapRef.current.requestFullscreen();
    }
  }

  async function togglePopout() {
    if (!popout) return;
    if (inWindow) {
      closePopout(popout.key);
      return;
    }
    if (inPip) {
      await document.exitPictureInPicture().catch(() => {});
      return;
    }
    if (canPopOutWindows()) {
      const ok = popOutStream(popout.key, popout.nameKey, popout.title);
      setBlocked(!ok);
      return;
    }
    // Desktop app older than 1.5.2: only the browser's single Picture-in-Picture window.
    const v = ref.current;
    if (!v || !document.pictureInPictureEnabled) return;
    try {
      await v.requestPictureInPicture();
      setInPip(true);
      v.addEventListener("leavepictureinpicture", () => setInPip(false), { once: true });
    } catch (err) {
      console.warn("picture-in-picture failed", err);
    }
  }

  const silent = muted || volume === 0;

  // ── Remote control (viewer side): ask the streamer, then drive their PC from this picture ──
  const streamerId = !preview && popout ? popout.nameKey : null;
  const requesting = useControlStore((s) => !!streamerId && s.requesting === streamerId);
  const controlling = useControlStore((s) => !!streamerId && s.controlling === streamerId);
  const busyElsewhere = useControlStore((s) => (!!s.requesting || !!s.controlling) && s.requesting !== streamerId && s.controlling !== streamerId);
  const heldKeys = useRef(new Set<string>());

  /** 0..1 across the actual picture (the <video> letterboxes it with object-fit: contain). */
  function norm(e: React.MouseEvent): { x: number; y: number } | null {
    const v = ref.current;
    if (!v || !v.videoWidth || !v.videoHeight) return null;
    const r = v.getBoundingClientRect();
    const scale = Math.min(r.width / v.videoWidth, r.height / v.videoHeight);
    const w = v.videoWidth * scale;
    const h = v.videoHeight * scale;
    const x = (e.clientX - r.left - (r.width - w) / 2) / w;
    const y = (e.clientY - r.top - (r.height - h) / 2) / h;
    return { x: Math.min(Math.max(x, 0), 1), y: Math.min(Math.max(y, 0), 1) };
  }
  const buttonOf = (b: number): 0 | 1 | 2 | null => (b === 0 || b === 1 || b === 2 ? b : null);
  function releaseKeys() {
    for (const code of heldKeys.current) sendControlInput({ t: "keyup", code });
    heldKeys.current.clear();
  }
  useEffect(() => {
    if (!controlling) heldKeys.current.clear();
  }, [controlling]);

  return (
    <div className="screen-share-wrap" ref={wrapRef}>
      <video
        className="screen-share-video"
        ref={ref}
        autoPlay
        playsInline
        muted={preview}
        onClick={toggleFullscreen}
        title="Click to toggle fullscreen"
      />
      {popout && (
        <button
          className={`stream-popout ${poppedOut ? "on" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            void togglePopout();
          }}
          title={
            poppedOut
              ? "Върни стрийма тук"
              : "Изкарай стрийма в отделен прозорец — мести го на друг монитор и го оразмерявай; може за няколко стрийма едновременно"
          }
        >
          {poppedOut ? "⧉ Върни" : "⧉ Изкарай"}
        </button>
      )}
      {controlling && !poppedOut && (
        <div
          className="rc-capture"
          tabIndex={0}
          title="Управляваш — мишката и клавиатурата отиват при стриймъра"
          onMouseMove={(e) => {
            const p = norm(e);
            if (p) sendControlInput({ t: "move", ...p });
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.currentTarget.focus();
            const p = norm(e);
            const b = buttonOf(e.button);
            if (p && b !== null) sendControlInput({ t: "down", b, ...p });
          }}
          onMouseUp={(e) => {
            const p = norm(e);
            const b = buttonOf(e.button);
            if (p && b !== null) sendControlInput({ t: "up", b, ...p });
          }}
          onContextMenu={(e) => e.preventDefault()}
          onWheel={(e) => {
            const dy = Math.sign(e.deltaY) * Math.max(1, Math.round(Math.abs(e.deltaY) / 100));
            const dx = Math.sign(e.deltaX) * Math.max(1, Math.round(Math.abs(e.deltaX) / 100));
            sendControlInput({ t: "wheel", dx: e.deltaX ? dx : 0, dy: e.deltaY ? dy : 0 });
          }}
          onKeyDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            heldKeys.current.add(e.code);
            sendControlInput({ t: "keydown", code: e.code });
          }}
          onKeyUp={(e) => {
            e.preventDefault();
            e.stopPropagation();
            heldKeys.current.delete(e.code);
            sendControlInput({ t: "keyup", code: e.code });
          }}
          onBlur={releaseKeys}
        />
      )}
      {streamerId && !poppedOut && (
        <button
          className={`stream-control-btn ${controlling ? "on" : ""} ${requesting ? "waiting" : ""}`}
          disabled={busyElsewhere}
          onClick={(e) => {
            e.stopPropagation();
            if (controlling || requesting) {
              releaseKeys();
              cancelControl();
            } else requestControl(streamerId);
          }}
          title={
            controlling
              ? "Спри да управляваш"
              : requesting
                ? "Чакаме стриймъра да разреши — цъкни, за да се откажеш"
                : "Поискай да управляваш компютъра на стриймъра (той трябва да разреши; само от десктоп приложението)"
          }
        >
          {controlling ? "✋ Спри контрола" : requesting ? "⏳ Чакам…" : "🖱 Поискай контрол"}
        </button>
      )}
      {poppedOut && <div className="stream-popped-note">Стриймът е в отделен прозорец</div>}
      {blocked && !poppedOut && <div className="stream-popped-note">Браузърът спря изскачащия прозорец — разреши pop-ups за сайта</div>}
      {!preview && !inWindow && (
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
      )}
    </div>
  );
});

export default ScreenSharePlayer;
