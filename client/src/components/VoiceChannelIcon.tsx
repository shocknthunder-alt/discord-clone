interface Props {
  size?: number;
}

/** Voice-channel glyph: a rounded speaker with two sound waves. The body follows the text
 * color, the waves use the accent so the icon reads as "audio" at a glance, and the
 * outer wave fades out for a little depth. Inline SVG instead of an emoji so it renders
 * identically on every OS and takes theme colors. */
export default function VoiceChannelIcon({ size = 21 }: Props) {
  return (
    <svg className="voice-channel-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4.5 9.6c0-.9.7-1.6 1.6-1.6h2.1l3.6-3.1c.8-.7 2-.1 2 .9v12.4c0 1-1.2 1.6-2 .9L8.2 16H6.1c-.9 0-1.6-.7-1.6-1.6V9.6z"
        fill="currentColor"
      />
      <path d="M16.4 9.2a4 4 0 0 1 0 5.6" stroke="var(--accent)" strokeWidth="2.3" strokeLinecap="round" />
      <path
        d="M19.1 6.6a7.7 7.7 0 0 1 0 10.8"
        stroke="var(--accent)"
        strokeWidth="2.3"
        strokeLinecap="round"
        opacity="0.45"
      />
    </svg>
  );
}
