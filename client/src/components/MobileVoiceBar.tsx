import { useState } from "react";
import { useServerStore } from "../store/serverStore";
import { useVoiceStore } from "../store/voiceStore";
import { useVoiceChannel } from "../webrtc/useVoiceChannel";
import { CameraIcon, HangupIcon, HeadphoneIcon, MicIcon } from "./HudIcons";
import SoundboardPanel from "./SoundboardPanel";
import UserSettingsModal from "./UserSettingsModal";
import { SignalIcon } from "./VoiceStatusBar";
import { tr } from "../i18n";

/** 📱 Phones: the voice buttons as one bar at the bottom (instead of the movable HUD column). */
export default function MobileVoiceBar({ onOpenVoice }: { onOpenVoice: () => void }) {
  const { activeVoiceChannelId, isMuted, isDeafened, isCameraOn, connectionQuality, localRttMs } = useVoiceStore();
  const { leaveVoiceChannel, toggleMute, toggleDeafen, toggleCamera } = useVoiceChannel();
  const channelName = useServerStore((s) => s.voiceChannels.find((v) => v.id === activeVoiceChannelId)?.name);
  const [showSettings, setShowSettings] = useState(false);
  const [showSoundboard, setShowSoundboard] = useState(false);

  if (!activeVoiceChannelId) return null;

  return (
    <>
      <div className="mobile-voice-bar">
        <button type="button" className="mobile-voice-where" onClick={onOpenVoice} title={`${connectionQuality}${localRttMs !== null ? ` ${localRttMs}ms` : ""}`}>
          <SignalIcon quality={connectionQuality} size={16} />
          <span>{channelName ?? tr("Гласов канал", "Voice")}</span>
        </button>
        <button type="button" className={`hud-icon-button ${isMuted ? "active" : ""}`} onClick={toggleMute} aria-label={isMuted ? tr("Включи микрофона", "Unmute") : tr("Заглуши микрофона", "Mute")}>
          <MicIcon muted={isMuted} size={22} />
        </button>
        <button type="button" className={`hud-icon-button ${isDeafened ? "active" : ""}`} onClick={toggleDeafen} aria-label={tr("Заглуши всички", "Deafen")}>
          <HeadphoneIcon muted={isDeafened} size={22} />
        </button>
        <button type="button" className={`hud-icon-button ${isCameraOn ? "active" : ""}`} onClick={() => void toggleCamera()} aria-label={tr("Камера", "Camera")}>
          <CameraIcon off={!isCameraOn} size={22} />
        </button>
        <button type="button" className={`hud-icon-button ${showSoundboard ? "active" : ""}`} onClick={() => setShowSoundboard((v) => !v)} aria-label="Soundboard">
          🔊
        </button>
        <button type="button" className="hud-icon-button" onClick={() => setShowSettings(true)} aria-label={tr("Настройки", "Settings")}>
          ⚙️
        </button>
        <button type="button" className="hud-icon-button hangup" onClick={leaveVoiceChannel} aria-label={tr("Излез от канала", "Leave the channel")}>
          <HangupIcon size={22} />
        </button>
      </div>
      {showSettings && <UserSettingsModal onClose={() => setShowSettings(false)} />}
      {showSoundboard && <SoundboardPanel onClose={() => setShowSoundboard(false)} />}
    </>
  );
}
