/**
 * "Моят текст" (Settings → Чат): how a person's messages look to everyone — colour, bold, italic,
 * font. Kept on the user (JSON in User.textStyle) and sent with members / the logged-in user.
 */
export type TextFont = "mono" | "serif" | "hand" | "round";

export interface TextStyle {
  /** "#rrggbb", or absent = the theme's text colour. */
  color?: string | null;
  bold?: boolean;
  italic?: boolean;
  /** absent = the app's normal font. */
  font?: TextFont | null;
}

export const TEXT_FONTS: TextFont[] = ["mono", "serif", "hand", "round"];

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Anything (client input, stored JSON) → a clean style, or null when it's all defaults. */
export function cleanTextStyle(raw: unknown): TextStyle | null {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const out: TextStyle = {};
  if (typeof o.color === "string" && HEX.test(o.color)) out.color = o.color.toLowerCase();
  if (o.bold === true) out.bold = true;
  if (o.italic === true) out.italic = true;
  if (typeof o.font === "string" && (TEXT_FONTS as string[]).includes(o.font)) out.font = o.font as TextFont;
  return Object.keys(out).length ? out : null;
}

/** Colour syntax inside a message: {#ff4d4d}text{/} (the 🎨 button in the format bar writes it). */
export const COLOR_OPEN = /^\{#([0-9a-fA-F]{6})\}/;
export const COLOR_CLOSE = "{/}";
