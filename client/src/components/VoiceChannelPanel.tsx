import { useAuthStore } from "../store/authStore";
import { useServerStore } from "../store/serverStore";
import { useVoiceStore } from "../store/voiceStore";
import ScreenSharePlayer from "./ScreenSharePlayer";
import VoiceControlBar from "./VoiceControlBar";

export default function VoiceChannelPanel() {
  const { activeVoiceChannelId, peers } = useVoiceStore();
  const voiceChannels = useServerStore((s) => s.voiceChannels);
  const channel = voiceChannels.find((c) => c.id === activeVoiceChannelId);
  const currentUsername = useAuthStore((s) => s.user?.username) ?? "You";

  const screenSharingPeer = Array.from(peers.values()).find((p) => p.screenStream);

  return (
    <div className="main-content">
      <div className="chat-header">🔊 {channel?.name ?? ""}</div>
      <div className="voice-panel">
        {screenSharingPeer?.screenStream && <ScreenSharePlayer stream={screenSharingPeer.screenStream} />}

        <div className="voice-tiles">
          {Array.from(peers.values()).map((peer) => (
            <div className="voice-tile" key={peer.socketId}>
              <div>{peer.username || "connecting…"}</div>
              <div>{peer.isMuted ? "🔇" : "🎤"}</div>
            </div>
          ))}
          <div className="voice-tile">
            <div>{currentUsername}</div>
          </div>
        </div>
      </div>
      <VoiceControlBar />
    </div>
  );
}
