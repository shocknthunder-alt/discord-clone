import { useServerStore } from "../store/serverStore";

const CUSTOM_EMOJI_PATTERN = /^:([a-z0-9_]{2,32}):$/;

// Reactions store either a native emoji character or ":name:" for a server custom emoji.
export default function EmojiGlyph({ emoji }: { emoji: string }) {
  const customEmojis = useServerStore((s) => s.customEmojis);
  const match = CUSTOM_EMOJI_PATTERN.exec(emoji);
  if (!match) return <>{emoji}</>;
  const custom = customEmojis.find((e) => e.name === match[1]);
  if (!custom) return <>{emoji}</>;
  return <img className="custom-emoji" src={custom.imageUrl} alt={emoji} title={emoji} />;
}
