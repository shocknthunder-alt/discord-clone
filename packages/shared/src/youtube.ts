const YOUTUBE_ID_REGEX = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

export function extractYoutubeId(url: string): string | null {
  const match = url.trim().match(YOUTUBE_ID_REGEX);
  return match ? match[1] : null;
}

const PLAYLIST_ID_REGEX = /[?&]list=([a-zA-Z0-9_-]{10,})/;

/**
 * The playlist id of a YouTube link (`/playlist?list=…` or `watch?v=…&list=…`). Auto-generated
 * "Mix"/radio lists (RD…) and the personal "Liked"/"Watch later" lists can't be read by the API,
 * so they don't count.
 */
export function extractYoutubePlaylistId(url: string): string | null {
  const trimmed = url.trim();
  if (!/youtube\.com|youtu\.be/i.test(trimmed)) return null;
  const id = trimmed.match(PLAYLIST_ID_REGEX)?.[1] ?? null;
  if (!id || id.startsWith("RD") || id === "LL" || id === "WL") return null;
  return id;
}
