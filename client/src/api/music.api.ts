import { SocketEvents } from "@discord-clone/shared";
import { getSocket } from "../socket/socket";
import { useMusicStore } from "../store/musicStore";
import { useVoiceStore } from "../store/voiceStore";
import { http } from "./http";

export interface SubsonicSong {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationSeconds: number;
  coverUrl: string | null;
}
export interface SubsonicAlbum {
  id: string;
  name: string;
  artist: string;
  songCount: number;
  year: number | null;
  coverUrl: string | null;
}

let statusPromise: Promise<boolean> | null = null;
/** Whether the server has the music server (yogurthub) set up. Asked once per session. */
export function subsonicAvailable(): Promise<boolean> {
  statusPromise ??= http
    .get<{ enabled: boolean }>("/api/music/subsonic/status")
    .then((r) => !!r.data.enabled)
    .catch(() => {
      statusPromise = null; // try again next time
      return false;
    });
  return statusPromise;
}

// The music server is called straight from here (it's behind Cloudflare, which turns away our
// main server's data-centre address but lets people's own connections through; CORS allows it).
// Our server only hands out its address + a signed query, so the password never reaches the app.
let authPromise: Promise<{ base: string; query: string }> | null = null;
function auth() {
  authPromise ??= http
    .get<{ base: string; query: string }>("/api/music/subsonic/auth")
    .then((r) => r.data)
    .catch((err) => {
      authPromise = null;
      throw err;
    });
  return authPromise;
}

async function call<T>(method: string, params: Record<string, string>): Promise<T> {
  const a = await auth();
  const res = await fetch(`${a.base}/rest/${method}.view?${a.query}&${new URLSearchParams(params).toString()}`);
  const data = (await res.json()) as { "subsonic-response"?: { status?: string; error?: { message?: string } } & T };
  const r = data["subsonic-response"];
  if (!r || r.status !== "ok") throw new Error(r?.error?.message ?? `music server: ${method} failed`);
  return r;
}

interface RawSong {
  id: string;
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
  coverArt?: string;
}
interface RawAlbum {
  id: string;
  name?: string;
  artist?: string;
  songCount?: number;
  year?: number;
  coverArt?: string;
  song?: RawSong[];
}

async function coverUrl(coverArt?: string): Promise<string | null> {
  if (!coverArt) return null;
  const a = await auth();
  return `${a.base}/rest/getCoverArt.view?${a.query}&id=${encodeURIComponent(coverArt)}&size=160`;
}

async function toSong(s: RawSong): Promise<SubsonicSong> {
  return {
    id: s.id,
    title: s.title ?? "?",
    artist: s.artist ?? "",
    album: s.album ?? "",
    durationSeconds: Number(s.duration) || 0,
    coverUrl: await coverUrl(s.coverArt),
  };
}

export async function searchSubsonic(q: string): Promise<{ songs: SubsonicSong[]; albums: SubsonicAlbum[] }> {
  const r = await call<{ searchResult3?: { song?: RawSong[]; album?: RawAlbum[] } }>("search3", {
    query: q,
    // 50: the studio original is often further down than its remixes / live takes.
    songCount: "50",
    albumCount: "10",
    artistCount: "0",
  });
  const songs = await Promise.all((r.searchResult3?.song ?? []).map(toSong));
  const albums = await Promise.all(
    (r.searchResult3?.album ?? []).map(async (a) => ({
      id: a.id,
      name: a.name ?? "?",
      artist: a.artist ?? "",
      songCount: Number(a.songCount) || 0,
      year: a.year ?? null,
      coverUrl: await coverUrl(a.coverArt),
    })),
  );
  return { songs, albums };
}

export async function fetchSubsonicAlbum(id: string): Promise<SubsonicSong[]> {
  const r = await call<{ album?: RawAlbum }>("getAlbum", { id });
  return Promise.all((r.album?.song ?? []).map(toSong));
}

/** Queue songs in the current voice channel (the server builds their stream links). */
export function addSubsonicToQueue(songs: SubsonicSong[]) {
  const voiceChannelId = useVoiceStore.getState().activeVoiceChannelId;
  if (!voiceChannelId || songs.length === 0) return;
  useMusicStore.getState().setAddError(null);
  getSocket()?.emit(SocketEvents.MusicAddTracks, {
    voiceChannelId,
    tracks: songs.map((s) => ({ id: s.id, title: s.title, artist: s.artist, durationSeconds: s.durationSeconds, coverUrl: s.coverUrl })),
  });
}
