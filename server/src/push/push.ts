import { createCipheriv, createECDH, createHmac, generateKeyPairSync, randomBytes } from "node:crypto";
import { SignJWT, importJWK, importPKCS8, type JWK } from "jose";
import type { Server as IOServer } from "socket.io";
import { prisma } from "../db.js";
import { env } from "../env.js";

/**
 * Push notifications for when the app isn't on screen:
 *  - "web": Web Push (Chrome/Edge/Firefox, installed PWA on Android + iPhone home screen). The VAPID
 *    key pair is made on first use and kept in the AppConfig table — nothing to configure.
 *    Payload encryption is RFC 8291 (aes128gcm) with node:crypto, so no extra package.
 *  - "fcm": the Android app (Capacitor). Needs Render env FCM_SERVICE_ACCOUNT (the Firebase service
 *    account JSON); without it these subscriptions are simply skipped.
 * Only sent when none of the person's open apps is visible (see `visibleSockets`).
 */

export interface PushMessage {
  title: string;
  body: string;
  /** Where a tap should take you: "/?go=..." (handled by the client's pushTarget). */
  url: string;
  /** Same tag = replaces the older notification (one per channel / conversation). */
  tag: string;
}

// ── Who is looking at the app right now ──

/** socket id → its page is visible. Sockets that never said anything count as visible (older apps). */
const hiddenSockets = new Set<string>();

export function setSocketVisible(socketId: string, visible: boolean) {
  if (visible) hiddenSockets.delete(socketId);
  else hiddenSockets.add(socketId);
}

export function forgetSocket(socketId: string) {
  hiddenSockets.delete(socketId);
}

function isLookingAtApp(io: IOServer, userId: string): boolean {
  const room = io.sockets.adapter.rooms.get(`user:${userId}`);
  if (!room) return false;
  for (const sid of room) if (!hiddenSockets.has(sid)) return true;
  return false;
}

// ── VAPID (Web Push) ──

interface VapidKeys {
  publicKey: string; // base64url of the raw 65-byte point (what the browser's subscribe() wants)
  jwk: JWK; // private key
}

let vapidPromise: Promise<VapidKeys> | null = null;

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export function getVapidKeys(): Promise<VapidKeys> {
  vapidPromise ??= (async () => {
    const row = await prisma.appConfig.findUnique({ where: { key: "vapid" } });
    if (row) return JSON.parse(row.value) as VapidKeys;
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const jwk = privateKey.export({ format: "jwk" }) as JWK;
    const raw = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x!, "base64url"), Buffer.from(jwk.y!, "base64url")]);
    const keys: VapidKeys = { publicKey: b64url(raw), jwk };
    // Two servers starting at once: the first insert wins, everyone uses that one.
    await prisma.appConfig.upsert({ where: { key: "vapid" }, create: { key: "vapid", value: JSON.stringify(keys) }, update: {} });
    const saved = await prisma.appConfig.findUniqueOrThrow({ where: { key: "vapid" } });
    return JSON.parse(saved.value) as VapidKeys;
  })().catch((err) => {
    vapidPromise = null;
    throw err;
  });
  return vapidPromise;
}

const vapidJwtCache = new Map<string, { jwt: string; until: number }>();

async function vapidAuth(endpoint: string): Promise<string> {
  const keys = await getVapidKeys();
  const aud = new URL(endpoint).origin;
  const cached = vapidJwtCache.get(aud);
  if (cached && cached.until > Date.now()) return `vapid t=${cached.jwt}, k=${keys.publicKey}`;
  const key = await importJWK(keys.jwk, "ES256");
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", typ: "JWT" })
    .setAudience(aud)
    .setSubject(env.CLIENT_ORIGIN.startsWith("https://") ? env.CLIENT_ORIGIN : "https://shmirka.vercel.app")
    .setExpirationTime("12h")
    .sign(key);
  vapidJwtCache.set(aud, { jwt, until: Date.now() + 11 * 3600_000 });
  return `vapid t=${jwt}, k=${keys.publicKey}`;
}

function hmac(key: Buffer, data: Buffer): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

/** RFC 8291 "aes128gcm" body for one subscription. */
export function encryptPayload(payload: Buffer, p256dh: string, auth: string): Buffer {
  const uaPublic = Buffer.from(p256dh, "base64url");
  const authSecret = Buffer.from(auth, "base64url");
  const ecdh = createECDH("prime256v1");
  const asPublic = ecdh.generateKeys();
  const shared = ecdh.computeSecret(uaPublic);
  const salt = randomBytes(16);

  const prkKey = hmac(authSecret, shared);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic, Buffer.from([1])]);
  const ikm = hmac(prkKey, keyInfo);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01", "binary")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01", "binary")).subarray(0, 12);

  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);

  const header = Buffer.alloc(16 + 4 + 1);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, body]);
}

/** true = delivered (or a temporary problem); false = the subscription is dead, delete it. */
async function sendWeb(sub: { endpoint: string; p256dh: string | null; auth: string | null }, msg: PushMessage): Promise<boolean> {
  if (!sub.p256dh || !sub.auth) return false;
  const body = encryptPayload(Buffer.from(JSON.stringify(msg)), sub.p256dh, sub.auth);
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidAuth(sub.endpoint),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "high",
      Topic: msg.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || "shmirka",
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404 || res.status === 410) return false;
  if (!res.ok) console.warn("web push failed", res.status, (await res.text().catch(() => "")).slice(0, 200));
  return true;
}

// ── FCM (Android app) ──

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

let serviceAccount: ServiceAccount | null | undefined;

function getServiceAccount(): ServiceAccount | null {
  if (serviceAccount !== undefined) return serviceAccount;
  serviceAccount = null;
  const raw = env.FCM_SERVICE_ACCOUNT;
  if (raw) {
    try {
      const json = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8")) as ServiceAccount;
      if (json.project_id && json.client_email && json.private_key) serviceAccount = json;
    } catch {
      console.warn("FCM_SERVICE_ACCOUNT is not valid JSON — Android push disabled");
    }
  }
  return serviceAccount;
}

export function fcmEnabled(): boolean {
  return getServiceAccount() !== null;
}

let fcmToken: { token: string; until: number } | null = null;

async function fcmAccessToken(sa: ServiceAccount): Promise<string> {
  if (fcmToken && fcmToken.until > Date.now()) return fcmToken.token;
  const key = await importPKCS8(sa.private_key, "RS256");
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`FCM token ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  fcmToken = { token: json.access_token, until: Date.now() + (json.expires_in - 120) * 1000 };
  return json.access_token;
}

async function sendFcm(token: string, msg: PushMessage): Promise<boolean> {
  const sa = getServiceAccount();
  if (!sa) return true; // not configured: keep the token for when it is
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await fcmAccessToken(sa)}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: msg.title, body: msg.body },
        data: { url: msg.url, tag: msg.tag },
        android: { priority: "high", notification: { tag: msg.tag, channel_id: "messages", default_sound: true } },
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.ok) return true;
  const text = await res.text().catch(() => "");
  if (res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(text)) return false;
  console.warn("fcm push failed", res.status, text.slice(0, 200));
  return true;
}

// ── Sending ──

/** Push to these people — skipping anyone who has the app on screen right now. Never throws. */
export async function pushToUsers(io: IOServer, userIds: string[], msg: PushMessage): Promise<void> {
  try {
    const targets = [...new Set(userIds)].filter((id) => !isLookingAtApp(io, id));
    if (!targets.length) return;
    const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: targets } } });
    if (!subs.length) return;
    const dead: string[] = [];
    await Promise.all(
      subs.map(async (s) => {
        try {
          const ok = s.kind === "fcm" ? await sendFcm(s.endpoint, msg) : await sendWeb(s, msg);
          if (!ok) dead.push(s.id);
        } catch (err) {
          console.warn("push failed", (err as Error).message);
        }
      }),
    );
    if (dead.length) await prisma.pushSubscription.deleteMany({ where: { id: { in: dead } } });
  } catch (err) {
    console.warn("push failed", err);
  }
}

/** Notification text: single line, short. */
export function pushText(s: string, max = 140): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}
