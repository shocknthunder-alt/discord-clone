import { useState } from "react";
import { useLayoutLockStore } from "../store/layoutLockStore";
import { useVoiceStore } from "../store/voiceStore";
import { useVoiceChannel } from "../webrtc/useVoiceChannel";
import FloatingIcon from "./FloatingIcon";
import { CameraIcon, HangupIcon, HeadphoneIcon, LockIcon, MicIcon } from "./HudIcons";
import SoundboardPanel from "./SoundboardPanel";
import UserSettingsModal from "./UserSettingsModal";
import { SignalIcon } from "./VoiceStatusBar";
import { tr } from "../i18n";

// Starting layout: a vertical rail of its own (.voice-rail, a real column between the channel list
// and the chat/voice view — so the buttons never cover anything, whatever the window size):
//   top:    ping · mute · deafen · camera · LIVE · soundboard · settings
//   bottom: hang up · lock
// Only used until an icon is dragged (Unlock layout — each dragged icon keeps its own spot).
// Computed fresh from where the rail actually is (FloatingIcon re-checks undragged icons).
const SPACING = 52;
const ICON = 44;

function rail() {
  const r = document.querySelector(".voice-rail")?.getBoundingClientRect();
  return r && r.width > 0 ? r : null;
}

function railSlot(slot: number) {
  const r = rail();
  if (!r) return { x: Math.max(16, window.innerWidth - 68), y: 120 + slot * SPACING };
  return { x: r.left + (r.width - ICON) / 2, y: r.top + 12 + slot * SPACING };
}

/** Counted from the rail's bottom: 0 = the lowest button above the lock. */
function railBottomSlot(fromBottom: number) {
  const r = rail();
  if (!r) return { x: Math.max(16, window.innerWidth - 68), y: window.innerHeight - 120 - fromBottom * SPACING };
  return { x: r.left + (r.width - ICON) / 2, y: r.bottom - 12 - 36 - ICON - 10 - fromBottom * SPACING };
}

function lockPosition() {
  const r = rail();
  if (!r) return { x: Math.max(16, window.innerWidth / 2 + 220), y: 14 };
  return { x: r.left + (r.width - 36) / 2, y: r.bottom - 12 - 36 };
}

// The HUD moved (right edge → under the channel list → its own rail). Move everyone once to the
// new layout — positions people dragged themselves included, they were for the old layouts.
try {
  if (!localStorage.getItem("hudLayoutV3")) {
    for (const key of Object.keys(localStorage)) if (key.startsWith("floatingPos:hud-")) localStorage.removeItem(key);
    localStorage.setItem("hudLayoutV2", "1");
    localStorage.setItem("hudLayoutV3", "1");
  }
} catch {
  // storage blocked — defaults apply anyway
}

export default function FloatingVoiceHud() {
  const { activeVoiceChannelId, isMuted, isDeafened, isScreenSharing, isCameraOn, connectionQuality, localRttMs } = useVoiceStore();
  const { leaveVoiceChannel, toggleMute, toggleDeafen, toggleScreenShare, toggleCamera } = useVoiceChannel();
  const { locked, toggleLocked } = useLayoutLockStore();
  const [showSettings, setShowSettings] = useState(false);
  const [showSoundboard, setShowSoundboard] = useState(false);

  if (!activeVoiceChannelId) return null;

  return (
    <>
      <FloatingIcon id="hud-network" getDefaultPosition={() => railSlot(0)}>
        <div className="hud-icon-button static" title={`${tr("Връзка", "Connection")}: ${connectionQuality}${localRttMs !== null ? ` — ${localRttMs}ms (${tr("твоят пинг", "your ping")})` : ""}`}>
          <SignalIcon quality={connectionQuality} size={localRttMs !== null ? 16 : 20} />
          {localRttMs !== null && <span className="hud-ping">{localRttMs}ms</span>}
        </div>
      </FloatingIcon>

      <FloatingIcon id="hud-mute" getDefaultPosition={() => railSlot(1)}>
        <button className={`hud-icon-button ${isMuted ? "active" : ""}`} onClick={toggleMute} title={isMuted ? tr("Включи микрофона", "Unmute") : tr("Заглуши микрофона", "Mute")}>
          <MicIcon muted={isMuted} size={24} />
        </button>
      </FloatingIcon>

      <FloatingIcon id="hud-deafen" getDefaultPosition={() => railSlot(2)}>
        <button
          className={`hud-icon-button ${isDeafened ? "active" : ""}`}
          onClick={toggleDeafen}
          title={isDeafened ? tr("Включи звука", "Undeafen") : tr("Заглуши всички", "Deafen")}
        >
          <HeadphoneIcon muted={isDeafened} size={24} />
        </button>
      </FloatingIcon>

      <FloatingIcon id="hud-camera" getDefaultPosition={() => railSlot(3)}>
        <button
          className={`hud-icon-button ${isCameraOn ? "active" : ""}`}
          onClick={() => void toggleCamera()}
          title={isCameraOn ? tr("Изключи камерата", "Turn camera off") : tr("Включи камерата", "Turn camera on")}
        >
          <CameraIcon off={!isCameraOn} size={24} />
        </button>
      </FloatingIcon>

      <FloatingIcon id="hud-screenshare" getDefaultPosition={() => railSlot(4)}>
        <button
          className={`hud-icon-button hud-live ${isScreenSharing ? "on" : ""}`}
          onClick={() => toggleScreenShare()}
          title={isScreenSharing ? tr("Спри стрийма", "Stop streaming") : tr("Започни стрийм (Go Live)", "Go Live")}
        >
          <span className="hud-live-dot" />
          <span className="hud-live-text">LIVE</span>
        </button>
      </FloatingIcon>

      <FloatingIcon id="hud-soundboard" getDefaultPosition={() => railSlot(5)}>
        <button
          className={`hud-icon-button ${showSoundboard ? "active" : ""}`}
          onClick={() => setShowSoundboard((v) => !v)}
          title="Soundboard"
        >
          🔊
        </button>
      </FloatingIcon>

      <FloatingIcon id="hud-settings" getDefaultPosition={() => railSlot(6)}>
        <button className="hud-icon-button" onClick={() => setShowSettings(true)} title={tr("Настройки", "Settings")}>
          ⚙️
        </button>
      </FloatingIcon>

      <FloatingIcon id="hud-disconnect" getDefaultPosition={() => railBottomSlot(0)}>
        <button className="hud-icon-button hangup" onClick={leaveVoiceChannel} title={tr("Излез от канала", "Leave the channel")}>
          <HangupIcon size={24} />
        </button>
      </FloatingIcon>

      {/* Movable like the other icons, but only while the layout is unlocked. */}
      <FloatingIcon id="hud-lock" getDefaultPosition={lockPosition}>
        <button
          className={`hud-lock-button compact ${locked ? "locked" : "unlocked"}`}
          onClick={toggleLocked}
          title={locked ? tr("Отключи — бутоните могат да се местят с влачене", "Unlock — buttons can be dragged around") : tr("Заключи бутоните на място", "Lock the buttons in place")}
          aria-label={locked ? tr("Отключи", "Unlock layout") : tr("Заключи", "Lock layout")}
        >
          <LockIcon locked={locked} size={14} color={locked ? "var(--c-backdrop)" : "var(--t-3)"} />
        </button>
      </FloatingIcon>

      {showSettings && <UserSettingsModal onClose={() => setShowSettings(false)} />}
      {showSoundboard && <SoundboardPanel onClose={() => setShowSoundboard(false)} />}
    </>
  );
}
