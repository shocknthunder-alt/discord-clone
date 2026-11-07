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
}

export const useDmStore = create<DmState>((set) => ({
  view: "servers",
  conversations: [],
  activeConversationId: null,
  messagesByConversation: {},
  typingByConversation: {},
  incomingRing: null,

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
  setActiveConversation: (conversationId) => set({ activeConversationId: conversationId }),
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
}));
