interface IconProps {
  size?: number;
  color?: string;
}

/** Classic rotated-handset hangup glyph, drawn as a flat white icon (not an emoji — emoji
 * glyphs carry their own built-in colors and ignore CSS `color`, which is why the old 📞
 * on a red circle never actually contrasted). */
export function HangupIcon({ size = 16, color = "#ffffff" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21.5 15.5c-1.6 0-3.2-.25-4.7-.75a1.4 1.4 0 0 0-1.4.3l-2.1 2.1a15.7 15.7 0 0 1-6.9-6.9l2.1-2.1a1.4 1.4 0 0 0 .3-1.4C8.3 5.2 8 3.6 8 2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1c0 11.6 9.4 21 21 21a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1z"
        fill={color}
        transform="rotate(135 12 12)"
      />
    </svg>
  );
}

export function MicIcon({ size = 16, color = "#ffffff", muted = false }: IconProps & { muted?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3z"
        fill={color}
      />
      <path
        d="M19 11a7 7 0 0 1-14 0M12 18v3"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {muted && <line x1="4" y1="4" x2="20" y2="20" stroke="#da373c" strokeWidth="2.4" strokeLinecap="round" />}
    </svg>
  );
}

export function HeadphoneIcon({ size = 16, color = "#ffffff", muted = false }: IconProps & { muted?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 13v-1a8 8 0 0 1 16 0v1"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <rect x="2.5" y="13" width="4" height="6" rx="1.5" fill={color} />
      <rect x="17.5" y="13" width="4" height="6" rx="1.5" fill={color} />
      {muted && <line x1="4" y1="4" x2="20" y2="20" stroke="#da373c" strokeWidth="2.4" strokeLinecap="round" />}
    </svg>
  );
}

export function ScreenShareIcon({ size = 16, color = "#ffffff" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="2.5" y="4" width="19" height="13" rx="1.5" stroke={color} strokeWidth="1.8" />
      <path d="M8 21h8M12 17v4" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9 12l3-3 3 3M12 9.5V15" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
