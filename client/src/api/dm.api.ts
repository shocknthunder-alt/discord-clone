import type { DirectMessageDTO, DmConversationDTO } from "@discord-clone/shared";
import { http } from "./http";

export function fetchConversations() {
  return http.get<{ conversations: DmConversationDTO[] }>("/api/dms").then((r) => r.data.conversations);
}

export function startConversationWith(userId: string) {
  return http.post<{ conversation: DmConversationDTO }>(`/api/dms/with/${userId}`).then((r) => r.data.conversation);
}

export function fetchDmMessages(conversationId: string, cursor?: string) {
  return http
    .get<{ messages: DirectMessageDTO[] }>(`/api/dms/${conversationId}/messages`, {
      params: cursor ? { cursor } : undefined,
    })
    .then((r) => r.data.messages);
}
