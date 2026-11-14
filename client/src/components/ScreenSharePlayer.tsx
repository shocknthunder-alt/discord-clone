import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

interface Props {
  stream: MediaStream;
  /** Own-stream preview: never play its sound back (echo), no volume control. */
  preview?: boolean;
}

const VOLUME_KEY = "streamVolume";
const MUTED_KEY = "streamMuted";

function loadVolume(): number {
  const raw = Number(localStorage.getItem(VOLUME_KEY));
  return Number.isFinite(raw) && localStorage.getItem(VOLUME_KEY) !== null ? Math.min(Math.max(raw, 0), 100) : 50;
}

const ScreenSharePlayer = forwardRef<HTMLVideoElement, Props>(function ScreenSharePlayer({ stream, preview = false }, forwardedRef) {
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
    if (preview) {
      ref.current.muted = true;
      return;
    }
    ref.current.volume = volume / 100;
    ref.current.muted = muted;
    localStorage.setItem(VOLUME_KEY, String(volume));
    localStorage.setItem(MUTED_KEY, muted ? "1" : "0");
  }, [volume, muted, preview]);

  // Fullscreen the wrapper (not the bare <video>) so the volume control stays usable.
  function toggleFullscreen() {
    if (!wrapRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      wrapRef.current.requestFullscreen();
    }
  }

  const [poppedOut, setPoppedOut] = useState(false);
  const pipWindowRef = useRef<Window | null>(null);

  // Close our pop-out window when this player goes away (stopped watching, left the call).
  useEffect(() => () => pipWindowRef.current?.close(), []);
  // Keep the pop-out showing the current stream object.
  useEffect(() => {
    const v = pipWindowRef.current?.document.querySelector("video");
    if (v) v.srcObject = stream;
  }, [stream]);

  /**
   * Pop the stream out into its own always-on-top window that can be moved and resized anywhere
   * (also over a game). Chromium's Document Picture-in-Picture when available (our own page, so
   * double-click = fullscreen works); otherwise the plain video Picture-in-Picture.
   */
  async function popOut() {
    if (pipWindowRef.current) {
      pipWindowRef.current.close();
      return;
    }
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture().catch(() => {});
      return;
    }
    const dpip = (window as unknown as { documentPictureInPicture?: { requestWindow(o: { width: number; height: number }): Promise<Window> } })
      .documentPictureInPicture;
    if (dpip) {
      try {
        const settings = stream.getVideoTracks()[0]?.getSettings();
        const ratio = settings?.width && settings?.height ? settings.width / settings.height : 16 / 9;
        const width = Math.min(960, Math.round(window.screen.availWidth * 0.5));
        const pip = await dpip.requestWindow({ width, height: Math.round(width / ratio) });
        const doc = pip.document;
        doc.title = "ШмиркаТа — стрийм";
        doc.body.style.cssText = "margin:0;background:#000;overflow:hidden;";
        const v = doc.createElement("video");
        v.autoplay = true;
        v.playsInline = true;
        v.muted = true; // the sound keeps playing from the main window (its volume control)
        v.style.cssText = "width:100vw;height:100vh;object-fit:contain;display:block;background:#000;cursor:pointer;";
        v.title = "Двоен клик = цял екран";
        v.srcObject = stream;
        v.ondblclick = () => {
          if (doc.fullscreenElement) void doc.exitFullscreen();
          else void v.requestFullscreen();
        };
        doc.body.append(v);
        void v.play().catch(() => {});
        pipWindowRef.current = pip;
        setPoppedOut(true);
        pip.addEventListener("pagehide", () => {
          pipWindowRef.current = null;
          setPoppedOut(false);
        });
        return;
      } catch (err) {
        console.warn("document picture-in-picture failed, using video PiP", err);
      }
    }
    const v = ref.current;
    if (!v || !document.pictureInPictureEnabled) return;
    try {
      await v.requestPictureInPicture();
      setPoppedOut(true);
      v.addEventListener("leavepictureinpicture", () => setPoppedOut(false), { once: true });
    } catch (err) {
      console.warn("picture-in-picture failed", err);
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
        muted={preview}
        onClick={toggleFullscreen}
        title="Click to toggle fullscreen"
      />
      {!preview && (
        <button
          className={`stream-popout ${poppedOut ? "on" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            void popOut();
          }}
          title={poppedOut ? "Върни стрийма тук" : "Изкарай стрийма в отделен прозорец (мести се и се оразмерява, стои над другите)"}
        >
          {poppedOut ? "⧉ Върни" : "⧉ Изкарай"}
        </button>
      )}
      {poppedOut && <div className="stream-popped-note">Стриймът е в отделен прозорец</div>}
      {!preview && (
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
