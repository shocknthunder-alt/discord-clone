import { SocketEvents } from "@discord-clone/shared";
import { useRef, useState } from "react";
import { getSocket } from "../socket/socket";

interface Props {
  channelId: string;
}

const TYPING_IDLE_MS = 2000;

export default function MessageInput({ channelId }: Props) {
  const [value, setValue] = useState("");
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setValue(e.target.value);
    const socket = getSocket();
    if (!socket) return;

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      socket.emit(SocketEvents.TypingStart, { textChannelId: channelId });
    }

    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      isTypingRef.current = false;
      socket.emit(SocketEvents.TypingStop, { textChannelId: channelId });
    }, TYPING_IDLE_MS);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    const socket = getSocket();
    socket?.emit(SocketEvents.MessageSend, { textChannelId: channelId, content: value.trim() });

    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    isTypingRef.current = false;
    socket?.emit(SocketEvents.TypingStop, { textChannelId: channelId });

    setValue("");
  }

  return (
    <form className="message-input-bar" onSubmit={handleSubmit}>
      <input value={value} onChange={handleChange} placeholder="Message…" />
    </form>
  );
}
