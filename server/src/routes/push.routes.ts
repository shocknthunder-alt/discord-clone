import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { fcmEnabled, getVapidKeys } from "../push/push.js";

/** Phones/browsers sign up for push notifications here (see push/push.ts). */
export const pushRouter = Router();
pushRouter.use(requireAuth);

pushRouter.get("/config", async (_req, res, next) => {
  try {
    const { publicKey } = await getVapidKeys();
    res.json({ vapidPublicKey: publicKey, fcm: fcmEnabled() });
  } catch (err) {
    next(err);
  }
});

pushRouter.post("/subscribe", async (req, res, next) => {
  try {
    const { kind, endpoint, p256dh, auth } = req.body ?? {};
    if (kind !== "web" && kind !== "fcm") return res.status(400).json({ error: "bad kind" });
    if (typeof endpoint !== "string" || endpoint.length < 10 || endpoint.length > 1000) return res.status(400).json({ error: "bad endpoint" });
    if (kind === "web") {
      if (!/^https:\/\//.test(endpoint)) return res.status(400).json({ error: "bad endpoint" });
      if (typeof p256dh !== "string" || typeof auth !== "string" || p256dh.length > 200 || auth.length > 100) {
        return res.status(400).json({ error: "bad keys" });
      }
    }
    const data = {
      userId: req.userId!,
      kind,
      p256dh: kind === "web" ? p256dh : null,
      auth: kind === "web" ? auth : null,
    };
    // The same phone signing in as someone else takes the subscription over.
    await prisma.pushSubscription.upsert({ where: { endpoint }, create: { endpoint, ...data }, update: data });
    // Keep it bounded: at most 10 devices per person (oldest go).
    const all = await prisma.pushSubscription.findMany({ where: { userId: req.userId! }, orderBy: { createdAt: "desc" }, select: { id: true } });
    if (all.length > 10) await prisma.pushSubscription.deleteMany({ where: { id: { in: all.slice(10).map((s) => s.id) } } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

pushRouter.post("/unsubscribe", async (req, res, next) => {
  try {
    const { endpoint } = req.body ?? {};
    if (typeof endpoint === "string") await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.userId! } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
