import { tr } from "../i18n";

/**
 * Media attachments ride in a message's existing `imageUrl` field (no schema change), marked with
 * a URL fragment that browsers never send to the host:
 *   …/video/upload/…/x.webm#voice=<durationMs>.<peaks>   voice message (peaks: 0-9a-z per bar)
 *   …/video/upload/…/x.webm#clip=<durationMs>             stream clip
 * Anything else stays a picture.
 */
export type Attachment =
  | { kind: "image"; url: string }
  | { kind: "voice"; url: string; durationMs: number; peaks: number[] }
  | { kind: "clip"; url: string; durationMs: number };

const PEAK_DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

export function encodePeaks(peaks: number[]): string {
  return peaks.map((p) => PEAK_DIGITS[Math.round(Math.min(Math.max(p, 0), 1) * 35)]).join("");
}

export function parseAttachment(raw: string): Attachment {
  const hash = raw.indexOf("#");
  if (hash < 0) return { kind: "image", url: raw };
  const url = raw.slice(0, hash);
  const frag = raw.slice(hash + 1);
  const voice = /^voice=(\d+)\.([0-9a-z]*)$/.exec(frag);
  if (voice) {
    const peaks = [...voice[2]].map((c) => Math.max(PEAK_DIGITS.indexOf(c), 0) / 35);
    return { kind: "voice", url, durationMs: Number(voice[1]), peaks };
  }
  const clip = /^clip=(\d+)$/.exec(frag);
  if (clip) return { kind: "clip", url, durationMs: Number(clip[1]) };
  return { kind: "image", url: raw };
}

/** Cloudinary can hand out an MP4 of any uploaded video just by changing the extension. */
export function cloudinaryMp4(url: string): string | null {
  if (!/res\.cloudinary\.com\/.+\/video\/upload\//.test(url)) return null;
  return url.replace(/\.[a-z0-9]+$/i, ".mp4");
}

/** Short text for notifications / reply previews. */
export function attachmentLabel(raw: string | null | undefined): string {
  if (!raw) return "";
  const a = parseAttachment(raw);
  if (a.kind === "voice") return tr("🎤 гласово съобщение", "🎤 voice message");
  if (a.kind === "clip") return tr("🎬 клип", "🎬 clip");
  return tr("📷 изображение", "📷 image");
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
