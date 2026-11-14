import { createHash, randomBytes } from "node:crypto";
import { env } from "../env.js";

/**
 * A Subsonic-compatible music server (Navidrome — "yogurthub"; its octo.* instance also searches
 * Tidal and fetches those songs on demand). Server-side only: the account comes from the env.
 * Players get signed stream/cover URLs (token = md5(password + salt), never the password itself).
 */

export function subsonicEnabled(): boolean {
  return !!(env.SUBSONIC_URL && env.SUBSONIC_USER && env.SUBSONIC_PASSWORD);
}

function base(): string {
  return (env.SUBSONIC_URL ?? "").replace(/\/+$/, "");
}

function authParams(): URLSearchParams {
  const salt = randomBytes(6).toString("hex");
  const token = createHash("md5").update(`${env.SUBSONIC_PASSWORD}${salt}`).digest("hex");
  return new URLSearchParams({ u: env.SUBSONIC_USER ?? "", t: token, s: salt, v: "1.16.1", c: "shmirka", f: "json" });
}

function signed(method: string, params: Record<string, string>): string {
  const q = authParams();
  for (const [k, v] of Object.entries(params)) q.set(k, v);
  return `${base()}/rest/${method}.view?${q.toString()}`;
}

async function call<T>(method: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(signed(method, params), { signal: AbortSignal.timeout(20_000) });
  const data = (await res.json()) as { "subsonic-response"?: { status?: string; error?: { message?: string } } & T };
  const r = data["subsonic-response"];
  if (!r || r.status !== "ok") throw new Error(r?.error?.message ?? `subsonic ${method} failed (${res.status})`);
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
  coverArt?: string;
  year?: number;
  song?: RawSong[];
}

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

function coverUrl(coverArt: string | undefined, size = 160): string | null {
  return coverArt ? signed("getCoverArt", { id: coverArt, size: String(size) }) : null;
}

function song(s: RawSong): SubsonicSong {
  return {
    id: s.id,
    title: s.title ?? "?",
    artist: s.artist ?? "",
    album: s.album ?? "",
    durationSeconds: Number(s.duration) || 0,
    coverUrl: coverUrl(s.coverArt),
  };
}

function album(a: RawAlbum): SubsonicAlbum {
  return {
    id: a.id,
    name: a.name ?? "?",
    artist: a.artist ?? "",
    songCount: Number(a.songCount) || 0,
    year: a.year ?? null,
    coverUrl: coverUrl(a.coverArt),
  };
}

/**
 * For the players to call the music server themselves (search, albums, covers): its address and a
 * signed query (u/t/s/v/c/f — a salted token, not the password). Needed because the server sits
 * behind Cloudflare, which refuses requests from data centres like Render, while people's own
 * connections get through; it allows any origin (CORS *).
 */
export function subsonicClientAuth(): { base: string; query: string } {
  return { base: base(), query: authParams().toString() };
}

/** Whether `url` points at our music server (so a client can't make others load anything else). */
export function isSubsonicUrl(url: unknown): url is string {
  return typeof url === "string" && url.length < 1000 && url.startsWith(`${base()}/rest/`);
}

export async function searchSubsonic(query: string): Promise<{ songs: SubsonicSong[]; albums: SubsonicAlbum[] }> {
  const r = await call<{ searchResult3?: { song?: RawSong[]; album?: RawAlbum[] } }>("search3", {
    query,
    songCount: "25",
    albumCount: "10",
    artistCount: "0",
  });
  return { songs: (r.searchResult3?.song ?? []).map(song), albums: (r.searchResult3?.album ?? []).map(album) };
}

export async function getSubsonicSong(id: string): Promise<SubsonicSong> {
  const r = await call<{ song?: RawSong }>("getSong", { id });
  if (!r.song) throw new Error("song not found");
  return song(r.song);
}

export async function getSubsonicAlbumSongs(id: string): Promise<SubsonicSong[]> {
  // Tidal playlists show up as "albums" too (pl-tidal-…); getAlbum handles both on octo.
  const r = await call<{ album?: RawAlbum }>("getAlbum", { id });
  return (r.album?.song ?? []).map(song);
}

/**
 * What the players load. Transcoded to 192 kbps MP3 (light on everyone's connection and plays
 * everywhere); `timeOffset` (seconds) starts the stream mid-song — the stream itself can't be
 * seeked — so a late joiner asks for their own copy starting at the shared position.
 */
export function subsonicStreamUrl(id: string): string {
  return signed("stream", { id, format: "mp3", maxBitRate: "192" });
}
