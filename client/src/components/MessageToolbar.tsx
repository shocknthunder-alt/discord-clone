import { SocketEvents, type MessageDTO } from "@discord-clone/shared";
import EmojiPicker, { type EmojiClickData } from "emoji-picker-react";
import { useEffect, useRef, useState } from "react";
import { getSocket } from "../socket/socket";

const QUICK_REACTIONS = ["✅", "👀", "🙌"];

interface Props {
  message: MessageDTO;
  isOwn: boolean;
  onReply: () => void;
  onEdit: () => void;
}

function sendReaction(messageId: string, emoji: string) {
  getSocket()?.emit(SocketEvents.MessageReact, { messageId, emoji });
}

export default function MessageToolbar({ message, isOwn, onReply, onEdit }: Props) {
  const [popover, setPopover] = useState<"picker" | "menu" | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!popover) return;
    function onMouseDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setPopover(null);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [popover]);

  function pickEmoji(data: EmojiClickData) {
    sendReaction(message.id, data.emoji);
    setPopover(null);
  }

  function handleDelete() {
    setPopover(null);
    if (!window.confirm("Delete this message?")) return;
    getSocket()?.emit(SocketEvents.MessageDelete, { messageId: message.id });
  }

  return (
    <div ref={rootRef} className={`message-toolbar ${popover ? "open" : ""}`}>
      {QUICK_REACTIONS.map((emoji) => (
        <button key={emoji} className="toolbar-emoji" onClick={() => sendReaction(message.id, emoji)}>
          {emoji}
        </button>
      ))}
      <button className="toolbar-text-button" onClick={() => setPopover(popover === "picker" ? null : "picker")}>
        ☺ React
      </button>
      <button className="toolbar-text-button" onClick={onReply}>
        💬 Reply
      </button>
      <button className="toolbar-more" onClick={() => setPopover(popover === "menu" ? null : "menu")} title="More actions">
        ⋮
      </button>

      {popover === "picker" && (
        <div className="toolbar-popover">
          <EmojiPicker onEmojiClick={pickEmoji} theme={"dark" as never} />
        </div>
      )}

      {popover === "menu" && (
        <div className="toolbar-popover toolbar-menu">
          {isOwn && message.content && (
            <button
              onClick={() => {
                setPopover(null);
                onEdit();
              }}
            >
              Edit message
            </button>
          )}
          {message.content && (
            <button
              onClick={() => {
                void navigator.clipboard.writeText(message.content);
                setPopover(null);
              }}
            >
              Copy message
            </button>
          )}
          {isOwn && (
            <button className="danger" onClick={handleDelete}>
              Delete message…
            </button>
          )}
        </div>
      )}
    </div>
  );
}
