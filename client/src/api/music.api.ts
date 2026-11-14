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

export function searchSubsonic(q: string) {
  return http.get<{ songs: SubsonicSong[]; albums: SubsonicAlbum[] }>("/api/music/subsonic/search", { params: { q } }).then((r) => r.data);
}

export function fetchSubsonicAlbum(id: string) {
  return http.get<{ songs: SubsonicSong[] }>(`/api/music/subsonic/album/${encodeURIComponent(id)}`).then((r) => r.data.songs);
}

/** Queue songs (by id) or a whole album/playlist in the current voice channel. */
export function addSubsonicToQueue(what: { trackIds?: string[]; albumId?: string }) {
  const voiceChannelId = useVoiceStore.getState().activeVoiceChannelId;
  if (!voiceChannelId) return;
  useMusicStore.getState().setAddError(null);
  getSocket()?.emit(SocketEvents.MusicAddTracks, { voiceChannelId, ...what });
}
