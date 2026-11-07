import type { MessageDTO } from "@discord-clone/shared";
import { create } from "zustand";

interface ChatState {
  messagesByChannel: Record<string, MessageDTO[]>;
  typingByChannel: Record<string, Set<string>>;
  setMessages: (channelId: string, messages: MessageDTO[]) => void;
  addMessage: (message: MessageDTO) => void;
  updateMessage: (channelId: string, messageId: string, content: string, editedAt: string | null) => void;
  removeMessage: (channelId: string, messageId: string) => void;
  setTyping: (channelId: string, userId: string, isTyping: boolean) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messagesByChannel: {},
  typingByChannel: {},
  setMessages: (channelId, messages) =>
    set((s) => ({ messagesByChannel: { ...s.messagesByChannel, [channelId]: messages } })),
  addMessage: (message) =>
    set((s) => {
      const existing = s.messagesByChannel[message.textChannelId] ?? [];
      return {
        messagesByChannel: {
          ...s.messagesByChannel,
          [message.textChannelId]: [...existing, message],
        },
      };
    }),
  updateMessage: (channelId, messageId, content, editedAt) =>
    set((s) => {
      const existing = s.messagesByChannel[channelId] ?? [];
      return {
        messagesByChannel: {
          ...s.messagesByChannel,
          [channelId]: existing.map((m) => (m.id === messageId ? { ...m, content, editedAt } : m)),
        },
      };
    }),
  removeMessage: (channelId, messageId) =>
    set((s) => {
      const existing = s.messagesByChannel[channelId] ?? [];
      return {
        messagesByChannel: {
          ...s.messagesByChannel,
          [channelId]: existing.filter((m) => m.id !== messageId),
        },
      };
    }),
  setTyping: (channelId, userId, isTyping) =>
    set((s) => {
      const existing = new Set(s.typingByChannel[channelId] ?? []);
      if (isTyping) existing.add(userId);
      else existing.delete(userId);
      return { typingByChannel: { ...s.typingByChannel, [channelId]: existing } };
    }),
}));
