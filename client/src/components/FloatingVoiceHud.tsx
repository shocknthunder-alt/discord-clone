import { useState } from "react";
import { useLayoutLockStore } from "../store/layoutLockStore";
import { useVoiceStore } from "../store/voiceStore";
import { useVoiceChannel } from "../webrtc/useVoiceChannel";
import FloatingIcon from "./FloatingIcon";
import { CameraIcon, HangupIcon, HeadphoneIcon, LockIcon, MicIcon, ScreenShareIcon } from "./HudIcons";
import UserSettingsModal from "./UserSettingsModal";
import { SignalIcon } from "./VoiceStatusBar";

// Starting layout: a vertical column along the right edge — only the very first time (or
// after "Reset Positions"); after that each icon's dragged-to spot takes over via
// FloatingIcon's own localStorage persistence. Deliberately NOT bottom-center: that's
// exactly where the message input bar sits in every view (text channel, DM, voice), so a
// bottom-center default meant the HUD sat on top of it once locked in place.
// Computed fresh on every call (not cached) — see FloatingIcon's getDefaultPosition prop
// for why that matters: a value computed once at render time goes stale the moment the
// viewport changes (DevTools opening/closing included), stranding icons mid-screen.
function defaultColumnPosition(index: number, count: number) {
  const spacing = 58;
  const totalHeight = spacing * (count - 1);
  const x = Math.max(16, window.innerWidth - 68);
  const startY = Math.max(16, window.innerHeight / 2 - totalHeight / 2);
  return { x, y: startY + index * spacing };
}

export default function FloatingVoiceHud() {
  const { activeVoiceChannelId, isMuted, isDeafened, isScreenSharing, isCameraOn, connectionQuality } = useVoiceStore();
  const { leaveVoiceChannel, toggleMute, toggleDeafen, toggleScreenShare, toggleCamera } = useVoiceChannel();
  const { locked, toggleLocked } = useLayoutLockStore();
  const [showSettings, setShowSettings] = useState(false);

  if (!activeVoiceChannelId) return null;

  return (
    <>
      <FloatingIcon id="hud-mute" getDefaultPosition={() => defaultColumnPosition(0, 7)}>
        <button className={`hud-icon-button ${isMuted ? "active" : ""}`} onClick={toggleMute} title={isMuted ? "Unmute" : "Mute"}>
          <MicIcon muted={isMuted} size={24} />
        </button>
      </FloatingIcon>

      <FloatingIcon id="hud-deafen" getDefaultPosition={() => defaultColumnPosition(1, 7)}>
        <button
          className={`hud-icon-button ${isDeafened ? "active" : ""}`}
          onClick={toggleDeafen}
          title={isDeafened ? "Undeafen" : "Deafen"}
        >
          <HeadphoneIcon muted={isDeafened} size={24} />
        </button>
      </FloatingIcon>

      <FloatingIcon id="hud-screenshare" getDefaultPosition={() => defaultColumnPosition(2, 7)}>
        <button
          className={`hud-icon-button ${isScreenSharing ? "active live" : ""}`}
          onClick={() => toggleScreenShare()}
          title={isScreenSharing ? "Stop Sharing" : "Go Live"}
        >
          <ScreenShareIcon size={24} />
        </button>
      </FloatingIcon>

      <FloatingIcon id="hud-camera" getDefaultPosition={() => defaultColumnPosition(3, 7)}>
        <button
          className={`hud-icon-button ${isCameraOn ? "active" : ""}`}
          onClick={() => void toggleCamera()}
          title={isCameraOn ? "Turn off camera" : "Turn on camera"}
        >
          <CameraIcon off={!isCameraOn} size={24} />
        </button>
      </FloatingIcon>

      <FloatingIcon id="hud-disconnect" getDefaultPosition={() => defaultColumnPosition(4, 7)}>
        <button className="hud-icon-button hangup" onClick={leaveVoiceChannel} title="Disconnect">
          <HangupIcon size={24} />
        </button>
      </FloatingIcon>

      <FloatingIcon id="hud-settings" getDefaultPosition={() => defaultColumnPosition(5, 7)}>
        <button className="hud-icon-button" onClick={() => setShowSettings(true)} title="Settings">
          ⚙️
        </button>
      </FloatingIcon>

      <FloatingIcon id="hud-network" getDefaultPosition={() => defaultColumnPosition(6, 7)}>
        <div className="hud-icon-button static" title={`Connection: ${connectionQuality}`}>
          <SignalIcon quality={connectionQuality} size={20} />
        </div>
      </FloatingIcon>

      {/* Fixed top-center, deliberately NOT part of the draggable column — it's the control
          for whether everything else can be dragged, so it needs to always be found in the
          same place rather than needing to be found-and-dragged itself. */}
      <button
        className={`hud-lock-button ${locked ? "locked" : "unlocked"}`}
        onClick={toggleLocked}
        title={locked ? "Unlock layout (allow drag-reordering)" : "Lock layout (prevent drag-reordering)"}
      >
        <LockIcon locked={locked} size={14} color={locked ? "var(--c-backdrop)" : "var(--t-3)"} />
        {locked ? "Unlock layout" : "Lock layout"}
      </button>

      {showSettings && <UserSettingsModal onClose={() => setShowSettings(false)} />}
    </>
  );
}
