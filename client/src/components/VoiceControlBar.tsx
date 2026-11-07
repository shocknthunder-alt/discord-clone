import { useVoiceStore } from "../store/voiceStore";
import { useReorderable } from "../utils/useReorderable";
import { useVoiceChannel } from "../webrtc/useVoiceChannel";
import DraggableIcon from "./DraggableIcon";

const DEFAULT_ORDER = ["mute", "deafen", "screenshare", "disconnect"];

export default function VoiceControlBar() {
  const { isMuted, isDeafened, isScreenSharing } = useVoiceStore();
  const { leaveVoiceChannel, toggleMute, toggleDeafen, toggleScreenShare } = useVoiceChannel();
  const { order, moveItem } = useReorderable("voiceControlBar", DEFAULT_ORDER);

  const buttons: Record<string, React.ReactNode> = {
    mute: (
      <button className={isMuted ? "active" : ""} onClick={toggleMute}>
        {isMuted ? "Unmute" : "Mute"}
      </button>
    ),
    deafen: (
      <button className={isDeafened ? "active" : ""} onClick={toggleDeafen}>
        {isDeafened ? "Undeafen" : "Deafen"}
      </button>
    ),
    screenshare: (
      <button className={isScreenSharing ? "active" : ""} onClick={() => toggleScreenShare()}>
        {isScreenSharing ? "Stop Sharing" : "Go Live"}
      </button>
    ),
    disconnect: (
      <button className="danger" onClick={leaveVoiceChannel}>
        Disconnect
      </button>
    ),
  };

  return (
    <div className="voice-control-bar">
      <div className="voice-control-trigger" aria-hidden>
        ⋯
      </div>
      <div className="voice-control-buttons">
        {order.map((id) => (
          <DraggableIcon key={id} id={id} onDropItem={moveItem}>
            {buttons[id]}
          </DraggableIcon>
        ))}
      </div>
    </div>
  );
}
