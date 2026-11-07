import { SocketEvents } from "@discord-clone/shared";
import { useState } from "react";
import { startConversationWith } from "../api/dm.api";
import { getSocket } from "../socket/socket";
import { useAuthStore } from "../store/authStore";
import { useDmStore } from "../store/dmStore";
import { useServerStore } from "../store/serverStore";
import { useVoiceStore, type RemotePeer } from "../store/voiceStore";
import { voiceStatusIcons } from "../utils/voiceStatus";
import { useVoiceChannel } from "../webrtc/useVoiceChannel";
import ChannelContextMenu from "./ChannelContextMenu";
import CreateChannelModal from "./CreateChannelModal";
import ServerSettingsModal from "./ServerSettingsModal";
import UserBar from "./UserBar";
import VoiceStatusBar from "./VoiceStatusBar";
import VoicePeerContextMenu from "./VoicePeerContextMenu";

interface Props {
  onSelectText: () => void;
  onSelectVoice: () => void;
}

export default function ChannelList({ onSelectText, onSelectVoice }: Props) {
  const { servers, activeServerId, textChannels, voiceChannels, activeTextChannelId, setActiveTextChannel } =
    useServerStore();
  const { activeVoiceChannelId, peers, isScreenSharing, isMuted, isDeafened } = useVoiceStore();
  const { joinVoiceChannel, leaveVoiceChannel } = useVoiceChannel();
  const { setView, setActiveConversation, upsertConversation } = useDmStore();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const currentUsername = useAuthStore((s) => s.user?.username) ?? "You";
  const [showServerSettings, setShowServerSettings] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ socketId: string; x: number; y: number } | null>(null);
  const [channelContextMenu, setChannelContextMenu] = useState<{ type: "text" | "voice"; x: number; y: number } | null>(
    null,
  );
  const [createChannelType, setCreateChannelType] = useState<"text" | "voice" | null>(null);

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

  function handlePeerContextMenu(e: React.MouseEvent, peer: RemotePeer) {
    e.preventDefault();
    if (!peer.userId) return;
    setContextMenu({ socketId: peer.socketId, x: e.clientX, y: e.clientY });
  }

  function handleSectionContextMenu(e: React.MouseEvent, type: "text" | "voice") {
    e.preventDefault();
    if (!isOwner) return;
    setChannelContextMenu({ type, x: e.clientX, y: e.clientY });
  }

  async function goToDm(userId: string) {
    const conversation = await startConversationWith(userId);
    upsertConversation(conversation);
    setActiveConversation(conversation.id);
    setView("dms");
    return conversation;
  }

  async function handleMessage(userId: string) {
    await goToDm(userId);
  }

  async function handleCall(userId: string) {
    const conversation = await goToDm(userId);
    const voiceRoomId = `dm:${conversation.id}`;
    leaveVoiceChannel();
    await joinVoiceChannel(voiceRoomId);
    getSocket()?.emit(SocketEvents.DmRing, { conversationId: conversation.id });
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

            <div onContextMenu={(e) => handleSectionContextMenu(e, "text")}>
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
            </div>

            <div onContextMenu={(e) => handleSectionContextMenu(e, "voice")}>
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
                      <div key={peer.socketId} onContextMenu={(e) => handlePeerContextMenu(e, peer)}>
                        <span className={peer.isScreenSharing ? "participant-name streaming" : "participant-name"}>
                          {peer.isScreenSharing && "🖥️ "}
                          {peer.username || "connecting…"}
                        </span>
                        {voiceStatusIcons(peer.isMuted, peer.isDeafened) && (
                          <span className="voice-status-icons"> {voiceStatusIcons(peer.isMuted, peer.isDeafened)}</span>
                        )}
                      </div>
                    ))}
                    <div>
                      <span className={isScreenSharing ? "participant-name streaming" : "participant-name"}>
                        {isScreenSharing && "🖥️ "}
                        {currentUsername}
                      </span>
                      {voiceStatusIcons(isMuted, isDeafened) && (
                        <span className="voice-status-icons"> {voiceStatusIcons(isMuted, isDeafened)}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
              ))}
            </div>
          </>
        )}
      </div>

      <VoiceStatusBar />
      <UserBar />

      {showServerSettings && activeServer && (
        <ServerSettingsModal server={activeServer} onClose={() => setShowServerSettings(false)} />
      )}

      {contextMenu && (
        <VoicePeerContextMenu
          socketId={contextMenu.socketId}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onMessage={handleMessage}
          onCall={handleCall}
        />
      )}

      {channelContextMenu && (
        <ChannelContextMenu
          type={channelContextMenu.type}
          x={channelContextMenu.x}
          y={channelContextMenu.y}
          onClose={() => setChannelContextMenu(null)}
          onCreate={setCreateChannelType}
        />
      )}

      {createChannelType && activeServer && (
        <CreateChannelModal
          serverId={activeServer.id}
          type={createChannelType}
          onClose={() => setCreateChannelType(null)}
        />
      )}
    </div>
  );
}
