import { useState } from "react";
import { createPortal } from "react-dom";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { imageLinksIn } from "../utils/linkify";

/** A chat attachment: click opens it full-size in an in-app viewer (close with click, ✕ or Esc). */
export default function ChatImage({ url }: { url: string }) {
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState(false);
  // A pasted link to an image that's gone/blocked just stays a link — no broken-image icon.
  if (broken) return null;
  return (
    <>
      <img
        className="message-image clickable"
        src={url}
        alt="attachment"
        loading="lazy"
        // Some hosts (e.g. Reddit previews) refuse hotlinks that carry our site as referrer.
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        onClick={() => setOpen(true)}
      />
      {open && <Lightbox url={url} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Images for every direct image link in a message's text (Reddit/Imgur/Tenor/… .png .jpg .gif .webp). */
export function LinkedImages({ text }: { text: string }) {
  const urls = imageLinksIn(text);
  if (urls.length === 0) return null;
  return (
    <div className="linked-images">
      {urls.map((u) => (
        <ChatImage key={u} url={u} />
      ))}
    </div>
  );
}

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEscapeKey(onClose);
  return createPortal(
    <div className="lightbox-overlay" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose} aria-label="Затвори">
        ✕
      </button>
      <img
        className="lightbox-image"
        src={url}
        alt="attachment"
        referrerPolicy="no-referrer"
        onClick={(e) => e.stopPropagation()}
      />
      <a className="lightbox-open" href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
        Отвори оригинала
      </a>
    </div>,
    document.body,
  );
}
