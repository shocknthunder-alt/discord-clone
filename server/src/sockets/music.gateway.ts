import { extractYoutubeId, SocketEvents, type MusicQueueItem, type MusicState } from "@discord-clone/shared";
import { randomUUID } from "node:crypto";
import type { Server as IOServer, Socket } from "socket.io";
import { env } from "../env.js";

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

function roomName(voiceChannelId: string) {
  return `voice:${voiceChannelId}`;
}

function emptyState(): MusicState {
  return { queue: [], currentIndex: 0, isPlaying: false, positionSeconds: 0, updatedAt: Date.now() };
}

const musicStates = new Map<string, MusicState>();

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

    let resolved: { videoId: string; title: string; thumbnailUrl: string } | null = null;

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

    const item: MusicQueueItem = {
      id: randomUUID(),
      videoId: resolved.videoId,
      title: resolved.title,
      thumbnailUrl: resolved.thumbnailUrl || null,
      addedByUsername: username,
    };

    const state = getOrCreateState(voiceChannelId);
    const wasEmpty = state.currentIndex >= state.queue.length;
    state.queue.push(item);
    if (wasEmpty) {
      // Nothing was playing — the thing that was just added starts immediately instead of
      // sitting in an empty queue waiting for someone to notice and press play.
      state.currentIndex = state.queue.length - 1;
      state.isPlaying = true;
      state.positionSeconds = 0;
    }
    state.updatedAt = Date.now();
    broadcastState(io, voiceChannelId, state);
  });

  socket.on(SocketEvents.MusicRemove, ({ voiceChannelId, itemId }: { voiceChannelId: string; itemId: string }) => {
    const state = musicStates.get(voiceChannelId);
    if (!state) return;

    const index = state.queue.findIndex((i) => i.id === itemId);
    if (index === -1) return;

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

  socket.on(SocketEvents.MusicSkip, ({ voiceChannelId }: { voiceChannelId: string }) => {
    const state = musicStates.get(voiceChannelId);
    if (!state) return;
    state.currentIndex = Math.min(state.currentIndex + 1, state.queue.length);
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
