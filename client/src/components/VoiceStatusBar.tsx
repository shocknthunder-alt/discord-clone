import { useDmStore } from "../store/dmStore";
import { useServerStore } from "../store/serverStore";
import { useVoiceStore, type ConnectionQuality } from "../store/voiceStore";
import { tr } from "../i18n";
import { useVoiceChannel } from "../webrtc/useVoiceChannel";

const QUALITY_COLOR: Record<ConnectionQuality, string> = {
  good: "#23a559",
  medium: "#f0b232",
  poor: "#da373c",
  unknown: "var(--t-4)",
};

export function SignalIcon({ quality, size = 16 }: { quality: ConnectionQuality; size?: number }) {
  const color = QUALITY_COLOR[quality];
  const activeBars = quality === "good" ? 3 : quality === "medium" ? 2 : quality === "poor" ? 1 : 0;

  return (
    <svg width={size} height={size * 0.85} viewBox="0 0 16 14" aria-hidden>
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
            fill={i < activeBars ? color : "var(--c-line)"}
          />
        );
      })}
    </svg>
  );
}

export default function VoiceStatusBar() {
  const activeVoiceChannelId = useVoiceStore((s) => s.activeVoiceChannelId);
  const voiceChannels = useServerStore((s) => s.voiceChannels);
  const conversations = useDmStore((s) => s.conversations);
  const isScreenSharing = useVoiceStore((s) => s.isScreenSharing);
  const { toggleScreenShare } = useVoiceChannel();

  if (!activeVoiceChannelId) return null;

  let label = tr("Свързан с гласа", "Voice Connected");
  if (activeVoiceChannelId.startsWith("dm:")) {
    const conversationId = activeVoiceChannelId.slice(3);
    const conversation = conversations.find((c) => c.id === conversationId);
    if (conversation) label = conversation.otherUser.username;
  } else {
    const channel = voiceChannels.find((c) => c.id === activeVoiceChannelId);
    if (channel) label = channel.name;
  }

  return (
    <div className="voice-status-bar">
      <div className="voice-status-bar-row">
        <div className="voice-status-bar-text">
          <div className="voice-status-bar-title">{tr("Свързан с гласа", "Voice Connected")}</div>
          <div className="voice-status-bar-subtitle">{label}</div>
        </div>
      </div>
      <button
        className={`voice-stream-toggle ${isScreenSharing ? "on" : ""}`}
        onClick={() => toggleScreenShare()}
      >
        <span className="hud-live-dot" />
        {isScreenSharing
          ? tr("Цъкни тук, за да спреш стрийма", "Click here to stop streaming")
          : tr("Цъкни тук, за да пуснеш стрийм", "Click here to start stream")}
      </button>
    </div>
  );
}
