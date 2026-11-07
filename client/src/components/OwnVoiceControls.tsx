import { useState } from "react";
import { useVoiceStore, type ConnectionQuality } from "../store/voiceStore";
import { useReorderable } from "../utils/useReorderable";
import { useVoiceChannel } from "../webrtc/useVoiceChannel";
import DraggableIcon from "./DraggableIcon";
import UserSettingsModal from "./UserSettingsModal";
import { SignalIcon } from "./VoiceStatusBar";

const QUALITY_LABEL: Record<ConnectionQuality, string> = {
  good: "Excellent connection",
  medium: "Fair connection",
  poor: "Poor connection",
  unknown: "Connecting…",
};

const DEFAULT_ORDER = ["disconnect", "settings", "network"];

/**
 * The compact personal control cluster (Disconnect / Settings / connection quality) shown
 * on the local user's own voice tile and in the sidebar VoiceStatusBar. Shared here so the
 * drag-reordered order (persisted once, under one storage key) stays consistent wherever
 * it's rendered, instead of being customized separately in each spot.
 */
export default function OwnVoiceControls() {
  const connectionQuality = useVoiceStore((s) => s.connectionQuality);
  const { leaveVoiceChannel } = useVoiceChannel();
  const { order, moveItem } = useReorderable("ownVoiceControls", DEFAULT_ORDER);
  const [showSettings, setShowSettings] = useState(false);

  const icons: Record<string, React.ReactNode> = {
    disconnect: (
      <button className="voice-status-icon-button hangup" onClick={leaveVoiceChannel} title="Disconnect">
        📞
      </button>
    ),
    settings: (
      <button className="voice-status-icon-button" onClick={() => setShowSettings(true)} title="Settings">
        ⚙️
      </button>
    ),
    network: (
      <div className="voice-status-icon-button static" title={QUALITY_LABEL[connectionQuality]}>
        <SignalIcon quality={connectionQuality} size={14} />
      </div>
    ),
  };

  return (
    <div className="voice-status-bar-icons">
      {order.map((id) => (
        <DraggableIcon key={id} id={id} onDropItem={moveItem}>
          {icons[id]}
        </DraggableIcon>
      ))}

      {showSettings && <UserSettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
