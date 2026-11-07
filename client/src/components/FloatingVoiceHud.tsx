import { useState } from "react";
import { useVoiceStore } from "../store/voiceStore";
import { useVoiceChannel } from "../webrtc/useVoiceChannel";
import FloatingIcon from "./FloatingIcon";
import { HangupIcon, HeadphoneIcon, MicIcon, ScreenShareIcon } from "./HudIcons";
import UserSettingsModal from "./UserSettingsModal";
import { SignalIcon } from "./VoiceStatusBar";

// Starting layout: a row along the bottom-center, like a typical call toolbar — only the
// very first time (or after "Reset Positions"); after that each icon's dragged-to spot
// takes over via FloatingIcon's own localStorage persistence.
function defaultRowPositions(count: number) {
  const spacing = 48;
  const totalWidth = spacing * (count - 1);
  const startX = Math.max(16, window.innerWidth / 2 - totalWidth / 2);
  const y = window.innerHeight - 72;
  return Array.from({ length: count }, (_, i) => ({ x: startX + i * spacing, y }));
}

export default function FloatingVoiceHud() {
  const { activeVoiceChannelId, isMuted, isDeafened, isScreenSharing, connectionQuality } = useVoiceStore();
  const { leaveVoiceChannel, toggleMute, toggleDeafen, toggleScreenShare } = useVoiceChannel();
  const [showSettings, setShowSettings] = useState(false);

  if (!activeVoiceChannelId) return null;

  const positions = defaultRowPositions(6);

  return (
    <>
      <FloatingIcon id="hud-mute" defaultPosition={positions[0]}>
        <button className={`hud-icon-button ${isMuted ? "active" : ""}`} onClick={toggleMute} title={isMuted ? "Unmute" : "Mute"}>
          <MicIcon muted={isMuted} />
        </button>
      </FloatingIcon>

      <FloatingIcon id="hud-deafen" defaultPosition={positions[1]}>
        <button
          className={`hud-icon-button ${isDeafened ? "active" : ""}`}
          onClick={toggleDeafen}
          title={isDeafened ? "Undeafen" : "Deafen"}
        >
          <HeadphoneIcon muted={isDeafened} />
        </button>
      </FloatingIcon>

      <FloatingIcon id="hud-screenshare" defaultPosition={positions[2]}>
        <button
          className={`hud-icon-button ${isScreenSharing ? "active" : ""}`}
          onClick={() => toggleScreenShare()}
          title={isScreenSharing ? "Stop Sharing" : "Go Live"}
        >
          <ScreenShareIcon />
        </button>
      </FloatingIcon>

      <FloatingIcon id="hud-disconnect" defaultPosition={positions[3]}>
        <button className="hud-icon-button hangup" onClick={leaveVoiceChannel} title="Disconnect">
          <HangupIcon />
        </button>
      </FloatingIcon>

      <FloatingIcon id="hud-settings" defaultPosition={positions[4]}>
        <button className="hud-icon-button" onClick={() => setShowSettings(true)} title="Settings">
          ⚙️
        </button>
      </FloatingIcon>

      <FloatingIcon id="hud-network" defaultPosition={positions[5]}>
        <div className="hud-icon-button static" title={`Connection: ${connectionQuality}`}>
          <SignalIcon quality={connectionQuality} size={14} />
        </div>
      </FloatingIcon>

      {showSettings && <UserSettingsModal onClose={() => setShowSettings(false)} />}
    </>
  );
}
