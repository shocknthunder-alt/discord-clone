import { cleanPersonalLooks, type PersonalLooks } from "@discord-clone/shared";
import { updateProfile } from "../api/auth.api";
import { useAuthStore } from "../store/authStore";

// "Моите картинки": what the server's owner set is what everyone sees, unless someone picked their own
// picture (or hid it) — that's saved on their account and only they see it, on every device.

const EMPTY: PersonalLooks = {};

function useLooks(): PersonalLooks {
  return useAuthStore((s) => s.user?.personalLooks ?? EMPTY);
}

/** Picks the override when there is one ("" = hidden → null), otherwise the server's picture. */
function pick(own: string | undefined, server: string | null | undefined): string | null {
  if (own === undefined) return server ?? null;
  return own || null;
}

export function useServerIcon(serverId: string | null | undefined, serverIcon: string | null | undefined): string | null {
  const looks = useLooks();
  return pick(serverId ? looks.servers?.[serverId]?.icon : undefined, serverIcon);
}

export function useServerBanner(serverId: string | null | undefined, serverBanner: string | null | undefined): string | null {
  const looks = useLooks();
  return pick(serverId ? looks.servers?.[serverId]?.banner : undefined, serverBanner);
}

export function useChannelBackground(channelId: string | null | undefined, serverBg: string | null | undefined): string | null {
  const looks = useLooks();
  return pick(channelId ? looks.channels?.[channelId] : undefined, serverBg);
}

/** All icons at once (the server bar), without a hook per icon. */
export function useServerIconOverrides(): NonNullable<PersonalLooks["servers"]> {
  return useLooks().servers ?? {};
}
export function iconFor(overrides: NonNullable<PersonalLooks["servers"]>, serverId: string, serverIcon: string | null): string | null {
  return pick(overrides[serverId]?.icon, serverIcon);
}

export type LookTarget = { kind: "icon" | "banner"; serverId: string } | { kind: "channel"; channelId: string };

/** Sets my own picture (URL), hides it ("") or goes back to the server's (undefined). Saved right away. */
export async function setPersonalLook(target: LookTarget, value: string | undefined): Promise<void> {
  const auth = useAuthStore.getState();
  const cur = auth.user?.personalLooks ?? {};
  const next: PersonalLooks = { servers: { ...(cur.servers ?? {}) }, channels: { ...(cur.channels ?? {}) } };
  if (target.kind === "channel") {
    if (value === undefined) delete next.channels![target.channelId];
    else next.channels![target.channelId] = value;
  } else {
    const s = { ...(next.servers![target.serverId] ?? {}) };
    if (value === undefined) delete s[target.kind];
    else s[target.kind] = value;
    if (s.icon === undefined && s.banner === undefined) delete next.servers![target.serverId];
    else next.servers![target.serverId] = s;
  }
  const clean = cleanPersonalLooks(next);
  const prev = auth.user;
  // Shown at once; put back if the server refuses.
  if (prev) auth.setUser({ ...prev, personalLooks: clean });
  try {
    const user = await updateProfile({ personalLooks: clean });
    const now = useAuthStore.getState().user;
    if (now) useAuthStore.getState().setUser({ ...now, personalLooks: user.personalLooks ?? null });
  } catch (err) {
    if (prev) useAuthStore.getState().setUser(prev);
    throw err;
  }
}
