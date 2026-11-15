import { extractYoutubeId, extractYoutubePlaylistId, SocketEvents, type MusicQueueItem, type MusicState } from "@discord-clone/shared";
import { randomUUID } from "node:crypto";
import type { Server as IOServer, Socket } from "socket.io";
import { env } from "../env.js";
import {
  getSubsonicAlbumSongs,
  getSubsonicSong,
  isSubsonicUrl,
  subsonicEnabled,
  subsonicStreamUrl,
  type SubsonicSong,
} from "../music/subsonic.js";

const LOOKS_LIKE_URL = /^https?:\/\//i;

// No API key needed for this — oEmbed is YouTube's public, keyless metadata endpoint. Good
// enough for title + thumbnail on paste; search-by-title (below) is the one that actually
// needs the Data API v3 key, since oEmbed only resolves a URL you already have.
async function fetchOEmbed(videoId: string): Promise<{ title: string; thumbnailUrl: string } | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string; thumbnail_url?: string };
    if (!data.title) return null;
    return { title: data.title, thumbnailUrl: data.thumbnail_url ?? "" };
  } catch {
    return null;
  }
}

async function searchYoutube(query: string): Promise<{ videoId: string; title: string; thumbnailUrl: string } | null> {
  if (!env.YOUTUBE_API_KEY) return null;
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q=${encodeURIComponent(query)}&key=${env.YOUTUBE_API_KEY}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      items?: { id?: { videoId?: string }; snippet?: { title?: string; thumbnails?: { medium?: { url?: string } } } }[];
    };
    const first = data.items?.[0];
    const videoId = first?.id?.videoId;
    const title = first?.snippet?.title;
    if (!videoId || !title) return null;
    return { videoId, title, thumbnailUrl: first?.snippet?.thumbnails?.medium?.url ?? "" };
  } catch {
    return null;
  }
}

const PLAYLIST_MAX = 100;

type Resolved = {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  source?: "youtube" | "subsonic";
  streamUrl?: string;
  durationSeconds?: number;
};

/**
 * Every playable video of a playlist, in order (max 100). Needs the Data API key, like search.
 * Private/deleted entries are skipped. Returns null when the list can't be read at all.
 */
async function fetchPlaylist(playlistId: string): Promise<Resolved[] | null> {
  if (!env.YOUTUBE_API_KEY) return null;
  const out: Resolved[] = [];
  let pageToken = "";
  try {
    while (out.length < PLAYLIST_MAX) {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,status&maxResults=50&playlistId=${encodeURIComponent(playlistId)}&key=${env.YOUTUBE_API_KEY}${pageToken ? `&pageToken=${pageToken}` : ""}`,
      );
      if (!res.ok) return out.length ? out : null;
      const data = (await res.json()) as {
        nextPageToken?: string;
        items?: {
          snippet?: { title?: string; resourceId?: { videoId?: string }; thumbnails?: { medium?: { url?: string } } };
          status?: { privacyStatus?: string };
        }[];
      };
      for (const it of data.items ?? []) {
        const videoId = it.snippet?.resourceId?.videoId;
        const title = it.snippet?.title;
        const privacy = it.status?.privacyStatus;
        if (!videoId || !title || privacy === "private" || privacy === "privacyStatusUnspecified") continue;
        if (title === "Deleted video" || title === "Private video") continue;
        out.push({ videoId, title, thumbnailUrl: it.snippet?.thumbnails?.medium?.url ?? "" });
        if (out.length >= PLAYLIST_MAX) break;
      }
      if (!data.nextPageToken) break;
      pageToken = data.nextPageToken;
    }
    return out;
  } catch {
    return out.length ? out : null;
  }
}

function roomName(voiceChannelId: string) {
  return `voice:${voiceChannelId}`;
}

function emptyState(): MusicState {
  return { queue: [], currentIndex: 0, isPlaying: false, positionSeconds: 0, updatedAt: Date.now() };
}

const musicStates = new Map<string, MusicState>();

/**
 * Listeners work out "where are we in the song" as positionSeconds + (now - updatedAt) while
 * playing. Anything that bumps updatedAt WITHOUT folding the elapsed time into positionSeconds
 * first makes every client think the song is back at its old position and seek there — which is
 * exactly the "song restarts when someone adds another one" bug. Call this before touching a
 * playing state.
 */
function settlePosition(state: MusicState) {
  if (state.isPlaying) state.positionSeconds += (Date.now() - state.updatedAt) / 1000;
  state.updatedAt = Date.now();
}

/**
 * A song that finished (or was skipped) leaves the list, together with anything before it, and the
 * next one becomes the current one. Older servers kept played songs and only moved the index.
 */
function dropPlayed(state: MusicState) {
  state.queue.splice(0, Math.min(state.currentIndex + 1, state.queue.length));
  state.currentIndex = 0;
}

function getOrCreateState(voiceChannelId: string): MusicState {
  let state = musicStates.get(voiceChannelId);
  if (!state) {
    state = emptyState();
    musicStates.set(voiceChannelId, state);
  }
  return state;
}

function broadcastState(io: IOServer, voiceChannelId: string, state: MusicState) {
  io.to(roomName(voiceChannelId)).emit(SocketEvents.MusicState, { voiceChannelId, state });
}

export function registerMusicGateway(io: IOServer, socket: Socket) {
  const username: string = socket.data.username;

  // Piggybacks on voice.gateway's own "voice:join" handling — socket.io allows multiple
  // listeners per event, and by the time this fires the socket has already joined
  // `voice:<id>` there, so no separate room bookkeeping is needed here.
  socket.on(SocketEvents.VoiceJoin, ({ voiceChannelId }: { voiceChannelId: string }) => {
    const state = musicStates.get(voiceChannelId);
    if (state) socket.emit(SocketEvents.MusicState, { voiceChannelId, state });
  });

  socket.on(SocketEvents.MusicAdd, async ({ voiceChannelId, url }: { voiceChannelId: string; url: string }) => {
    const trimmed = (url ?? "").trim();
    const videoId = extractYoutubeId(trimmed);
    const playlistId = extractYoutubePlaylistId(trimmed);

    // A playlist link (or a video opened inside a playlist): queue the whole list, starting from
    // that video when there is one. Falls back to the single video if the list can't be read.
    if (playlistId) {
      const items = await fetchPlaylist(playlistId);
      if (items && items.length > 0) {
        const from = videoId ? Math.max(0, items.findIndex((i) => i.videoId === videoId)) : 0;
        addToQueue(voiceChannelId, items.slice(from));
        return;
      }
      if (!videoId) {
        socket.emit(SocketEvents.MusicAddError, { reason: env.YOUTUBE_API_KEY ? "playlist-unavailable" : "playlist-needs-key" });
        return;
      }
    }

    let resolved: Resolved | null = null;

    if (videoId) {
      // A real YouTube link — oEmbed is keyless and sufficient, no search needed.
      const meta = await fetchOEmbed(videoId);
      resolved = meta ? { videoId, title: meta.title, thumbnailUrl: meta.thumbnailUrl } : null;
      if (!resolved) {
        socket.emit(SocketEvents.MusicAddError, { reason: "lookup-failed" });
        return;
      }
    } else if (LOOKS_LIKE_URL.test(trimmed)) {
      // Looks like a URL but not one we could parse a video id out of (wrong site, or a
      // malformed YouTube link) — don't search for the literal URL text, that's never useful.
      socket.emit(SocketEvents.MusicAddError, { reason: "invalid-url" });
      return;
    } else if (!trimmed) {
      socket.emit(SocketEvents.MusicAddError, { reason: "invalid-url" });
      return;
    } else {
      // Plain text — treat it as a title search.
      resolved = await searchYoutube(trimmed);
      if (!resolved) {
        socket.emit(SocketEvents.MusicAddError, {
          reason: env.YOUTUBE_API_KEY ? "not-found" : "search-unavailable",
        });
        return;
      }
    }

    addToQueue(voiceChannelId, [resolved]);
  });

  // Songs from the music server (yogurthub): picked in the 🎧 search, by id or a whole album.
  // Resolved here (not trusted from the client) so titles/stream links are the server's own.
  socket.on(
    SocketEvents.MusicAddTracks,
    async ({
      voiceChannelId,
      tracks,
      trackIds,
      albumId,
    }: {
      voiceChannelId: string;
      tracks?: { id?: unknown; title?: unknown; artist?: unknown; durationSeconds?: unknown; coverUrl?: unknown }[];
      trackIds?: string[];
      albumId?: string;
    }) => {
      if (!voiceChannelId || !subsonicEnabled()) {
        socket.emit(SocketEvents.MusicAddError, { reason: "subsonic-unavailable" });
        return;
      }
      // Usual path: the player already looked the songs up on the music server itself (Render
      // can't reach it through Cloudflare) — take id + labels, build the stream link here.
      if (Array.isArray(tracks)) {
        const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
        const items = tracks
          .slice(0, PLAYLIST_MAX)
          .filter((t) => typeof t?.id === "string" && t.id && (t.id as string).length < 200)
          .map((t) => {
            const title = str(t.title, 200) || "?";
            const artist = str(t.artist, 200);
            return {
              videoId: "",
              title: artist ? `${artist} — ${title}` : title,
              thumbnailUrl: isSubsonicUrl(t.coverUrl) ? t.coverUrl : "",
              source: "subsonic" as const,
              streamUrl: subsonicStreamUrl(t.id as string),
              durationSeconds: Math.max(0, Math.min(Number(t.durationSeconds) || 0, 24 * 3600)),
            };
          });
        if (items.length === 0) socket.emit(SocketEvents.MusicAddError, { reason: "not-found" });
        else addToQueue(voiceChannelId, items);
        return;
      }
      try {
        const songs: SubsonicSong[] = [];
        if (typeof albumId === "string" && albumId) songs.push(...(await getSubsonicAlbumSongs(albumId)).slice(0, PLAYLIST_MAX));
        if (Array.isArray(trackIds)) {
          for (const id of trackIds.slice(0, PLAYLIST_MAX)) {
            if (typeof id === "string" && id) songs.push(await getSubsonicSong(id));
          }
        }
        if (songs.length === 0) {
          socket.emit(SocketEvents.MusicAddError, { reason: "not-found" });
          return;
        }
        addToQueue(
          voiceChannelId,
          songs.map((s) => ({
            videoId: "",
            title: s.artist ? `${s.artist} — ${s.title}` : s.title,
            thumbnailUrl: s.coverUrl ?? "",
            source: "subsonic" as const,
            streamUrl: subsonicStreamUrl(s.id),
            durationSeconds: s.durationSeconds,
          })),
        );
      } catch (err) {
        console.warn("adding subsonic tracks failed", err);
        socket.emit(SocketEvents.MusicAddError, { reason: "subsonic-failed" });
      }
    },
  );

  /** Appends songs to the channel's queue (one broadcast, however many were added). */
  function addToQueue(voiceChannelId: string, songs: Resolved[]) {
    const state = getOrCreateState(voiceChannelId);
    const wasEmpty = state.currentIndex >= state.queue.length;
    settlePosition(state);
    const firstNew = state.queue.length;
    for (const s of songs) {
      const item: MusicQueueItem = {
        id: randomUUID(),
        videoId: s.videoId,
        title: s.title,
        thumbnailUrl: s.thumbnailUrl || null,
        addedByUsername: username,
        ...(s.source === "subsonic" ? { source: "subsonic" as const, streamUrl: s.streamUrl, durationSeconds: s.durationSeconds } : {}),
      };
      state.queue.push(item);
    }
    if (wasEmpty) {
      // Nothing was playing — the first thing just added starts immediately instead of
      // sitting in an empty queue waiting for someone to notice and press play.
      state.currentIndex = firstNew;
      state.isPlaying = true;
      state.positionSeconds = 0;
    }
    state.updatedAt = Date.now();
    broadcastState(io, voiceChannelId, state);
  }

  socket.on(SocketEvents.MusicRemove, ({ voiceChannelId, itemId }: { voiceChannelId: string; itemId: string }) => {
    const state = musicStates.get(voiceChannelId);
    if (!state) return;

    const index = state.queue.findIndex((i) => i.id === itemId);
    if (index === -1) return;

    settlePosition(state);
    state.queue.splice(index, 1);
    if (index < state.currentIndex) {
      state.currentIndex -= 1;
    } else if (index === state.currentIndex) {
      // Removed the currently-playing item — advance in place (same index now points at
      // the next item, if any) and restart position rather than guessing an offset.
      state.positionSeconds = 0;
      state.isPlaying = state.currentIndex < state.queue.length;
    }
    state.updatedAt = Date.now();
    broadcastState(io, voiceChannelId, state);
  });

  socket.on(SocketEvents.MusicPlay, ({ voiceChannelId }: { voiceChannelId: string }) => {
    const state = musicStates.get(voiceChannelId);
    if (!state || state.currentIndex >= state.queue.length) return;
    state.isPlaying = true;
    state.updatedAt = Date.now();
    broadcastState(io, voiceChannelId, state);
  });

  socket.on(SocketEvents.MusicPause, ({ voiceChannelId }: { voiceChannelId: string }) => {
    const state = musicStates.get(voiceChannelId);
    if (!state) return;
    if (state.isPlaying) {
      // Freeze the extrapolated position at the moment of pausing, not whatever stale
      // positionSeconds was last broadcast — otherwise resuming jumps backward.
      state.positionSeconds += (Date.now() - state.updatedAt) / 1000;
    }
    state.isPlaying = false;
    state.updatedAt = Date.now();
    broadcastState(io, voiceChannelId, state);
  });

  // Every listener's player reports the end of the same song, so this must be idempotent:
  // it only advances if the reported item is still the current one, otherwise N listeners
  // would skip N songs at once.
  socket.on(
    SocketEvents.MusicEnded,
    ({ voiceChannelId, itemId }: { voiceChannelId: string; itemId: string }) => {
      const state = musicStates.get(voiceChannelId);
      if (!state || state.queue[state.currentIndex]?.id !== itemId) return;
      dropPlayed(state);
      state.positionSeconds = 0;
      state.isPlaying = state.currentIndex < state.queue.length;
      state.updatedAt = Date.now();
      broadcastState(io, voiceChannelId, state);
    },
  );

  socket.on(SocketEvents.MusicSkip, ({ voiceChannelId }: { voiceChannelId: string }) => {
    const state = musicStates.get(voiceChannelId);
    if (!state) return;
    dropPlayed(state);
    state.positionSeconds = 0;
    state.isPlaying = state.currentIndex < state.queue.length;
    state.updatedAt = Date.now();
    broadcastState(io, voiceChannelId, state);
  });

  socket.on(
    SocketEvents.MusicSeek,
    ({ voiceChannelId, positionSeconds }: { voiceChannelId: string; positionSeconds: number }) => {
      const state = musicStates.get(voiceChannelId);
      if (!state || typeof positionSeconds !== "number") return;
      state.positionSeconds = Math.max(0, positionSeconds);
      state.updatedAt = Date.now();
      broadcastState(io, voiceChannelId, state);
    },
  );
}
