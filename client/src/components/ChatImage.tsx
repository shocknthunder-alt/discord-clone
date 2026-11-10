import { useState } from "react";
import { createPortal } from "react-dom";
import { useEscapeKey } from "../hooks/useEscapeKey";

/** A chat attachment: click opens it full-size in an in-app viewer (close with click, ✕ or Esc). */
export default function ChatImage({ url }: { url: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <img className="message-image clickable" src={url} alt="attachment" onClick={() => setOpen(true)} />
      {open && <Lightbox url={url} onClose={() => setOpen(false)} />}
    </>
  );
}

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEscapeKey(onClose);
  return createPortal(
    <div className="lightbox-overlay" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose} aria-label="Затвори">
        ✕
      </button>
      <img className="lightbox-image" src={url} alt="attachment" onClick={(e) => e.stopPropagation()} />
      <a className="lightbox-open" href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
        Отвори оригинала
      </a>
    </div>,
    document.body,
  );
}
