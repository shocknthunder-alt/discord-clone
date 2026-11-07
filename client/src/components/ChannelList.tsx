import { useAuthStore } from "../store/authStore";
import { useServerStore } from "../store/serverStore";
import { useVoiceStore } from "../store/voiceStore";
import { useVoiceChannel } from "../webrtc/useVoiceChannel";

interface Props {
  onSelectText: () => void;
  onSelectVoice: () => void;
}

export default function ChannelList({ onSelectText, onSelectVoice }: Props) {
  const { servers, activeServerId, textChannels, voiceChannels, activeTextChannelId, setActiveTextChannel } =
    useServerStore();
  const { activeVoiceChannelId, peers } = useVoiceStore();
  const { joinVoiceChannel, leaveVoiceChannel } = useVoiceChannel();
  const currentUsername = useAuthStore((s) => s.user?.username) ?? "You";

  const activeServer = servers.find((s) => s.id === activeServerId);
  if (!activeServer) {
    return <div className="channel-sidebar" />;
  }

  async function handleVoiceClick(voiceChannelId: string) {
    if (activeVoiceChannelId === voiceChannelId) {
      onSelectVoice();
      return;
    }
    if (activeVoiceChannelId) {
      leaveVoiceChannel();
    }
    await joinVoiceChannel(voiceChannelId);
    onSelectVoice();
  }

  return (
    <div className="channel-sidebar">
      <h2>{activeServer.name}</h2>
      <div style={{ padding: "0 16px", fontSize: 12, color: "#949ba4" }}>Invite code: {activeServer.inviteCode}</div>

      <div className="channel-section">Text Channels</div>
      {textChannels.map((channel) => (
        <div
          key={channel.id}
          className={`channel-item ${channel.id === activeTextChannelId ? "active" : ""}`}
          onClick={() => {
            setActiveTextChannel(channel.id);
            onSelectText();
          }}
        >
          # {channel.name}
        </div>
      ))}

      <div className="channel-section">Voice Channels</div>
      {voiceChannels.map((channel) => (
        <div key={channel.id}>
          <div
            className={`channel-item ${channel.id === activeVoiceChannelId ? "active" : ""}`}
            onClick={() => handleVoiceClick(channel.id)}
          >
            🔊 {channel.name}
          </div>
          {channel.id === activeVoiceChannelId && (
            <div className="voice-participant-list">
              {Array.from(peers.values()).map((peer) => (
                <div key={peer.socketId}>{peer.username || "connecting…"}</div>
              ))}
              <div>{currentUsername}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
