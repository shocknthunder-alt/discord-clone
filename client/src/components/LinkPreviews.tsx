import { extractYoutubeId, type LinkPreviewDTO } from "@discord-clone/shared";
import { useEffect, useState } from "react";
import { fetchLinkPreview } from "../api/media.api";
import { isImageLink } from "../utils/linkify";
import { previewLinksIn } from "../utils/markdown";
import { useAppPrefs } from "../utils/appPrefs";
import { tr } from "../i18n";

/** Preview cards for the links in a message (YouTube plays right here). */
export default function LinkPreviews({ text }: { text: string }) {
  const enabled = useAppPrefs((s) => s.linkPreviews);
  if (!enabled || !text.includes("http")) return null;
  const urls = previewLinksIn(text, isImageLink);
  if (!urls.length) return null;
  return (
    <div className="link-previews">
      {urls.map((u) => (
        <LinkPreview key={u} url={u} />
      ))}
    </div>
  );
}

function LinkPreview({ url }: { url: string }) {
  const [preview, setPreview] = useState<LinkPreviewDTO | null | undefined>(undefined);
  const [playing, setPlaying] = useState(false);
  const [imgBroken, setImgBroken] = useState(false);
  useEffect(() => {
    let alive = true;
    void fetchLinkPreview(url).then((p) => alive && setPreview(p));
    return () => {
      alive = false;
    };
  }, [url]);

  if (!preview) return null;
  const yt = extractYoutubeId(url);
  const image = preview.image && !imgBroken ? preview.image : null;

  return (
    <div className="link-preview" style={preview.themeColor ? { borderLeftColor: preview.themeColor } : undefined}>
      <div className="link-preview-body">
        {preview.siteName && <div className="link-preview-site">{preview.siteName}</div>}
        {preview.title && (
          <a className="link-preview-title" href={url} target="_blank" rel="noreferrer noopener">
            {preview.title}
          </a>
        )}
        {preview.description && !yt && <div className="link-preview-desc">{preview.description}</div>}
        {yt && preview.description && <div className="link-preview-desc">{preview.description}</div>}
        {yt ? (
          playing ? (
            <div className="link-preview-player">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${yt}?autoplay=1`}
                title={preview.title ?? "YouTube"}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
              />
            </div>
          ) : (
            <button className="link-preview-yt" onClick={() => setPlaying(true)} title={tr("Пусни тук", "Play here")}>
              <img src={`https://i.ytimg.com/vi/${yt}/hqdefault.jpg`} alt="" loading="lazy" referrerPolicy="no-referrer" />
              <span className="link-preview-play">▶</span>
            </button>
          )
        ) : (
          image &&
          preview.largeImage && (
            <a href={url} target="_blank" rel="noreferrer noopener">
              <img className="link-preview-image" src={image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImgBroken(true)} />
            </a>
          )
        )}
      </div>
      {!yt && image && !preview.largeImage && (
        <img className="link-preview-thumb" src={image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImgBroken(true)} />
      )}
    </div>
  );
}
