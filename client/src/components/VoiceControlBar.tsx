import { useVoiceStore } from "../store/voiceStore";
import { useVoiceChannel } from "../webrtc/useVoiceChannel";

export default function VoiceControlBar() {
  const { isMuted, isDeafened, isScreenSharing } = useVoiceStore();
  const { leaveVoiceChannel, toggleMute, toggleDeafen, toggleScreenShare } = useVoiceChannel();

  return (
    <div className="voice-control-bar">
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
  );
}
