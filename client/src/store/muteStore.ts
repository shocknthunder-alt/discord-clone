import { create } from "zustand";

/**
 * 🔕 Muted text channels / servers (per device). Muted = no unread marker, no notifications for
 * normal messages and no @everyone/@here pings; a direct @mention of you still comes through.
 * Value: until when (ms since epoch), or -1 = until turned back on.
 */
const KEY = "mutes";

interface Saved {
  channels: Record<string, number>;
  servers: Record<string, number>;
}

function load(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Saved>;
    return { channels: s.channels ?? {}, servers: s.servers ?? {} };
  } catch {
    return { channels: {}, servers: {} };
  }
}

interface MuteState extends Saved {
  mute: (kind: "channel" | "server", id: string, minutes: number | null) => void;
  unmute: (kind: "channel" | "server", id: string) => void;
}

export const useMuteStore = create<MuteState>((set, get) => {
  const persist = (next: Saved) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* blocked */
    }
    set(next);
  };
  return {
    ...load(),
    mute: (kind, id, minutes) => {
      const until = minutes === null ? -1 : Date.now() + minutes * 60_000;
      const { channels, servers } = get();
      persist(kind === "channel" ? { channels: { ...channels, [id]: until }, servers } : { channels, servers: { ...servers, [id]: until } });
    },
    unmute: (kind, id) => {
      const channels = { ...get().channels };
      const servers = { ...get().servers };
      if (kind === "channel") delete channels[id];
      else delete servers[id];
      persist({ channels, servers });
    },
  };
});

function active(until: number | undefined): boolean {
  return until !== undefined && (until === -1 || until > Date.now());
}

export function isChannelMuted(s: Saved, channelId: string): boolean {
  return active(s.channels[channelId]);
}

export function isServerMuted(s: Saved, serverId: string): boolean {
  return active(s.servers[serverId]);
}

/** Muted directly or through its server. */
export function isMutedHere(s: Saved, serverId: string | null | undefined, channelId: string): boolean {
  return isChannelMuted(s, channelId) || (!!serverId && isServerMuted(s, serverId));
}

export function muteUntilLabel(until: number | undefined, tr: (bg: string, en: string) => string): string {
  if (until === undefined) return "";
  if (until === -1) return tr("докато не го включиш", "until you turn it back on");
  return `${tr("до", "until")} ${new Date(until).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}`;
}
