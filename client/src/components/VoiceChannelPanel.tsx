import { useEffect, useRef } from "react";
import { useServerStore } from "../store/serverStore";
import { useVoiceStore } from "../store/voiceStore";
import ScreenSharePlayer from "./ScreenSharePlayer";
import VoiceControlBar from "./VoiceControlBar";

function RemoteAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <audio ref={ref} autoPlay />;
}

export default function VoiceChannelPanel() {
  const { activeVoiceChannelId, peers, isDeafened } = useVoiceStore();
  const voiceChannels = useServerStore((s) => s.voiceChannels);
  const channel = voiceChannels.find((c) => c.id === activeVoiceChannelId);

  const screenSharingPeer = Array.from(peers.values()).find((p) => p.screenStream);

  return (
    <div className="main-content">
      <div className="chat-header">🔊 {channel?.name ?? ""}</div>
      <div className="voice-panel">
        {screenSharingPeer?.screenStream && <ScreenSharePlayer stream={screenSharingPeer.screenStream} />}

        <div className="voice-tiles">
          {Array.from(peers.values()).map((peer) => (
            <div className="voice-tile" key={peer.socketId}>
              <div>{peer.userId.slice(0, 8) || "connecting…"}</div>
              <div>{peer.isMuted ? "🔇" : "🎤"}</div>
              {peer.audioStream && !isDeafened && <RemoteAudio stream={peer.audioStream} />}
            </div>
          ))}
          <div className="voice-tile">
            <div>You</div>
          </div>
        </div>
      </div>
      <VoiceControlBar />
    </div>
  );
}
