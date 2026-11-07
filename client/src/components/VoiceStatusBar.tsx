import { useDmStore } from "../store/dmStore";
import { useServerStore } from "../store/serverStore";
import { useVoiceStore, type ConnectionQuality } from "../store/voiceStore";
import { useVoiceChannel } from "../webrtc/useVoiceChannel";

const QUALITY_LABEL: Record<ConnectionQuality, string> = {
  good: "Excellent connection",
  medium: "Fair connection",
  poor: "Poor connection",
  unknown: "Connecting…",
};

const QUALITY_COLOR: Record<ConnectionQuality, string> = {
  good: "#23a559",
  medium: "#f0b232",
  poor: "#da373c",
  unknown: "#80848e",
};

function SignalIcon({ quality }: { quality: ConnectionQuality }) {
  const color = QUALITY_COLOR[quality];
  const activeBars = quality === "good" ? 3 : quality === "medium" ? 2 : quality === "poor" ? 1 : 0;

  return (
    <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden>
      {[0, 1, 2].map((i) => {
        const barHeight = 4 + i * 4;
        return (
          <rect
            key={i}
            x={i * 6}
            y={14 - barHeight}
            width="4"
            height={barHeight}
            rx="1"
            fill={i < activeBars ? color : "#4e5058"}
          />
        );
      })}
    </svg>
  );
}

export default function VoiceStatusBar() {
  const activeVoiceChannelId = useVoiceStore((s) => s.activeVoiceChannelId);
  const connectionQuality = useVoiceStore((s) => s.connectionQuality);
  const voiceChannels = useServerStore((s) => s.voiceChannels);
  const conversations = useDmStore((s) => s.conversations);
  const { leaveVoiceChannel } = useVoiceChannel();

  if (!activeVoiceChannelId) return null;

  let label = "Voice Connected";
  if (activeVoiceChannelId.startsWith("dm:")) {
    const conversationId = activeVoiceChannelId.slice(3);
    const conversation = conversations.find((c) => c.id === conversationId);
    if (conversation) label = conversation.otherUser.username;
  } else {
    const channel = voiceChannels.find((c) => c.id === activeVoiceChannelId);
    if (channel) label = channel.name;
  }

  return (
    <div className="voice-status-bar" title={QUALITY_LABEL[connectionQuality]}>
      <SignalIcon quality={connectionQuality} />
      <div className="voice-status-bar-text">
        <div className="voice-status-bar-title">Voice Connected</div>
        <div className="voice-status-bar-subtitle">{label}</div>
      </div>
      <button className="voice-status-bar-hangup" onClick={leaveVoiceChannel} title="Disconnect">
        📞
      </button>
    </div>
  );
}
