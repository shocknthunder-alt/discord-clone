import { useState } from "react";
import { useLayoutLockStore } from "../store/layoutLockStore";
import { useVoiceStore } from "../store/voiceStore";
import { useVoiceChannel } from "../webrtc/useVoiceChannel";
import FloatingIcon from "./FloatingIcon";
import { CameraIcon, HangupIcon, HeadphoneIcon, LockIcon, MicIcon, ScreenShareIcon } from "./HudIcons";
import SoundboardPanel from "./SoundboardPanel";
import UserSettingsModal from "./UserSettingsModal";
import { SignalIcon } from "./VoiceStatusBar";

// Starting layout: docked at the bottom of the channel list, just above "Voice Connected" —
//   row 1: ping · screen share · camera · settings
//   row 2: soundboard · deafen · mute · hang up
//   then the lock button.
// Only used until an icon is dragged (each dragged icon keeps its own spot). Computed fresh on
// every call from where the sidebar actually is, so it follows window resizes and the music
// player opening/closing (FloatingIcon re-checks undragged icons).
const SPACING = 58;
const ICON = 44;

function dock() {
  const sidebar = document.querySelector(".channel-sidebar")?.getBoundingClientRect();
  if (!sidebar || sidebar.width === 0) return null;
  const bar = document.querySelector(".voice-status-bar")?.getBoundingClientRect();
  const bottom = bar && bar.height > 0 ? bar.top : sidebar.bottom - 130;
  const rowWidth = SPACING * 3 + ICON;
  return { left: sidebar.left + Math.max(4, (sidebar.width - rowWidth) / 2), centre: sidebar.left + sidebar.width / 2, bottom };
}

function dockPosition(col: number, row: number) {
  const d = dock();
  if (!d) return { x: Math.max(16, window.innerWidth - 68), y: 120 + (row * 4 + col) * SPACING };
  return { x: d.left + col * SPACING, y: d.bottom - (row === 0 ? 220 : 162) };
}

function lockPosition() {
  const d = dock();
  if (!d) return { x: Math.max(16, window.innerWidth / 2 + 220), y: 14 };
  return { x: d.centre - 62, y: d.bottom - 78 };
}

// The HUD used to start as a column on the right edge. Move everyone once to the new docked
// layout (positions people dragged themselves included — they were mostly the old defaults).
try {
  if (!localStorage.getItem("hudLayoutV2")) {
    for (const key of Object.keys(localStorage)) if (key.startsWith("floatingPos:hud-")) localStorage.removeItem(key);
    localStorage.setItem("hudLayoutV2", "1");
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
      <FloatingIcon id="hud-mute" getDefaultPosition={() => dockPosition(2, 1)}>
        <button className={`hud-icon-button ${isMuted ? "active" : ""}`} onClick={toggleMute} title={isMuted ? "Unmute" : "Mute"}>
          <MicIcon muted={isMuted} size={24} />
        </button>
      </FloatingIcon>

      <FloatingIcon id="hud-deafen" getDefaultPosition={() => dockPosition(1, 1)}>
        <button
          className={`hud-icon-button ${isDeafened ? "active" : ""}`}
          onClick={toggleDeafen}
          title={isDeafened ? "Undeafen" : "Deafen"}
        >
          <HeadphoneIcon muted={isDeafened} size={24} />
        </button>
      </FloatingIcon>

      <FloatingIcon id="hud-screenshare" getDefaultPosition={() => dockPosition(1, 0)}>
        <button
          className={`hud-icon-button ${isScreenSharing ? "active live" : ""}`}
          onClick={() => toggleScreenShare()}
          title={isScreenSharing ? "Stop Sharing" : "Go Live"}
        >
          <ScreenShareIcon size={24} />
        </button>
      </FloatingIcon>

      <FloatingIcon id="hud-camera" getDefaultPosition={() => dockPosition(2, 0)}>
        <button
          className={`hud-icon-button ${isCameraOn ? "active" : ""}`}
          onClick={() => void toggleCamera()}
          title={isCameraOn ? "Turn off camera" : "Turn on camera"}
        >
          <CameraIcon off={!isCameraOn} size={24} />
        </button>
      </FloatingIcon>

      <FloatingIcon id="hud-disconnect" getDefaultPosition={() => dockPosition(3, 1)}>
        <button className="hud-icon-button hangup" onClick={leaveVoiceChannel} title="Disconnect">
          <HangupIcon size={24} />
        </button>
      </FloatingIcon>

      <FloatingIcon id="hud-settings" getDefaultPosition={() => dockPosition(3, 0)}>
        <button className="hud-icon-button" onClick={() => setShowSettings(true)} title="Settings">
          ⚙️
        </button>
      </FloatingIcon>

      <FloatingIcon id="hud-network" getDefaultPosition={() => dockPosition(0, 0)}>
        <div className="hud-icon-button static" title={`Connection: ${connectionQuality}${localRttMs !== null ? ` — ${localRttMs}ms (твоят пинг)` : ""}`}>
          <SignalIcon quality={connectionQuality} size={localRttMs !== null ? 16 : 20} />
          {localRttMs !== null && <span className="hud-ping">{localRttMs}ms</span>}
        </div>
      </FloatingIcon>

      <FloatingIcon id="hud-soundboard" getDefaultPosition={() => dockPosition(0, 1)}>
        <button
          className={`hud-icon-button ${showSoundboard ? "active" : ""}`}
          onClick={() => setShowSoundboard((v) => !v)}
          title="Soundboard"
        >
          🔊
        </button>
      </FloatingIcon>

      {/* Movable like the other icons, but only while the layout is unlocked. */}
      <FloatingIcon id="hud-lock" getDefaultPosition={lockPosition}>
        <button
          className={`hud-lock-button ${locked ? "locked" : "unlocked"}`}
          onClick={toggleLocked}
          title={(locked ? "Unlock layout (allow drag-reordering)" : "Lock layout (prevent drag-reordering)") + " (drag to move when unlocked)"}
        >
          <LockIcon locked={locked} size={14} color={locked ? "var(--c-backdrop)" : "var(--t-3)"} />
          {locked ? "Unlock layout" : "Lock layout"}
        </button>
      </FloatingIcon>

      {showSettings && <UserSettingsModal onClose={() => setShowSettings(false)} />}
      {showSoundboard && <SoundboardPanel onClose={() => setShowSoundboard(false)} />}
    </>
  );
}
