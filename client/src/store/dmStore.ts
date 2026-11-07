import type { DirectMessageDTO, DmConversationDTO } from "@discord-clone/shared";
import { create } from "zustand";

export interface IncomingRing {
  conversationId: string;
  callerUserId: string;
  callerUsername: string;
  voiceRoomId: string;
}

interface DmState {
  view: "servers" | "dms";
  conversations: DmConversationDTO[];
  activeConversationId: string | null;
  messagesByConversation: Record<string, DirectMessageDTO[]>;
  typingByConversation: Record<string, Set<string>>;
  incomingRing: IncomingRing | null;
  unreadCounts: Record<string, number>;

  setView: (view: "servers" | "dms") => void;
  setConversations: (conversations: DmConversationDTO[]) => void;
  upsertConversation: (conversation: DmConversationDTO) => void;
  setActiveConversation: (conversationId: string | null) => void;
  setMessages: (conversationId: string, messages: DirectMessageDTO[]) => void;
  addMessage: (message: DirectMessageDTO) => void;
  updateMessage: (conversationId: string, messageId: string, content: string, editedAt: string | null) => void;
  removeMessage: (conversationId: string, messageId: string) => void;
  setTyping: (conversationId: string, userId: string, isTyping: boolean) => void;
  setIncomingRing: (ring: IncomingRing | null) => void;
  incrementUnread: (conversationId: string) => void;
}

export const useDmStore = create<DmState>((set) => ({
  view: "servers",
  conversations: [],
  activeConversationId: null,
  messagesByConversation: {},
  typingByConversation: {},
  incomingRing: null,
  unreadCounts: {},

  setView: (view) => set({ view }),
  setConversations: (conversations) => set({ conversations }),
  upsertConversation: (conversation) =>
    set((s) => {
      const exists = s.conversations.some((c) => c.id === conversation.id);
      return {
        conversations: exists
          ? s.conversations.map((c) => (c.id === conversation.id ? conversation : c))
          : [conversation, ...s.conversations],
      };
    }),
  setActiveConversation: (conversationId) =>
    set((s) => {
      if (!conversationId) return { activeConversationId: conversationId };
      // Opening a conversation is always how it gets read — clear its unread count here
      // so every call site (DM list click, right-click "Message", incoming call accept)
      // gets this for free instead of each needing to remember to clear it.
      const { [conversationId]: _cleared, ...rest } = s.unreadCounts;
      void _cleared;
      return { activeConversationId: conversationId, unreadCounts: rest };
    }),
  setMessages: (conversationId, messages) =>
    set((s) => ({ messagesByConversation: { ...s.messagesByConversation, [conversationId]: messages } })),
  addMessage: (message) =>
    set((s) => {
      const existing = s.messagesByConversation[message.conversationId] ?? [];
      return {
        messagesByConversation: {
          ...s.messagesByConversation,
          [message.conversationId]: [...existing, message],
        },
      };
    }),
  updateMessage: (conversationId, messageId, content, editedAt) =>
    set((s) => {
      const existing = s.messagesByConversation[conversationId] ?? [];
      return {
        messagesByConversation: {
          ...s.messagesByConversation,
          [conversationId]: existing.map((m) => (m.id === messageId ? { ...m, content, editedAt } : m)),
        },
      };
    }),
  removeMessage: (conversationId, messageId) =>
    set((s) => {
      const existing = s.messagesByConversation[conversationId] ?? [];
      return {
        messagesByConversation: {
          ...s.messagesByConversation,
          [conversationId]: existing.filter((m) => m.id !== messageId),
        },
      };
    }),
  setTyping: (conversationId, userId, isTyping) =>
    set((s) => {
      const existing = new Set(s.typingByConversation[conversationId] ?? []);
      if (isTyping) existing.add(userId);
      else existing.delete(userId);
      return { typingByConversation: { ...s.typingByConversation, [conversationId]: existing } };
    }),
  setIncomingRing: (ring) => set({ incomingRing: ring }),

  incrementUnread: (conversationId) =>
    set((s) => ({
      unreadCounts: { ...s.unreadCounts, [conversationId]: (s.unreadCounts[conversationId] ?? 0) + 1 },
    })),
}));
