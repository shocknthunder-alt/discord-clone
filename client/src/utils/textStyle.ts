import type { CSSProperties } from "react";
import type { TextFont, TextStyle } from "@discord-clone/shared";
import { useAuthStore } from "../store/authStore";
import { useMembersStore } from "../store/membersStore";
import { tr } from "../i18n";

export const FONT_FAMILIES: Record<TextFont, string> = {
  mono: 'ui-monospace, "Cascadia Code", Consolas, "Courier New", monospace',
  serif: 'Georgia, Cambria, "Times New Roman", serif',
  hand: '"Segoe Print", "Comic Sans MS", "Bradley Hand", cursive',
  round: '"Trebuchet MS", "Segoe UI Rounded", "Arial Rounded MT Bold", system-ui, sans-serif',
};

export function fontLabel(font: TextFont | null | undefined): string {
  switch (font) {
    case "mono":
      return tr("Машинопис", "Typewriter");
    case "serif":
      return tr("Класически", "Classic");
    case "hand":
      return tr("Ръкописен", "Handwriting");
    case "round":
      return tr("Закръглен", "Rounded");
    default:
      return tr("Обикновен", "Normal");
  }
}

/** Colours offered in the settings and in the chat's 🎨 (readable on dark and light themes). */
export const TEXT_COLORS = [
  "#ff5c5c", "#ff8a3d", "#ffc53d", "#9be15d", "#2ec27e", "#2dd4bf",
  "#4cc9f0", "#5b8cff", "#a78bfa", "#e879f9", "#ff6fae", "#b0b0b0",
];

export function textStyleCss(style: TextStyle | null | undefined): CSSProperties | undefined {
  if (!style) return undefined;
  const css: CSSProperties = {};
  if (style.color) css.color = style.color;
  if (style.bold) css.fontWeight = 600;
  if (style.italic) css.fontStyle = "italic";
  if (style.font) css.fontFamily = FONT_FAMILIES[style.font];
  return css;
}

/** How this person's messages look: mine from my account (right after saving), others from the members list. */
export function useAuthorTextStyle(userId: string | null | undefined): TextStyle | null {
  const myId = useAuthStore((s) => s.user?.id);
  const mine = useAuthStore((s) => s.user?.textStyle ?? null);
  const theirs = useMembersStore((s) => (userId ? (s.members.find((m) => m.userId === userId)?.textStyle ?? null) : null));
  return userId && userId === myId ? mine : theirs;
}
