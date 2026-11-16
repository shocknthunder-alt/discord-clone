import { Perm } from "@discord-clone/shared";
import { useEffect, useRef, useState } from "react";
import { isCloudinaryConfigured, uploadImageToCloudinary } from "../api/cloudinary";
import { createSticker, deleteSticker } from "../api/media.api";
import { apiError } from "../api/members.api";
import { useAuthStore } from "../store/authStore";
import { usePerm } from "../store/membersStore";
import { useServerStore } from "../store/serverStore";
import { useStickerStore } from "../store/stickerStore";
import { tr } from "../i18n";

/** 🏷️ Server stickers: pick one to send it; add your own (PNG/GIF/WebP). */
export default function StickerPicker({ onPick }: { onPick: (url: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`sticker-toggle-button ${open ? "on" : ""}`} onClick={() => setOpen((v) => !v)} title={tr("Стикери", "Stickers")}>
        🏷️
      </button>
      {open && (
        <StickerPopover
          onClose={() => setOpen(false)}
          onPick={(url) => {
            setOpen(false);
            onPick(url);
          }}
        />
      )}
    </>
  );
}

function StickerPopover({ onPick, onClose }: { onPick: (url: string) => void; onClose: () => void }) {
  const stickers = useStickerStore((s) => s.stickers);
  const serverId = useServerStore((s) => s.activeServerId);
  const me = useAuthStore((s) => s.user?.id);
  const canAdd = usePerm(Perm.ADD_EMOJIS) && isCloudinaryConfigured();
  const canManage = usePerm(Perm.MANAGE_MESSAGES);
  const [adding, setAdding] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (ref.current?.contains(t) || t.closest(".sticker-toggle-button")) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  async function add() {
    if (!serverId || !file || !name.trim()) return;
    if (file.size > 4 * 1024 * 1024) {
      setError(tr("Файлът е над 4 MB.", "The file is over 4 MB."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const url = await uploadImageToCloudinary(file);
      await createSticker(serverId, name.trim(), url);
      void useStickerStore.getState().load(serverId);
      setAdding(false);
      setFile(null);
      setName("");
    } catch (err) {
      setError(apiError(err, tr("Не успях да го добавя.", "Couldn't add it.")));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!serverId || !window.confirm(tr("Да изтрия ли този стикер?", "Delete this sticker?"))) return;
    try {
      await deleteSticker(serverId, id);
      void useStickerStore.getState().load(serverId);
    } catch (err) {
      setError(apiError(err, tr("Не успях.", "That didn't work.")));
    }
  }

  return (
    <div className="sticker-popover" ref={ref}>
      <div className="sticker-popover-title">🏷️ {tr("Стикери на сървъра", "Server stickers")}</div>
      <div className="sticker-grid">
        {stickers.length === 0 && !adding && (
          <div className="gif-empty">{tr("Още няма стикери. Добави първия!", "No stickers yet. Add the first one!")}</div>
        )}
        {stickers.map((s) => (
          <div key={s.id} className="sticker-cell">
            <button type="button" className="sticker-item" onClick={() => onPick(`${s.imageUrl}#sticker`)} title={s.name}>
              <img src={s.imageUrl} alt={s.name} loading="lazy" />
            </button>
            {(s.uploaderId === me || canManage) && (
              <button type="button" className="sticker-delete" onClick={() => void remove(s.id)} title={tr("Изтрий", "Delete")}>
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      {adding ? (
        <div className="sticker-add">
          <input type="file" accept="image/png,image/gif,image/webp,image/jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <input className="gif-search" value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder={tr("Име на стикера", "Sticker name")} />
          <div className="status-actions">
            <button type="button" onClick={() => setAdding(false)}>
              {tr("Отказ", "Cancel")}
            </button>
            <button type="button" className="primary" disabled={busy || !file || !name.trim()} onClick={() => void add()}>
              {busy ? tr("Качвам…", "Uploading…") : tr("Добави", "Add")}
            </button>
          </div>
        </div>
      ) : (
        canAdd && (
          <button type="button" className="sticker-add-button" onClick={() => setAdding(true)}>
            ＋ {tr("Добави стикер", "Add sticker")}
          </button>
        )
      )}
      {error && <div className="member-menu-error">{error}</div>}
    </div>
  );
}
