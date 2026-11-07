import { SocketEvents } from "@discord-clone/shared";
import { useRef, useState } from "react";
import { startConversationWith } from "../api/dm.api";
import { getSocket } from "../socket/socket";
import { useAuthStore } from "../store/authStore";
import { useDmStore } from "../store/dmStore";
import { useServerStore } from "../store/serverStore";
import { useVoiceStore, type RemotePeer } from "../store/voiceStore";
import { voiceStatusIcons } from "../utils/voiceStatus";
import OwnVoiceControls from "./OwnVoiceControls";
import ScreenSharePlayer from "./ScreenSharePlayer";
import VoiceControlBar from "./VoiceControlBar";
import VoicePeerContextMenu from "./VoicePeerContextMenu";
import { useVoiceChannel } from "../webrtc/useVoiceChannel";

function TileAvatar({ avatarUrl, name }: { avatarUrl: string | null; name: string }) {
  return avatarUrl ? (
    <img className="voice-tile-avatar" src={avatarUrl} alt="" />
  ) : (
    <div className="voice-tile-avatar placeholder">{(name || "?").slice(0, 2).toUpperCase()}</div>
  );
}

export default function VoiceChannelPanel() {
  const { activeVoiceChannelId, peers, isScreenSharing, isMuted, isDeafened } = useVoiceStore();
  const voiceChannels = useServerStore((s) => s.voiceChannels);
  const channel = voiceChannels.find((c) => c.id === activeVoiceChannelId);
  const currentUser = useAuthStore((s) => s.user);
  const currentUsername = currentUser?.username ?? "You";
  const videoRef = useRef<HTMLVideoElement>(null);
  const { joinVoiceChannel, leaveVoiceChannel } = useVoiceChannel();
  const { setView, setActiveConversation, upsertConversation } = useDmStore();
  const [contextMenu, setContextMenu] = useState<{ socketId: string; x: number; y: number } | null>(null);

  const screenSharingPeer = Array.from(peers.values()).find((p) => p.screenStream);

  function focusShare() {
    videoRef.current?.requestFullscreen();
  }

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
        {screenSharingPeer?.screenStream && (
          <ScreenSharePlayer ref={videoRef} stream={screenSharingPeer.screenStream} />
        )}

        <div className="voice-tiles">
          {Array.from(peers.values()).map((peer) => (
            <div className="voice-tile" key={peer.socketId} onContextMenu={(e) => handlePeerContextMenu(e, peer)}>
              <TileAvatar avatarUrl={peer.avatarUrl} name={peer.username} />
              <div>{peer.username || "connecting…"}</div>
              <div>{voiceStatusIcons(peer.isMuted, peer.isDeafened) || "🎤"}</div>
              {peer.isScreenSharing && (
                <button
                  className="screen-share-badge"
                  onClick={focusShare}
                  title="Click to view this screen share fullscreen"
                >
                  🖥️ Live
                </button>
              )}
            </div>
          ))}
          <div className="voice-tile">
            <TileAvatar avatarUrl={currentUser?.avatarUrl ?? null} name={currentUsername} />
            <div>{currentUsername}</div>
            <div>{voiceStatusIcons(isMuted, isDeafened) || "🎤"}</div>
            {isScreenSharing && <div className="screen-share-badge self">🖥️ You're sharing</div>}

            {/* Only the local user sees their own controls here — every client renders its own tile. */}
            <div className="voice-tile-own-controls">
              <OwnVoiceControls />
            </div>
          </div>
        </div>
      </div>
      <VoiceControlBar />

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
