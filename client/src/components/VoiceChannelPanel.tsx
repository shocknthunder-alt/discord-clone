import { useRef } from "react";
import { useAuthStore } from "../store/authStore";
import { useServerStore } from "../store/serverStore";
import { useVoiceStore } from "../store/voiceStore";
import { voiceStatusIcons } from "../utils/voiceStatus";
import ScreenSharePlayer from "./ScreenSharePlayer";
import VoiceControlBar from "./VoiceControlBar";

export default function VoiceChannelPanel() {
  const { activeVoiceChannelId, peers, isScreenSharing, isMuted, isDeafened } = useVoiceStore();
  const voiceChannels = useServerStore((s) => s.voiceChannels);
  const channel = voiceChannels.find((c) => c.id === activeVoiceChannelId);
  const currentUsername = useAuthStore((s) => s.user?.username) ?? "You";
  const videoRef = useRef<HTMLVideoElement>(null);

  const screenSharingPeer = Array.from(peers.values()).find((p) => p.screenStream);

  function focusShare() {
    videoRef.current?.requestFullscreen();
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
            <div className="voice-tile" key={peer.socketId}>
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
            <div>{currentUsername}</div>
            <div>{voiceStatusIcons(isMuted, isDeafened) || "🎤"}</div>
            {isScreenSharing && <div className="screen-share-badge self">🖥️ You're sharing</div>}
          </div>
        </div>
      </div>
      <VoiceControlBar />
    </div>
  );
}
