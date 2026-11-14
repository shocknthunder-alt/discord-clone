import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getSubsonicAlbumSongs, searchSubsonic, subsonicEnabled } from "../music/subsonic.js";

export const musicRouter = Router();
musicRouter.use(requireAuth);

/** Whether the 🎧 yogurthub search is available at all. */
musicRouter.get("/subsonic/status", (_req, res) => {
  res.json({ enabled: subsonicEnabled() });
});

musicRouter.get("/subsonic/search", async (req, res) => {
  if (!subsonicEnabled()) return res.status(503).json({ error: "Музикалният сървър не е настроен." });
  const q = String(req.query.q ?? "").trim().slice(0, 200);
  if (!q) return res.json({ songs: [], albums: [] });
  try {
    res.json(await searchSubsonic(q));
  } catch (err) {
    console.warn("subsonic search failed", err);
    res.status(502).json({ error: "Музикалният сървър не отговаря." });
  }
});

/** The songs of an album / Tidal playlist, to look inside before adding. */
musicRouter.get("/subsonic/album/:id", async (req, res) => {
  if (!subsonicEnabled()) return res.status(503).json({ error: "Музикалният сървър не е настроен." });
  try {
    res.json({ songs: await getSubsonicAlbumSongs(req.params.id) });
  } catch (err) {
    console.warn("subsonic album failed", err);
    res.status(502).json({ error: "Музикалният сървър не отговаря." });
  }
});
