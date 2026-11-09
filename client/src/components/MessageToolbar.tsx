import { SocketEvents, type MessageDTO } from "@discord-clone/shared";
import EmojiPicker, { type EmojiClickData } from "emoji-picker-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getSocket } from "../socket/socket";
import { useServerStore } from "../store/serverStore";
import AddEmojiModal from "./AddEmojiModal";
import EmojiGlyph from "./EmojiGlyph";

const PICKER_WIDTH = 350;
const PICKER_HEIGHT = 380;
const PICKER_FOOTER_HEIGHT = 48;
const MENU_WIDTH = 210;
const MENU_HEIGHT = 120;
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
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);
  const [showAddEmoji, setShowAddEmoji] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const reactButtonRef = useRef<HTMLButtonElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const customEmojis = useServerStore((s) => s.customEmojis);
  const activeServerId = useServerStore((s) => s.activeServerId);

  // The message list is a scroll container, which clips an absolutely-positioned child (the
  // picker showed up as just an empty strip). Render it fixed to the viewport through a
  // portal instead, anchored to the button and opening upward unless there's no room.
  useLayoutEffect(() => {
    if (!popover) {
      setCoords(null);
      return;
    }
    const anchor = (popover === "picker" ? reactButtonRef : moreButtonRef).current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = popover === "picker" ? PICKER_WIDTH : MENU_WIDTH;
    const height = popover === "picker" ? PICKER_HEIGHT + PICKER_FOOTER_HEIGHT : MENU_HEIGHT;
    const left = Math.min(Math.max(rect.right - width, 8), window.innerWidth - width - 8);
    const above = rect.top - height - 6;
    const top = above >= 8 ? above : Math.min(rect.bottom + 6, window.innerHeight - height - 8);
    setCoords({ left, top });
  }, [popover]);

  useEffect(() => {
    if (!popover) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) setPopover(null);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [popover]);

  function pickEmoji(data: EmojiClickData) {
    // Custom emojis come back with their id (":name:") as `emoji`.
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
          <EmojiGlyph emoji={emoji} />
        </button>
      ))}
      <button ref={reactButtonRef} onClick={() => setPopover(popover === "picker" ? null : "picker")}>
        ☺ React
      </button>
      <button onClick={onReply}>💬 Reply</button>
      <button ref={moreButtonRef} onClick={() => setPopover(popover === "menu" ? null : "menu")} title="More actions">
        ⋮
      </button>

      {popover &&
        coords &&
        createPortal(
          <div ref={popoverRef} className="toolbar-popover" style={{ left: coords.left, top: coords.top }}>
            {popover === "picker" ? (
              <div className="emoji-popover-card">
                <EmojiPicker
                  onEmojiClick={pickEmoji}
                  theme={"dark" as never}
                  width={PICKER_WIDTH}
                  height={PICKER_HEIGHT}
                  customEmojis={customEmojis.map((e) => ({ id: `:${e.name}:`, names: [e.name], imgUrl: e.imageUrl }))}
                />
                <div className="emoji-popover-footer">
                  <button
                    onClick={() => {
                      setPopover(null);
                      setShowAddEmoji(true);
                    }}
                  >
                    Add Emoji
                  </button>
                </div>
              </div>
            ) : (
              <div className="toolbar-menu">
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
          </div>,
          document.body,
        )}

      {showAddEmoji && activeServerId && (
        <AddEmojiModal serverId={activeServerId} onClose={() => setShowAddEmoji(false)} />
      )}
    </div>
  );
}
