import { useState } from "react";
import { useAuthStore } from "../store/authStore";
import { useServerStore } from "../store/serverStore";
import { useVoiceStore } from "../store/voiceStore";
import { useVoiceChannel } from "../webrtc/useVoiceChannel";
import ServerSettingsModal from "./ServerSettingsModal";
import UserBar from "./UserBar";

interface Props {
  onSelectText: () => void;
  onSelectVoice: () => void;
}

export default function ChannelList({ onSelectText, onSelectVoice }: Props) {
  const { servers, activeServerId, textChannels, voiceChannels, activeTextChannelId, setActiveTextChannel } =
    useServerStore();
  const { activeVoiceChannelId, peers } = useVoiceStore();
  const { joinVoiceChannel, leaveVoiceChannel } = useVoiceChannel();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const currentUsername = useAuthStore((s) => s.user?.username) ?? "You";
  const [showServerSettings, setShowServerSettings] = useState(false);

  const activeServer = servers.find((s) => s.id === activeServerId);
  const isOwner = activeServer?.ownerId === currentUserId;

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
      <div className="channel-sidebar-scroll">
        {activeServer && (
          <>
            <div className="channel-sidebar-header">
              {activeServer.iconUrl && <img className="server-header-icon" src={activeServer.iconUrl} alt="" />}
              <h2>{activeServer.name}</h2>
              {isOwner && (
                <button className="server-settings-button" onClick={() => setShowServerSettings(true)} title="Server settings">
                  ⚙️
                </button>
              )}
            </div>
            <div style={{ padding: "0 16px", fontSize: 12, color: "#949ba4" }}>
              Invite code: {activeServer.inviteCode}
            </div>

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
                      <div key={peer.socketId}>
                        <span className={peer.isScreenSharing ? "participant-name streaming" : "participant-name"}>
                          {peer.isScreenSharing && "🖥️ "}
                          {peer.username || "connecting…"}
                        </span>
                      </div>
                    ))}
                    <div>{currentUsername}</div>
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>

      <UserBar />

      {showServerSettings && activeServer && (
        <ServerSettingsModal server={activeServer} onClose={() => setShowServerSettings(false)} />
      )}
    </div>
  );
}
