import { useEffect, useState } from "react";
import { useVoiceStore } from "../store/voiceStore";
import { useVoiceChannel } from "../webrtc/useVoiceChannel";

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Unmissable "you are live" indicator for the person streaming: a pulsing red pill at the top
 * of the window (with a running timer and a Stop button), a red glow around the window edge,
 * and a "LIVE" marker in the browser tab title — so it's obvious even when the app is in the
 * background or you're looking at the game you're sharing.
 */
export default function LiveBanner() {
  const isScreenSharing = useVoiceStore((s) => s.isScreenSharing);
  const isCameraOn = useVoiceStore((s) => s.isCameraOn);
  const startedAt = useVoiceStore((s) => s.screenShareStartedAt);
  const { toggleScreenShare, toggleCamera } = useVoiceChannel();
  const [now, setNow] = useState(Date.now());
  const live = isScreenSharing || isCameraOn;

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);

  useEffect(() => {
    if (!live) return;
    const original = document.title;
    document.title = `🔴 LIVE · ${original}`;
    return () => {
      document.title = original;
    };
  }, [live]);

  if (!live) return null;

  return (
    <>
      <div className="live-edge" aria-hidden />
      <div className="live-banner" role="status">
        <span className="live-dot" />
        <strong>LIVE</strong>
        <span className="live-text">
          {isScreenSharing ? "Стриймваш екрана си" : "Камерата ти е включена"}
          {isScreenSharing && startedAt ? ` · ${formatElapsed(now - startedAt)}` : ""}
          {isScreenSharing && isCameraOn ? " · + камера" : ""}
        </span>
        <button className="live-stop" onClick={() => (isScreenSharing ? void toggleScreenShare() : void toggleCamera())}>
          {isScreenSharing ? "Спри стрийма" : "Изключи"}
        </button>
      </div>
    </>
  );
}
