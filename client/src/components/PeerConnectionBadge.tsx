import type { ConnectionQuality } from "../store/voiceStore";
import { SignalIcon } from "./VoiceStatusBar";

interface Props {
  quality: ConnectionQuality;
  rttMs: number | null;
  size?: number;
}

const QUALITY_LABEL: Record<ConnectionQuality, string> = {
  good: "Excellent",
  medium: "Fair",
  poor: "Poor",
  unknown: "Connecting…",
};

export default function PeerConnectionBadge({ quality, rttMs, size = 12 }: Props) {
  return (
    <span className="peer-connection-badge" title={`${QUALITY_LABEL[quality]}${rttMs !== null ? ` — ${rttMs}ms` : ""}`}>
      <SignalIcon quality={quality} size={size} />
      {rttMs !== null && <span className="peer-connection-ms">{rttMs}ms</span>}
    </span>
  );
}
