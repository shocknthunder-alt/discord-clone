import { Router } from "express";
import type { GifDTO } from "@discord-clone/shared";
import { env } from "../env.js";
import { requireAuth } from "../middleware/auth.js";
import { unfurl } from "../utils/unfurl.js";

export const mediaRouter = Router();
mediaRouter.use(requireAuth);

/** Link preview card for one URL (null = nothing to show). */
mediaRouter.get("/unfurl", async (req, res) => {
  const url = typeof req.query.url === "string" ? req.query.url : "";
  if (!/^https?:\/\//i.test(url) || url.length > 2000) return res.status(400).json({ error: "bad url" });
  const preview = await unfurl(url);
  res.set("Cache-Control", "private, max-age=3600");
  res.json({ preview });
});

// ── GIF search (GIPHY; Tenor's API was shut down in June 2026). Needs Render env GIPHY_API_KEY. ──

interface GiphyImage {
  url?: string;
  webp?: string;
  width?: string;
  height?: string;
}
interface GiphyItem {
  id: string;
  title?: string;
  images?: Record<string, GiphyImage | undefined>;
}

function toGif(g: GiphyItem): GifDTO | null {
  const im = g.images ?? {};
  const send = im.downsized_medium ?? im.downsized ?? im.original;
  const prev = im.fixed_width ?? im.fixed_width_downsampled ?? send;
  if (!send?.url || !prev) return null;
  return {
    id: g.id,
    title: g.title ?? "",
    preview: prev.webp ?? prev.url ?? send.url,
    url: send.url.replace(/\?.*$/, ""),
    width: Number(prev.width) || 200,
    height: Number(prev.height) || 150,
  };
}

// GIPHY's free key allows 100 calls an hour: the same search / "trending" page is reused for 10 min.
const GIF_CACHE_MS = 10 * 60_000;
const gifCache = new Map<string, { at: number; body: { gifs: GifDTO[]; nextOffset: number | null } }>();

mediaRouter.get("/gifs/status", (_req, res) => {
  res.json({ enabled: !!env.GIPHY_API_KEY });
});

mediaRouter.get("/gifs/search", async (req, res) => {
  if (!env.GIPHY_API_KEY) return res.status(503).json({ error: "GIF search is not configured" });
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  const offset = Math.max(0, Math.min(Number(req.query.offset) || 0, 400));
  const params = new URLSearchParams({ api_key: env.GIPHY_API_KEY, limit: "30", offset: String(offset), rating: "r", bundle: "messaging_non_clips" });
  if (q) {
    params.set("q", q);
    params.set("lang", /[а-я]/i.test(q) ? "bg" : "en");
  }
  const cacheKey = `${q.toLowerCase()}|${offset}`;
  const hit = gifCache.get(cacheKey);
  if (hit && Date.now() - hit.at < GIF_CACHE_MS) return res.json(hit.body);
  try {
    const r = await fetch(`https://api.giphy.com/v1/gifs/${q ? "search" : "trending"}?${params}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return res.status(502).json({ error: `GIPHY ${r.status}` });
    const j = (await r.json()) as { data?: GiphyItem[]; pagination?: { total_count?: number; count?: number; offset?: number } };
    const gifs = (j.data ?? []).map(toGif).filter((g): g is GifDTO => !!g);
    const p = j.pagination ?? {};
    const next = (p.offset ?? offset) + (p.count ?? gifs.length);
    const body = { gifs, nextOffset: p.total_count && next < p.total_count && next <= 400 ? next : null };
    gifCache.set(cacheKey, { at: Date.now(), body });
    if (gifCache.size > 300) {
      const oldest = gifCache.keys().next().value;
      if (oldest !== undefined) gifCache.delete(oldest);
    }
    res.set("Cache-Control", "private, max-age=300");
    res.json(body);
  } catch (err) {
    console.error("gif search", err);
    res.status(502).json({ error: "GIF search failed" });
  }
});
