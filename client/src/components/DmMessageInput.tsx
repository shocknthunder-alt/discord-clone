import { useImageDrop } from "../hooks/useImageDrop";
import { SocketEvents } from "@discord-clone/shared";
import EmojiPicker, { type EmojiClickData } from "emoji-picker-react";
import { useRef, useState } from "react";
import { isCloudinaryConfigured, uploadImageToCloudinary } from "../api/cloudinary";
import { getSocket } from "../socket/socket";
import { tr } from "../i18n";
import VoiceRecorder from "./VoiceRecorder";
import ChatTextarea from "./ChatTextarea";
import GifPicker from "./GifPicker";

interface Props {
  conversationId: string;
}

const TYPING_IDLE_MS = 2000;

export default function DmMessageInput({ conversationId }: Props) {
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
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  function stopTyping() {
    const socket = getSocket();
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    isTypingRef.current = false;
    socket?.emit(SocketEvents.DmTypingStop, { conversationId });
  }

  function handleChange(next: string) {
    setValue(next);
    const socket = getSocket();
    if (!socket) return;

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      socket.emit(SocketEvents.DmTypingStart, { conversationId });
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

    socket.emit(SocketEvents.DmSend, { conversationId, content: value.trim(), imageUrl });

    stopTyping();
    setValue("");
    removePendingImage();
  }

  return (
    <div className="message-input-bar" ref={barRef}>
      {pendingImage && (
        <div className="pending-image-preview">
          <img src={pendingImage.previewUrl} alt="Pasted" />
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
          placeholder={isCloudinaryConfigured() ? tr("Съобщение… (постави или провлачи снимка/GIF)", "Message… (paste or drop a picture/GIF)") : tr("Съобщение…", "Message…")}
        />
        <GifPicker onPick={(gif) => getSocket()?.emit(SocketEvents.DmSend, { conversationId, content: "", imageUrl: gif.url })} />
        <VoiceRecorder
          send={(attachment) => getSocket()?.emit(SocketEvents.DmSend, { conversationId, content: "", imageUrl: attachment })}
        />
        <button type="submit" disabled={uploading || (!value.trim() && !pendingImage)}>
          {uploading ? tr("Качване…", "Uploading…") : tr("Прати", "Send")}
        </button>
      </form>
    </div>
  );
}
