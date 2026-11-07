import { useEffect, useRef } from "react";
import { useVoiceStore } from "../store/voiceStore";

function RemoteAudio({ stream, volume, muted }: { stream: MediaStream; volume: number; muted: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);

  useEffect(() => {
    if (ref.current) ref.current.volume = Math.min(Math.max(volume, 0), 100) / 100;
  }, [volume]);

  return <audio ref={ref} autoPlay muted={muted} />;
}

/**
 * Renders remote peers' <audio> elements independent of which panel (text vs.
 * voice) is currently visible. Must stay mounted for the lifetime of the voice
 * call — if it lived inside VoiceChannelPanel instead, switching to a text
 * channel while still connected would unmount these tags and silence the call
 * even though the underlying RTCPeerConnections stay alive.
 */
export default function VoiceAudioBridge() {
  const { peers, isDeafened } = useVoiceStore();

  if (isDeafened) return null;

  return (
    <>
      {Array.from(peers.values()).map((peer) =>
        peer.audioStream ? (
          <RemoteAudio
            key={peer.socketId}
            stream={peer.audioStream}
            volume={peer.localVolume}
            muted={peer.localMuted}
          />
        ) : null,
      )}
    </>
  );
}
