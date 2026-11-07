import { useVoiceStore } from "../store/voiceStore";
import { useVoiceChannel } from "../webrtc/useVoiceChannel";

export default function VoiceControlBar() {
  const { isMuted, isDeafened, isScreenSharing } = useVoiceStore();
  const { leaveVoiceChannel, toggleMute, toggleDeafen, toggleScreenShare } = useVoiceChannel();

  return (
    <div className="voice-control-bar">
      <div className="voice-control-trigger" aria-hidden>
        ⋯
      </div>
      <div className="voice-control-buttons">
        <button className={isMuted ? "active" : ""} onClick={toggleMute}>
          {isMuted ? "Unmute" : "Mute"}
        </button>
        <button className={isDeafened ? "active" : ""} onClick={toggleDeafen}>
          {isDeafened ? "Undeafen" : "Deafen"}
        </button>
        <button className={isScreenSharing ? "active" : ""} onClick={() => toggleScreenShare()}>
          {isScreenSharing ? "Stop Sharing" : "Go Live"}
        </button>
        <button className="danger" onClick={leaveVoiceChannel}>
          Disconnect
        </button>
      </div>
    </div>
  );
}
