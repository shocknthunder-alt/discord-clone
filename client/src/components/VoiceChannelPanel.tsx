import { SocketEvents } from "@discord-clone/shared";
import { useEffect, useState } from "react";
import { startConversationWith } from "../api/dm.api";
import { getSocket } from "../socket/socket";
import { useAuthStore } from "../store/authStore";
import { useDmStore } from "../store/dmStore";
import { useServerStore } from "../store/serverStore";
import { useVoiceStore, type RemotePeer } from "../store/voiceStore";
import { voiceStatusIcons } from "../utils/voiceStatus";
import PeerConnectionBadge from "./PeerConnectionBadge";
import ScreenSharePlayer from "./ScreenSharePlayer";
import VoicePeerContextMenu from "./VoicePeerContextMenu";
import { useVoiceChannel } from "../webrtc/useVoiceChannel";
import { useSpeakingDetection } from "../webrtc/useSpeakingDetection";
import { LiveIcon } from "./HudIcons";

function TileAvatar({ avatarUrl, name, speaking }: { avatarUrl: string | null; name: string; speaking: boolean }) {
  const className = `voice-tile-avatar ${speaking ? "speaking" : ""}`;
  return avatarUrl ? (
    <img className={className} src={avatarUrl} alt="" />
  ) : (
    <div className={`${className} placeholder`}>{(name || "?").slice(0, 2).toUpperCase()}</div>
  );
}

function PeerTile({
  peer,
  onContextMenu,
  onWatch,
}: {
  peer: RemotePeer;
  onContextMenu: (e: React.MouseEvent, peer: RemotePeer) => void;
  onWatch: (socketId: string) => void;
}) {
  const speaking = useSpeakingDetection(peer.audioStream, !peer.isMuted);

  return (
    <div className="voice-tile" onContextMenu={(e) => onContextMenu(e, peer)}>
      <TileAvatar avatarUrl={peer.avatarUrl} name={peer.username} speaking={speaking} />
      <div>{peer.username || "connecting…"}</div>
      <div>{voiceStatusIcons(peer.isMuted, peer.isDeafened) || "🎤"}</div>
      <PeerConnectionBadge quality={peer.connectionQuality} rttMs={peer.rttMs} />
      {peer.isScreenSharing && (
        <>
          <div className="screen-share-label">
            <LiveIcon size={12} /> Sharing {peer.screenShareLabel ?? "their screen"}
          </div>
          {peer.screenStream && (
            <button className="screen-share-badge" onClick={() => onWatch(peer.socketId)} title="Watch this screen share">
              Watch Stream
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default function VoiceChannelPanel() {
  const { activeVoiceChannelId, peers, isScreenSharing, isMuted, isDeafened, localStream } = useVoiceStore();
  const selfSpeaking = useSpeakingDetection(localStream, !isMuted);
  const voiceChannels = useServerStore((s) => s.voiceChannels);
  const channel = voiceChannels.find((c) => c.id === activeVoiceChannelId);
  const currentUser = useAuthStore((s) => s.user);
  const currentUsername = currentUser?.username ?? "You";
  const { joinVoiceChannel, leaveVoiceChannel } = useVoiceChannel();
  const { setView, setActiveConversation, upsertConversation } = useDmStore();
  const [contextMenu, setContextMenu] = useState<{ socketId: string; x: number; y: number } | null>(null);
  const [watchingSocketId, setWatchingSocketId] = useState<string | null>(null);

  const watchedPeer = watchingSocketId ? peers.get(watchingSocketId) : undefined;
  const watchedStream = watchedPeer?.screenStream ?? null;

  useEffect(() => {
    if (watchingSocketId && !watchedStream) setWatchingSocketId(null);
  }, [watchingSocketId, watchedStream]);

  function handlePeerContextMenu(e: React.MouseEvent, peer: RemotePeer) {
    e.preventDefault();
    if (!peer.userId) return;
    setContextMenu({ socketId: peer.socketId, x: e.clientX, y: e.clientY });
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
    <div className="main-content">
      <div className="chat-header">🔊 {channel?.name ?? ""}</div>
      <div className="voice-panel">
        {watchedStream && (
          <div className="screen-share-viewer">
            <button
              className="stop-watching-button"
              onClick={() => setWatchingSocketId(null)}
              title="Stop watching this stream"
            >
              Stop Watching
            </button>
            <ScreenSharePlayer stream={watchedStream} />
          </div>
        )}

        <div className="voice-tiles">
          {Array.from(peers.values())
            .filter((peer) => peer.userId)
            .map((peer) => (
              <PeerTile
                key={peer.socketId}
                peer={peer}
                onContextMenu={handlePeerContextMenu}
                onWatch={setWatchingSocketId}
              />
            ))}
          <div className="voice-tile">
            <TileAvatar avatarUrl={currentUser?.avatarUrl ?? null} name={currentUsername} speaking={selfSpeaking} />
            <div>{currentUsername}</div>
            <div>{voiceStatusIcons(isMuted, isDeafened) || "🎤"}</div>
            {isScreenSharing && (
              <div className="screen-share-badge self">
                <LiveIcon size={12} color="#ffffff" /> You're sharing
              </div>
            )}
          </div>
        </div>
      </div>

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
    </div>
  );
}
