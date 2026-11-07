import { useEffect, useRef } from "react";
import type { RemotePeer } from "../store/voiceStore";
import { useVoiceStore } from "../store/voiceStore";

interface Props {
  peer: RemotePeer;
  x: number;
  y: number;
  onClose: () => void;
  onMessage: (userId: string, username: string) => void;
  onCall: (userId: string, username: string) => void;
}

export default function VoicePeerContextMenu({ peer, x, y, onClose, onMessage, onCall }: Props) {
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
