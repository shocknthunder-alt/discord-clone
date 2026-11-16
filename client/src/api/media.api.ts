import type { GifDTO, LinkPreviewDTO, MessageDTO } from "@discord-clone/shared";
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
