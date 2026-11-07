const URL_REGEX = /(https?:\/\/[^\s]+)/g;

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
