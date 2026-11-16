import type { ForumPostDTO, GifDTO, LinkPreviewDTO, MessageDTO, StickerDTO } from "@discord-clone/shared";
import { http } from "./http";

const previewCache = new Map<string, Promise<LinkPreviewDTO | null>>();

/** Link preview card (cached for the session; null = nothing to show). */
export function fetchLinkPreview(url: string): Promise<LinkPreviewDTO | null> {
  let p = previewCache.get(url);
  if (!p) {
    p = http
      .get<{ preview: LinkPreviewDTO | null }>("/api/media/unfurl", { params: { url } })
      .then((r) => r.data.preview)
      .catch(() => null);
    previewCache.set(url, p);
  }
  return p;
}

let gifStatus: Promise<boolean> | null = null;
/** Is GIF search configured on the server (GIPHY key)? Older servers → false. */
export function gifsEnabled(): Promise<boolean> {
  if (!gifStatus) {
    gifStatus = http
      .get<{ enabled: boolean }>("/api/media/gifs/status")
      .then((r) => !!r.data.enabled)
      .catch(() => false);
  }
  return gifStatus;
}

export function searchGifs(q: string, offset = 0) {
  return http
    .get<{ gifs: GifDTO[]; nextOffset: number | null }>("/api/media/gifs/search", { params: { q, offset } })
    .then((r) => r.data);
}

export function fetchPins(channelId: string) {
  return http.get<{ messages: MessageDTO[] }>(`/api/text-channels/${channelId}/pins`).then((r) => r.data.messages);
}

export function fetchForumPosts(channelId: string) {
  return http.get<{ posts: ForumPostDTO[] }>(`/api/text-channels/${channelId}/forum`).then((r) => r.data.posts);
}

export function fetchThread(messageId: string) {
  return http.get<{ root: MessageDTO; replies: MessageDTO[] }>(`/api/messages/${messageId}/thread`).then((r) => r.data);
}

export function fetchStickers(serverId: string) {
  return http.get<{ stickers: StickerDTO[] }>(`/api/servers/${serverId}/stickers`).then((r) => r.data.stickers);
}

export function createSticker(serverId: string, name: string, imageUrl: string) {
  return http.post<{ sticker: StickerDTO }>(`/api/servers/${serverId}/stickers`, { name, imageUrl }).then((r) => r.data.sticker);
}

export function deleteSticker(serverId: string, stickerId: string) {
  return http.delete(`/api/servers/${serverId}/stickers/${stickerId}`);
}
