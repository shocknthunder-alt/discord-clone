/**
 * "Моите картинки": a person's own server icon / banner / channel backgrounds that only they see.
 * Missing key = what the server has; a URL = my picture; "" = hidden for me.
 */
export interface PersonalLooks {
  servers?: Record<string, { icon?: string; banner?: string }>;
  /** Text or voice channel id → background. */
  channels?: Record<string, string>;
}

const MAX_SERVERS = 50;
const MAX_CHANNELS = 300;

function cleanUrl(v: unknown): string | undefined {
  if (v === "") return "";
  if (typeof v !== "string" || v.length > 600) return undefined;
  return /^https:\/\/[^\s"'()<>\\]+$/.test(v) ? v : undefined;
}

const cleanId = (k: string) => /^[\w-]{1,40}$/.test(k);

/** Only https URLs (or "" = hidden) under sane ids; anything else is dropped. null = nothing set. */
export function cleanPersonalLooks(raw: unknown): PersonalLooks | null {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object") return null;
  const o = v as { servers?: unknown; channels?: unknown };
  const out: PersonalLooks = {};
  if (o.servers && typeof o.servers === "object") {
    const servers: NonNullable<PersonalLooks["servers"]> = {};
    for (const [id, s] of Object.entries(o.servers as Record<string, unknown>).slice(0, MAX_SERVERS)) {
      if (!cleanId(id) || !s || typeof s !== "object") continue;
      const icon = cleanUrl((s as { icon?: unknown }).icon);
      const banner = cleanUrl((s as { banner?: unknown }).banner);
      if (icon === undefined && banner === undefined) continue;
      servers[id] = { ...(icon !== undefined ? { icon } : {}), ...(banner !== undefined ? { banner } : {}) };
    }
    if (Object.keys(servers).length) out.servers = servers;
  }
  if (o.channels && typeof o.channels === "object") {
    const channels: Record<string, string> = {};
    for (const [id, url] of Object.entries(o.channels as Record<string, unknown>).slice(0, MAX_CHANNELS)) {
      const u = cleanUrl(url);
      if (cleanId(id) && u !== undefined) channels[id] = u;
    }
    if (Object.keys(channels).length) out.channels = channels;
  }
  return out.servers || out.channels ? out : null;
}
