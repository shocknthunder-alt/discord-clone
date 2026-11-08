import { extractYoutubeId, SocketEvents, type MusicQueueItem, type MusicState } from "@discord-clone/shared";
import { randomUUID } from "node:crypto";
import type { Server as IOServer, Socket } from "socket.io";

// No API key needed for this — oEmbed is YouTube's public, keyless metadata endpoint. Good
// enough for title + thumbnail on paste; search-by-title (a separate feature) is the one
// that actually needs the Data API v3 key.
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
    const videoId = extractYoutubeId(url ?? "");
    if (!videoId) {
      socket.emit(SocketEvents.MusicAddError, { reason: "invalid-url" });
      return;
    }

    const meta = await fetchOEmbed(videoId);
    if (!meta) {
      socket.emit(SocketEvents.MusicAddError, { reason: "lookup-failed" });
      return;
    }

    const item: MusicQueueItem = {
      id: randomUUID(),
      videoId,
      title: meta.title,
      thumbnailUrl: meta.thumbnailUrl || null,
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
