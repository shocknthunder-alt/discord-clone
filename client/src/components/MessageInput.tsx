import { useImageDrop } from "../hooks/useImageDrop";
import { SocketEvents } from "@discord-clone/shared";
import EmojiPicker, { type EmojiClickData } from "emoji-picker-react";
import { useRef, useState } from "react";
import { tr } from "../i18n";
import { isCloudinaryConfigured, uploadImageToCloudinary } from "../api/cloudinary";
import { getSocket } from "../socket/socket";
import VoiceRecorder from "./VoiceRecorder";
import ChatTextarea from "./ChatTextarea";
import GifPicker from "./GifPicker";
import { PollCreateModal } from "./Polls";
import { useServerStore } from "../store/serverStore";

interface Props {
  channelId: string;
  // When set, every message sent through this input attaches to that thread (used by
  // ThreadPanel) instead of posting as a normal top-level channel message.
  replyToId?: string;
  // "Also send to #channel" checkbox — only meaningful (and only rendered) in thread mode.
  showSendToChannelOption?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}

const TYPING_IDLE_MS = 2000;

export default function MessageInput({
  channelId,
  replyToId,
  showSendToChannelOption,
  placeholder,
  autoFocus,
}: Props) {
  const [value, setValue] = useState("");
  const [pendingImage, setPendingImage] = useState<{ file: File | Blob; previewUrl: string } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  // Drag & drop an image/GIF anywhere on this chat → same preview as pasting it.
  useImageDrop(barRef, (file) => {
    setPendingImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return { file, previewUrl: URL.createObjectURL(file) };
    });
  });
  const [uploading, setUploading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [alsoSendToChannel, setAlsoSendToChannel] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const canPoll = useServerStore((s) => !replyToId && s.textChannels.find((c) => c.id === channelId)?.type !== "trivia");
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  function stopTyping() {
    const socket = getSocket();
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    isTypingRef.current = false;
    socket?.emit(SocketEvents.TypingStop, { textChannelId: channelId });
  }

  function handleChange(next: string) {
    setValue(next);
    const socket = getSocket();
    if (!socket) return;

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      socket.emit(SocketEvents.TypingStart, { textChannelId: channelId });
    }

    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(stopTyping, TYPING_IDLE_MS);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (!item) return;

    const file = item.getAsFile();
    if (!file) return;

    e.preventDefault();
    setPendingImage({ file, previewUrl: URL.createObjectURL(file) });
  }

  function removePendingImage() {
    if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
    setPendingImage(null);
  }

  function addEmoji(data: EmojiClickData) {
    setValue((v) => v + data.emoji);
    setShowEmojiPicker(false);
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (uploading) return;
    if (!value.trim() && !pendingImage) return;

    const socket = getSocket();
    if (!socket) return;

    let imageUrl: string | undefined;
    if (pendingImage) {
      setUploading(true);
      try {
        imageUrl = await uploadImageToCloudinary(pendingImage.file);
      } catch (err) {
        console.error("Image upload failed", err);
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    socket.emit(SocketEvents.MessageSend, {
      textChannelId: channelId,
      content: value.trim(),
      imageUrl,
      replyToId,
      alsoSendToChannel: replyToId ? alsoSendToChannel : undefined,
    });

    stopTyping();
    setValue("");
    removePendingImage();
  }

  return (
    <div className="message-input-bar" ref={barRef}>
      {pendingImage && (
        <div className="pending-image-preview">
          <img src={pendingImage.previewUrl} alt="" />
          <button type="button" onClick={removePendingImage} aria-label={tr("Махни снимката", "Remove image")}>
            ✕
          </button>
        </div>
      )}

      {showEmojiPicker && (
        <div className="emoji-picker-popover">
          <EmojiPicker onEmojiClick={addEmoji} theme={(document.documentElement.dataset.mode ?? "dark") as never} />
        </div>
      )}

      <form onSubmit={handleSubmit} className="message-input-form">
        <button
          type="button"
          className="emoji-toggle-button"
          onClick={() => setShowEmojiPicker((v) => !v)}
          aria-label="Emoji"
        >
          🙂
        </button>
        <ChatTextarea
          value={value}
          onChange={handleChange}
          onSubmit={() => void handleSubmit()}
          onPaste={handlePaste}
          autoFocus={autoFocus}
          mentions
          placeholder={
            placeholder ?? (isCloudinaryConfigured() ? tr("Съобщение… (@ за споменаване, Shift+Enter нов ред)", "Message… (@ to mention, Shift+Enter new line)") : tr("Съобщение…", "Message…"))
          }
        />
        {canPoll && (
          <button type="button" className="poll-toggle-button" onClick={() => setPollOpen(true)} title={tr("Нова анкета", "New poll")}>
            📊
          </button>
        )}
        <GifPicker
          onPick={(gif) =>
            getSocket()?.emit(SocketEvents.MessageSend, {
              textChannelId: channelId,
              content: "",
              imageUrl: gif.url,
              replyToId,
              alsoSendToChannel: replyToId ? alsoSendToChannel : undefined,
            })
          }
        />
        <VoiceRecorder
          send={(attachment) =>
            getSocket()?.emit(SocketEvents.MessageSend, {
              textChannelId: channelId,
              content: "",
              imageUrl: attachment,
              replyToId,
              alsoSendToChannel: replyToId ? alsoSendToChannel : undefined,
            })
          }
        />
        <button type="submit" disabled={uploading || (!value.trim() && !pendingImage)}>
          {uploading ? tr("Качване…", "Uploading…") : tr("Прати", "Send")}
        </button>
      </form>

      {pollOpen && <PollCreateModal textChannelId={channelId} onClose={() => setPollOpen(false)} />}

      {showSendToChannelOption && (
        <label className="also-send-checkbox">
          <input type="checkbox" checked={alsoSendToChannel} onChange={(e) => setAlsoSendToChannel(e.target.checked)} />
          {tr("Прати и в канала", "Also send to channel")}
        </label>
      )}
    </div>
  );
}
