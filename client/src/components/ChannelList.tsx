import { SocketEvents, type TextChannelDTO, type VoiceChannelDTO, type VoicePeerInfo } from "@discord-clone/shared";
import { useState } from "react";
import { fetchChannels, reorderChannels } from "../api/channels.api";
import { startConversationWith } from "../api/dm.api";
import { getSocket } from "../socket/socket";
import { useAuthStore } from "../store/authStore";
import { useDmStore } from "../store/dmStore";
import { useServerStore } from "../store/serverStore";
import { useLayoutLockStore } from "../store/layoutLockStore";
import { useVoiceStore, type RemotePeer } from "../store/voiceStore";
import { resetAllPositions } from "../utils/floatingPositions";
import { voiceStatusIcons } from "../utils/voiceStatus";
import { useVoiceChannel } from "../webrtc/useVoiceChannel";
import { useSpeakingDetection } from "../webrtc/useSpeakingDetection";
import ChannelContextMenu from "./ChannelContextMenu";
import ChannelSettingsModal from "./ChannelSettingsModal";
import CreateChannelModal from "./CreateChannelModal";
import { LiveIcon } from "./HudIcons";
import MusicMiniPlayer from "./MusicMiniPlayer";
import PeerConnectionBadge from "./PeerConnectionBadge";
import ServerSettingsModal from "./ServerSettingsModal";
import UserBar from "./UserBar";
import VoiceChannelIcon from "./VoiceChannelIcon";
import VoiceStatusBar from "./VoiceStatusBar";
import VoicePeerContextMenu from "./VoicePeerContextMenu";

interface Props {
  onSelectText: () => void;
  onSelectVoice: () => void;
}

function ParticipantAvatar({ avatarUrl, name, speaking }: { avatarUrl: string | null; name: string; speaking: boolean }) {
  const className = `participant-avatar ${speaking ? "speaking" : ""}`;
  return avatarUrl ? (
    <img className={className} src={avatarUrl} alt="" />
  ) : (
    <div className={`${className} placeholder`}>{(name || "?").slice(0, 2).toUpperCase()}</div>
  );
}

function ParticipantRow({
  peer,
  onContextMenu,
}: {
  peer: RemotePeer;
  onContextMenu: (e: React.MouseEvent, peer: RemotePeer) => void;
}) {
  const speaking = useSpeakingDetection(peer.audioStream, !peer.isMuted);

  return (
    <div
      className="participant-row clickable"
      onClick={(e) => onContextMenu(e, peer)}
      onContextMenu={(e) => onContextMenu(e, peer)}
    >
      <ParticipantAvatar avatarUrl={peer.avatarUrl} name={peer.username} speaking={speaking} />
      <span
        className={peer.isScreenSharing ? "participant-name streaming" : "participant-name"}
        title={peer.isScreenSharing ? `Sharing ${peer.screenShareLabel ?? "their screen"}` : undefined}
      >
        {peer.isScreenSharing && <LiveIcon size={11} />}{" "}
        {peer.username || "connecting…"}
      </span>
      {voiceStatusIcons(peer.isMuted, peer.isDeafened) && (
        <span className="voice-status-icons"> {voiceStatusIcons(peer.isMuted, peer.isDeafened)}</span>
      )}
      {" "}
      <PeerConnectionBadge quality={peer.connectionQuality} rttMs={peer.rttMs} size={10} />
    </div>
  );
}

function OccupantRow({ occupant }: { occupant: VoicePeerInfo }) {
  return (
    <div className="participant-row">
      <ParticipantAvatar avatarUrl={occupant.avatarUrl} name={occupant.username} speaking={false} />
      <span
        className={occupant.isScreenSharing ? "participant-name streaming" : "participant-name"}
        title={occupant.isScreenSharing ? `Sharing ${occupant.screenShareLabel ?? "their screen"}` : undefined}
      >
        {occupant.isScreenSharing && <LiveIcon size={11} />}{" "}
        {occupant.username}
      </span>
      {voiceStatusIcons(occupant.isMuted, occupant.isDeafened) && (
        <span className="voice-status-icons"> {voiceStatusIcons(occupant.isMuted, occupant.isDeafened)}</span>
      )}
    </div>
  );
}

export default function ChannelList({ onSelectText, onSelectVoice }: Props) {
  const { servers, activeServerId, textChannels, voiceChannels, activeTextChannelId, setActiveTextChannel, setChannels } =
    useServerStore();
  const { activeVoiceChannelId, peers, isScreenSharing, isMuted, isDeafened, localStream, channelOccupants } =
    useVoiceStore();
  const currentAvatarUrl = useAuthStore((s) => s.user?.avatarUrl) ?? null;
  const selfSpeaking = useSpeakingDetection(localStream, !isMuted);
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
  const [editingChannel, setEditingChannel] = useState<
    { kind: "text"; channel: TextChannelDTO } | { kind: "voice"; channel: VoiceChannelDTO } | null
  >(null);
  const { locked } = useLayoutLockStore();
  const [drag, setDrag] = useState<{ kind: "text" | "voice"; id: string } | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const activeServer = servers.find((s) => s.id === activeServerId);
  const isOwner = activeServer?.ownerId === currentUserId;


  // Moves the dragged channel to the position of the one it was dropped on. Applied locally
  // right away, then saved; a failed save just refetches the server's real order.
  async function moveChannel(kind: "text" | "voice", draggedId: string, targetId: string) {
    if (!activeServer || draggedId === targetId) return;
    const list = kind === "text" ? textChannels : voiceChannels;
    const ids = list.map((c) => c.id);
    const from = ids.indexOf(draggedId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);

    const byId = new Map(list.map((c) => [c.id, c]));
    const reordered = ids.map((id, position) => ({ ...byId.get(id)!, position }));
    if (kind === "text") setChannels(reordered as TextChannelDTO[], voiceChannels);
    else setChannels(textChannels, reordered as VoiceChannelDTO[]);

    try {
      await reorderChannels(activeServer.id, kind, ids);
    } catch {
      const fresh = await fetchChannels(activeServer.id);
      setChannels(fresh.textChannels, fresh.voiceChannels);
    }
  }

  function dragProps(kind: "text" | "voice", id: string) {
    if (!isOwner) return {};
    return {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.effectAllowed = "move";
        setDrag({ kind, id });
      },
      onDragOver: (e: React.DragEvent) => {
        if (drag?.kind !== kind) return;
        e.preventDefault();
        setDragOverId(id);
      },
      onDragLeave: () => setDragOverId((current) => (current === id ? null : current)),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        if (drag?.kind === kind) void moveChannel(kind, drag.id, id);
        setDrag(null);
        setDragOverId(null);
      },
      onDragEnd: () => {
        setDrag(null);
        setDragOverId(null);
      },
    };
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
              {!locked && (
                <button
                  className="server-settings-button"
                  onClick={() => {
                    if (window.confirm("Reset all moved icons/buttons back to their default positions?")) {
                      resetAllPositions();
                      window.location.reload();
                    }
                  }}
                  title="Reset icon positions"
                >
                  ↺
                </button>
              )}
              {isOwner && (
                <button className="server-settings-button" onClick={() => setShowServerSettings(true)} title="Server settings">
                  ⚙️
                </button>
              )}
            </div>
            <div style={{ padding: "0 16px", fontSize: 12, color: "var(--t-3)" }}>
              Invite code: {activeServer.inviteCode}
            </div>

            <div onContextMenu={(e) => handleSectionContextMenu(e, "text")}>
              <div className="channel-section">Text Channels</div>
              {textChannels.map((channel) => (
                <div
                  key={channel.id}
                  {...dragProps("text", channel.id)}
                  className={`channel-item ${channel.id === activeTextChannelId ? "active" : ""} ${dragOverId === channel.id && drag?.kind === "text" ? "drag-over" : ""}`}
                  onClick={() => {
                    setActiveTextChannel(channel.id);
                    onSelectText();
                  }}
                >
                  <span className="channel-item-name"># {channel.name}</span>
                  {isOwner && (
                    <button
                      className="channel-item-settings"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingChannel({ kind: "text", channel });
                      }}
                      title="Edit Channel"
                    >
                      ⚙️
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div onContextMenu={(e) => handleSectionContextMenu(e, "voice")}>
              <div className="channel-section">Voice Channels</div>
              {voiceChannels.map((channel) => {
                const isActive = channel.id === activeVoiceChannelId;
                const occupants = isActive ? null : channelOccupants.get(channel.id);
                return (
                  <div key={channel.id}>
                    <div
                      {...dragProps("voice", channel.id)}
                      className={`channel-item ${isActive ? "active" : ""} ${dragOverId === channel.id && drag?.kind === "voice" ? "drag-over" : ""}`}
                      onClick={() => handleVoiceClick(channel.id)}
                    >
                      <span className="channel-item-name">
                        <VoiceChannelIcon /> {channel.name}
                      </span>
                      {isOwner && (
                        <button
                          className="channel-item-settings"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingChannel({ kind: "voice", channel });
                          }}
                          title="Edit Channel"
                        >
                          ⚙️
                        </button>
                      )}
                    </div>
                    {isActive && (
                      <div className="voice-participant-list">
                        {Array.from(peers.values())
                          .filter((peer) => peer.userId)
                          .map((peer) => (
                            <ParticipantRow key={peer.socketId} peer={peer} onContextMenu={handlePeerContextMenu} />
                          ))}
                        <div className="participant-row self">
                          <ParticipantAvatar avatarUrl={currentAvatarUrl} name={currentUsername} speaking={selfSpeaking} />
                          <span className={isScreenSharing ? "participant-name streaming" : "participant-name"}>
                            {isScreenSharing && <LiveIcon size={11} />}{" "}
                            {currentUsername}
                          </span>
                          {voiceStatusIcons(isMuted, isDeafened) && (
                            <span className="voice-status-icons"> {voiceStatusIcons(isMuted, isDeafened)}</span>
                          )}
                        </div>
                      </div>
                    )}
                    {!isActive && occupants && occupants.length > 0 && (
                      <div className="voice-participant-list">
                        {occupants.map((occupant) => (
                          <OccupantRow key={occupant.socketId} occupant={occupant} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <VoiceStatusBar />
      <MusicMiniPlayer />
      {!activeVoiceChannelId && <UserBar />}

      {showServerSettings && activeServer && (
        <ServerSettingsModal server={activeServer} onClose={() => setShowServerSettings(false)} />
      )}

      {editingChannel?.kind === "text" && (
        <ChannelSettingsModal kind="text" channel={editingChannel.channel} onClose={() => setEditingChannel(null)} />
      )}
      {editingChannel?.kind === "voice" && (
        <ChannelSettingsModal kind="voice" channel={editingChannel.channel} onClose={() => setEditingChannel(null)} />
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
