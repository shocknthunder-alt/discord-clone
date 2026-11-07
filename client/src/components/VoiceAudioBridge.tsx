import { useEffect, useRef } from "react";
import { useVoiceStore } from "../store/voiceStore";

function RemoteAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <audio ref={ref} autoPlay />;
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
        peer.audioStream ? <RemoteAudio key={peer.socketId} stream={peer.audioStream} /> : null,
      )}
    </>
  );
}
