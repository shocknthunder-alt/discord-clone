import VoiceChannelIcon from "./VoiceChannelIcon";
import { SocketEvents } from "@discord-clone/shared";
import { useEffect, useRef, useState } from "react";
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
import StreamFrame from "./StreamFrame";
import { useMovableTile } from "../hooks/useMovableTile";
import { SELF_STREAM_KEY, useWatchStore } from "../store/watchStore";

function TileAvatar({ avatarUrl, name, speaking }: { avatarUrl: string | null; name: string; speaking: boolean }) {
  const className = `voice-tile-avatar ${speaking ? "speaking" : ""}`;
  return avatarUrl ? (
    <img className={className} src={avatarUrl} alt="" draggable={false} />
  ) : (
    <div className={`${className} placeholder`}>{(name || "?").slice(0, 2).toUpperCase()}</div>
  );
}

/** Live camera picture inside a voice tile (own preview is mirrored, like a mirror). */
function TileVideo({ stream, mirrored = false }: { stream: MediaStream; mirrored?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    void el.play().catch(() => {});
  }, [stream]);
  return <video ref={ref} className={`voice-tile-video ${mirrored ? "mirrored" : ""}`} autoPlay playsInline muted />;
}

function PeerTile({
  peer,
  onContextMenu,
}: {
  peer: RemotePeer;
  onContextMenu: (e: React.MouseEvent, peer: RemotePeer) => void;
}) {
  const speaking = useSpeakingDetection(peer.audioStream, !peer.isMuted);
  const movable = useMovableTile(`peer-${peer.userId}`);

  return (
    <div
      ref={movable.ref}
      className={`voice-tile clickable ${movable.className}`}
      style={movable.style}
      {...movable.handlers}
      onClick={(e) => onContextMenu(e, peer)}
      onContextMenu={(e) => onContextMenu(e, peer)}
    >
      {peer.cameraStream ? (
        <div className={`voice-tile-video-wrap ${speaking ? "speaking" : ""}`}>
          <TileVideo stream={peer.cameraStream} />
        </div>
      ) : (
        <TileAvatar avatarUrl={peer.avatarUrl} name={peer.username} speaking={speaking} />
      )}
      <div>{peer.username || "connecting…"}</div>
      <div>{voiceStatusIcons(peer.isMuted, peer.isDeafened) || "🎤"}</div>
      <PeerConnectionBadge quality={peer.connectionQuality} rttMs={peer.rttMs} />
      {peer.isScreenSharing && (
        <div className="screen-share-label">
          <LiveIcon size={12} /> Sharing {peer.screenShareLabel ?? "their screen"}
        </div>
      )}
    </div>
  );
}

export default function VoiceChannelPanel() {
  const screenShareNotice = useVoiceStore((s) => s.screenShareNotice);
  const { activeVoiceChannelId, peers, isScreenSharing, isMuted, isDeafened, localStream, localCameraStream } = useVoiceStore();
  const selfMovable = useMovableTile("self");
  const selfSpeaking = useSpeakingDetection(localStream, !isMuted);
  const voiceChannels = useServerStore((s) => s.voiceChannels);
  const channel = voiceChannels.find((c) => c.id === activeVoiceChannelId);
  const currentUser = useAuthStore((s) => s.user);
  const currentUsername = currentUser?.username ?? "You";
  const { joinVoiceChannel, leaveVoiceChannel } = useVoiceChannel();
  const { setView, setActiveConversation, upsertConversation } = useDmStore();
  const [contextMenu, setContextMenu] = useState<{ socketId: string; x: number; y: number } | null>(null);
  const hidden = useWatchStore((s) => s.hidden);
  const hideStream = useWatchStore((s) => s.hide);
  const pruneHidden = useWatchStore((s) => s.prune);

  const localScreenStream = useVoiceStore((s) => s.localScreenStream);

  // Every live share is on screen unless the viewer closed it — your own too (muted preview),
  // so two people sharing see both pictures side by side.
  const streams: { key: string; stream: MediaStream; caption: string; preview: boolean }[] = Array.from(peers.values())
    .filter((p) => p.userId && p.screenStream)
    .map((p) => ({ key: p.socketId, stream: p.screenStream!, caption: p.username || "Live", preview: false }));
  if (isScreenSharing && localScreenStream) {
    streams.push({ key: SELF_STREAM_KEY, stream: localScreenStream, caption: `${currentUsername} (ти)`, preview: true });
  }
  const watched = streams.filter((s) => !hidden.has(s.key));
  const liveKey = streams.map((s) => s.key).join(",");

  useEffect(() => {
    pruneHidden(new Set(liveKey ? liveKey.split(",") : []));
  }, [liveKey, pruneHidden]);

  const n = watched.length;
  const gridCols = n <= 1 ? 1 : n <= 4 ? 2 : 3;
  // Height budget per frame, so 2×2 / 3×N grids still fit next to the tiles below.
  const maxVh = n <= 1 ? 76 : n === 2 ? 64 : n <= 4 ? 36 : 26;

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
      <div className="chat-header">
        <VoiceChannelIcon size={20} /> {channel?.name ?? ""}
      </div>
      <div
        className="voice-panel"
        style={
          channel?.backgroundUrl
            ? {
                backgroundImage: `linear-gradient(rgba(20,21,23,0.45), rgba(20,21,23,0.6)), url(${channel.backgroundUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      >
        {n > 0 && (
          <div className="stream-grid" style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}>
            {watched.map((s) => (
              <StreamFrame key={s.key} caption={s.caption} onStop={() => hideStream(s.key)} maxVh={maxVh}>
                <div className="screen-share-viewer">
                  <ScreenSharePlayer stream={s.stream} preview={s.preview} />
                </div>
              </StreamFrame>
            ))}
          </div>
        )}

        <div className="voice-tiles">
          {Array.from(peers.values())
            .filter((peer) => peer.userId)
            .map((peer) => (
              <PeerTile key={peer.socketId} peer={peer} onContextMenu={handlePeerContextMenu} />
            ))}
          <div ref={selfMovable.ref} className={`voice-tile self ${selfMovable.className}`} style={selfMovable.style} {...selfMovable.handlers}>
            {localCameraStream ? (
              <div className={`voice-tile-video-wrap ${selfSpeaking ? "speaking" : ""}`}>
                <TileVideo stream={localCameraStream} mirrored />
              </div>
            ) : (
              <TileAvatar avatarUrl={currentUser?.avatarUrl ?? null} name={currentUsername} speaking={selfSpeaking} />
            )}
            <div>{currentUsername}</div>
            <div>{voiceStatusIcons(isMuted, isDeafened) || "🎤"}</div>
            {isScreenSharing && (
              <div className="screen-share-badge self">
                <LiveIcon size={12} color="#ffffff" /> You're sharing
              </div>
            )}
            {isScreenSharing && screenShareNotice && <div className="screen-share-notice">{screenShareNotice}</div>}
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
