import { SocketEvents, type MessageDTO } from "@discord-clone/shared";
import { useEffect, useRef } from "react";
import { fetchMessages } from "../api/channels.api";
import { getSocket } from "../socket/socket";
import { useAuthStore } from "../store/authStore";
import { useChatStore } from "../store/chatStore";
import { useServerStore } from "../store/serverStore";
import MessageInput from "./MessageInput";

interface Props {
  channelId: string;
}

export default function TextChatView({ channelId }: Props) {
  const { messagesByChannel, typingByChannel, setMessages, addMessage, setTyping } = useChatStore();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const textChannels = useServerStore((s) => s.textChannels);
  const bottomRef = useRef<HTMLDivElement>(null);

  const channel = textChannels.find((c) => c.id === channelId);
  const messages = messagesByChannel[channelId] ?? [];
  const typingUsers = Array.from(typingByChannel[channelId] ?? []).filter((id) => id !== currentUserId);

  useEffect(() => {
    fetchMessages(channelId).then((msgs) => setMessages(channelId, msgs)).catch(console.error);

    const socket = getSocket();
    socket?.emit(SocketEvents.ChannelJoin, { textChannelId: channelId });

    function onMessage(message: MessageDTO) {
      if (message.textChannelId === channelId) {
        addMessage(message);
      }
    }
    function onTyping({ userId, textChannelId, isTyping }: { userId: string; textChannelId: string; isTyping: boolean }) {
      if (textChannelId === channelId) {
        setTyping(textChannelId, userId, isTyping);
      }
    }

    socket?.on(SocketEvents.MessageNew, onMessage);
    socket?.on(SocketEvents.TypingUpdate, onTyping);

    return () => {
      socket?.off(SocketEvents.MessageNew, onMessage);
      socket?.off(SocketEvents.TypingUpdate, onTyping);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <div className="main-content">
      <div className="chat-header"># {channel?.name ?? ""}</div>
      <div className="message-list">
        {messages.map((message) => (
          <div className="message-row" key={message.id}>
            <span className="author">{message.authorId === currentUserId ? "You" : message.authorId.slice(0, 8)}</span>
            <span className="timestamp">{new Date(message.createdAt).toLocaleTimeString()}</span>
            <div>{message.content}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="typing-indicator">
        {typingUsers.length > 0 ? `${typingUsers.length} user(s) typing…` : ""}
      </div>
      <MessageInput channelId={channelId} />
    </div>
  );
}
