const URL_REGEX = /(https?:\/\/[^\s]+)/g;

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp)$/i;
/** Hosts that serve images without an extension in the path. */
const IMAGE_HOSTS = new Set(["pbs.twimg.com"]);

/** Links in a message that point straight at an image (shown inline under the text). */
export function imageLinksIn(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.match(URL_REGEX) ?? []) {
    try {
      const url = new URL(raw.replace(/[)\].,!?]+$/, ""));
      const isImage =
        IMAGE_EXT.test(url.pathname) ||
        (IMAGE_HOSTS.has(url.hostname) && /^(png|jpe?g|gif|webp)$/i.test(url.searchParams.get("format") ?? ""));
      if (isImage && !out.includes(url.href)) out.push(url.href);
    } catch {
      // not a valid URL — leave it as plain text
    }
  }
  return out.slice(0, 4);
}

/**
 * Splits message text on URLs and wraps each one in a real clickable <a>. Uses a
 * capturing-group split so the array strictly alternates non-URL/URL/non-URL/... —
 * checking index parity avoids re-testing the (stateful, due to the /g flag) regex
 * per segment, which would silently skip matches on repeated .test() calls.
 */
export function linkifyText(text: string): React.ReactNode {
  const parts = text.split(URL_REGEX);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={part} target="_blank" rel="noreferrer noopener" className="message-link">
        {part}
      </a>
    ) : (
      part
    ),
  );
}
