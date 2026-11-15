import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { SocketEvents } from "@discord-clone/shared";
import { tr } from "../i18n";
import { uploadMediaToCloudinary } from "../api/cloudinary";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { getSocket } from "../socket/socket";
import { useServerStore } from "../store/serverStore";

/** After "🎬 Клип": watch it, then post it to a text channel or save it to the PC. */
export default function ClipDialog({
  blob,
  seconds,
  streamerName,
  onClose,
}: {
  blob: Blob;
  seconds: number;
  streamerName: string;
  onClose: () => void;
}) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const channels = useServerStore((s) => s.textChannels);
  const activeTextChannelId = useServerStore((s) => s.activeTextChannelId);
  const postable = channels.filter((c) => c.type !== "trivia");
  const [channelId, setChannelId] = useState(
    () => (postable.find((c) => c.id === activeTextChannelId) ?? postable[0])?.id ?? "",
  );
  const [caption, setCaption] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEscapeKey(() => progress === null && onClose());

  const sizeMb = (blob.size / 1024 / 1024).toFixed(1);
  const fileName = `clip-${streamerName.replace(/[^\p{L}\p{N}_-]+/gu, "_")}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.webm`;

  async function post() {
    if (!channelId) return;
    setError(null);
    setProgress(0);
    try {
      const { url: uploaded, durationMs } = await uploadMediaToCloudinary(blob, setProgress);
      getSocket()?.emit(SocketEvents.MessageSend, {
        textChannelId: channelId,
        content: caption.trim() || tr(`🎬 Клип от стрийма на ${streamerName}`, `🎬 Clip from ${streamerName}'s stream`),
        imageUrl: `${uploaded}#clip=${durationMs || seconds * 1000}`,
      });
      onClose();
    } catch (err) {
      console.error("clip upload failed", err);
      setError(tr("Качването не успя (Cloudinary).", "Upload failed (Cloudinary)."));
      setProgress(null);
    }
  }

  return createPortal(
    <div className="modal-overlay" onClick={() => progress === null && onClose()}>
      <div className="modal-card clip-dialog" onClick={(e) => e.stopPropagation()}>
        <h1 className="modal-title">🎬 {tr("Клип", "Clip")} — {streamerName}</h1>
        <video className="clip-preview" src={url} controls autoPlay muted playsInline />
        <p className="modal-hint">
          {tr(`Последните ~${seconds} секунди · ${sizeMb} MB`, `The last ~${seconds} seconds · ${sizeMb} MB`)}
        </p>
        <input
          className="modal-input clip-caption"
          value={caption}
          maxLength={300}
          onChange={(e) => setCaption(e.target.value)}
          placeholder={tr("Надпис (по желание)", "Caption (optional)")}
          disabled={progress !== null}
        />
        <div className="clip-row">
          <select value={channelId} onChange={(e) => setChannelId(e.target.value)} disabled={progress !== null}>
            {postable.map((c) => (
              <option key={c.id} value={c.id}>
                # {c.name}
              </option>
            ))}
          </select>
          <button className="modal-join-button clip-post" disabled={!channelId || progress !== null} onClick={() => void post()}>
            {progress !== null ? `${tr("Качване", "Uploading")} ${Math.round(progress * 100)}%` : tr("Прати в канала", "Post to channel")}
          </button>
        </div>
        {error && <div className="modal-error">{error}</div>}
        <div className="clip-actions">
          <a className="clip-save" href={url} download={fileName}>
            ⬇ {tr("Запази на компютъра", "Save to PC")}
          </a>
          <button onClick={onClose} disabled={progress !== null}>
            {tr("Затвори", "Close")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
