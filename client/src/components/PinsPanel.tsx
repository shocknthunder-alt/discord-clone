import { SocketEvents, type MessageDTO } from "@discord-clone/shared";
import { useEffect, useRef, useState } from "react";
import { fetchPins } from "../api/media.api";
import { getSocket } from "../socket/socket";
import { useChatStore } from "../store/chatStore";
import { formatTime } from "../utils/appPrefs";
import { tr } from "../i18n";
import ChatImage from "./ChatImage";
import MessageText from "./MessageText";

/** 📌 The channel's pinned messages (drop-down under the chat header). */
export default function PinsPanel({ channelId, onClose }: { channelId: string; onClose: () => void }) {
  const [pins, setPins] = useState<MessageDTO[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Reload when something gets pinned/unpinned in this channel while it's open.
  const [pinKey, setPinKey] = useState(0);
  useEffect(() => {
    const socket = getSocket();
    const onPinned = (p: { textChannelId: string }) => {
      if (p.textChannelId === channelId) setPinKey((k) => k + 1);
    };
    socket?.on(SocketEvents.MessagePinned, onPinned);
    return () => {
      socket?.off(SocketEvents.MessagePinned, onPinned);
    };
  }, [channelId]);
  useEffect(() => {
    let alive = true;
    fetchPins(channelId)
      .then((p) => alive && setPins(p))
      .catch(() => alive && setPins([]));
    return () => {
      alive = false;
    };
  }, [channelId, pinKey]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (ref.current?.contains(t) || t.closest(".pins-toggle")) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  function jump(m: MessageDTO) {
    useChatStore.getState().setJumpTarget({ channelId, messageId: m.id, rootId: m.replyTo?.id ?? null });
    onClose();
  }

  return (
    <div className="pins-panel" ref={ref}>
      <div className="pins-panel-header">📌 {tr("Закачени съобщения", "Pinned messages")}</div>
      <div className="pins-panel-list">
        {pins === null && <div className="pins-empty">{tr("Зареждам…", "Loading…")}</div>}
        {pins?.length === 0 && (
          <div className="pins-empty">
            {tr("Още няма закачени. Посочи съобщение → ⋮ → 📌 Закачи в канала.", "Nothing pinned yet. Hover a message → ⋮ → 📌 Pin message.")}
          </div>
        )}
        {pins?.map((m) => (
          <div key={m.id} className="pin-item">
            <div className="pin-item-head">
              <span className="author">{m.authorUsername}</span>
              <span className="timestamp">{formatTime(m.createdAt)}</span>
              <span className="pin-item-actions">
                <button onClick={() => jump(m)}>{tr("Отиди", "Jump")}</button>
                <button
                  onClick={() => getSocket()?.emit(SocketEvents.MessagePin, { messageId: m.id, pinned: false })}
                  title={tr("Откачи", "Unpin")}
                >
                  ✕
                </button>
              </span>
            </div>
            {m.content && <MessageText text={m.content} />}
            {m.imageUrl && <ChatImage url={m.imageUrl} />}
            {m.pinnedByUsername && (
              <div className="pin-item-by">
                📌 {tr("закачи", "pinned by")} {m.pinnedByUsername}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
