import { useEffect, useRef } from "react";
import { useVoiceStore } from "../store/voiceStore";

interface Props {
  socketId: string;
  x: number;
  y: number;
  onClose: () => void;
  onMessage: (userId: string, username: string) => void;
  onCall: (userId: string, username: string) => void;
}

export default function VoicePeerContextMenu({ socketId, x, y, onClose, onMessage, onCall }: Props) {
  // Read the peer live from the store (not a snapshot passed in at open time) so the
  // Mute/Unmute label and volume slider stay in sync with clicks made while this menu
  // is still open, instead of freezing at whatever state it had when it opened.
  const peer = useVoiceStore((s) => s.peers.get(socketId));
  const { setPeerLocalVolume, setPeerLocalMuted } = useVoiceStore();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  if (!peer) return null;

  return (
    <div className="context-menu" ref={ref} style={{ top: y, left: x }} onClick={(e) => e.stopPropagation()}>
      <div className="context-menu-header">{peer.username}</div>

      <div className="context-menu-volume">
        <span>Volume: {peer.localVolume}%</span>
        <input
          type="range"
          min={0}
          max={200}
          value={peer.localVolume}
          onChange={(e) => setPeerLocalVolume(peer.socketId, Number(e.target.value))}
        />
      </div>

      <button
        className="context-menu-item"
        onClick={() => {
          setPeerLocalMuted(peer.socketId, !peer.localMuted);
        }}
      >
        {peer.localMuted ? "Unmute for me" : "Mute for me"}
      </button>

      <button
        className="context-menu-item"
        onClick={() => {
          onMessage(peer.userId, peer.username);
          onClose();
        }}
      >
        Message {peer.username}
      </button>

      <button
        className="context-menu-item"
        onClick={() => {
          onCall(peer.userId, peer.username);
          onClose();
        }}
      >
        Call {peer.username}
      </button>
    </div>
  );
}
