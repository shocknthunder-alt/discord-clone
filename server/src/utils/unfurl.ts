import { lookup } from "node:dns/promises";
import net from "node:net";
import type { LinkPreviewDTO } from "@discord-clone/shared";

/**
 * Link previews: fetch a page's <head> and read its OpenGraph / Twitter / <title> tags.
 * Only public http(s) addresses (no localhost / private networks — the server must not be usable
 * to poke at internal services), small timeouts, at most 512 KB read, results cached for hours.
 */

const TIMEOUT_MS = 6000;
const MAX_BYTES = 512 * 1024;
const MAX_REDIRECTS = 4;
const CACHE_TTL_MS = 6 * 3600_000;
const CACHE_MAX = 800;
const UA = "Mozilla/5.0 (compatible; ShmirkaLinkPreview/1.0; +https://shmirka.vercel.app)";

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return true;
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v);
}

async function assertPublic(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("bad protocol");
  if (url.port && url.port !== "80" && url.port !== "443") throw new Error("bad port");
  if (url.username || url.password) throw new Error("credentials in url");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) throw new Error("private host");
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error("private address");
}

async function fetchHead(start: URL): Promise<{ html: string; finalUrl: URL; contentType: string }> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url);
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", "accept-language": "bg,en;q=0.8" },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      await res.body?.cancel().catch(() => {});
      if (!loc) throw new Error("redirect without location");
      url = new URL(loc, url);
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      throw new Error(`status ${res.status}`);
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!/html|xml/i.test(contentType)) {
      await res.body?.cancel().catch(() => {});
      return { html: "", finalUrl: url, contentType };
    }
    const reader = res.body?.getReader();
    if (!reader) return { html: "", finalUrl: url, contentType };
    const chunks: Uint8Array[] = [];
    let total = 0;
    const decoder = new TextDecoder();
    let text = "";
    while (total < MAX_BYTES) {
      const { value, done } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      total += value.length;
      text += decoder.decode(value, { stream: true });
      if (/<\/head>/i.test(text)) break;
    }
    await reader.cancel().catch(() => {});
    return { html: text, finalUrl: url, contentType };
  }
  throw new Error("too many redirects");
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k.startsWith("#x")) return String.fromCodePoint(parseInt(k.slice(2), 16) || 32);
    if (k.startsWith("#")) return String.fromCodePoint(parseInt(k.slice(1), 10) || 32);
    return ENTITIES[k] ?? m;
  });
}

function parseMeta(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs: Record<string, string> = {};
    for (const a of tag.matchAll(/([a-zA-Z:_-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      attrs[a[1].toLowerCase()] = a[3] ?? a[4] ?? a[5] ?? "";
    }
    const key = (attrs.property || attrs.name || attrs.itemprop || "").toLowerCase();
    if (key && attrs.content !== undefined && !out.has(key)) out.set(key, decodeEntities(attrs.content).trim());
  }
  return out;
}

function clip(s: string | undefined | null, n: number): string | null {
  if (!s) return null;
  const t = s.replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function absHttp(raw: string | undefined, base: URL): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw, base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

async function youtubePreview(url: URL): Promise<LinkPreviewDTO | null> {
  const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url.href)}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
  return {
    url: url.href,
    siteName: "YouTube",
    title: clip(j.title, 200),
    description: clip(j.author_name, 100),
    image: j.thumbnail_url ?? null,
    largeImage: true,
    themeColor: "#ff0000",
  };
}

async function build(raw: string): Promise<LinkPreviewDTO | null> {
  const start = new URL(raw);
  if (/(^|\.)(youtube\.com|youtu\.be)$/i.test(start.hostname)) {
    const yt = await youtubePreview(start).catch(() => null);
    if (yt) return yt;
  }
  const { html, finalUrl } = await fetchHead(start);
  if (!html) return null;
  const meta = parseMeta(html);
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = clip(meta.get("og:title") ?? meta.get("twitter:title") ?? (titleTag ? decodeEntities(titleTag) : undefined), 200);
  const description = clip(meta.get("og:description") ?? meta.get("twitter:description") ?? meta.get("description"), 350);
  const image = absHttp(meta.get("og:image:secure_url") ?? meta.get("og:image") ?? meta.get("og:image:url") ?? meta.get("twitter:image") ?? meta.get("twitter:image:src"), finalUrl);
  if (!title && !description && !image) return null;
  const card = meta.get("twitter:card") ?? "";
  const color = meta.get("theme-color") ?? "";
  return {
    url: finalUrl.href,
    siteName: clip(meta.get("og:site_name") ?? finalUrl.hostname.replace(/^www\./, ""), 80),
    title,
    description,
    image,
    largeImage: !!image && (card === "summary_large_image" || card === "player" || meta.get("og:type")?.startsWith("video") === true),
    themeColor: /^#[0-9a-f]{3,8}$/i.test(color) ? color : null,
  };
}

const cache = new Map<string, { at: number; value: Promise<LinkPreviewDTO | null> }>();

export function unfurl(raw: string): Promise<LinkPreviewDTO | null> {
  const key = raw.trim();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const value = build(key).catch(() => null);
  cache.set(key, { at: Date.now(), value });
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return value;
}
