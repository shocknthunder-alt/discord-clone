import type { MessageEditDTO } from "@discord-clone/shared";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { http } from "../api/http";
import { formatTime } from "../utils/appPrefs";
import { tr } from "../i18n";

/** "(редактирано)" — click to see what the message said before each edit. */
export default function EditedTag({ messageId, current, editedAt }: { messageId: string; current: string; editedAt: string }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={btn}
        className="edited-tag edited-tag-button"
        onClick={() => setOpen((v) => !v)}
        title={tr("Виж предишните версии", "See earlier versions")}
      >
        ({tr("редактирано", "edited")})
      </button>
      {open && <EditHistoryPopover anchor={btn.current} messageId={messageId} current={current} editedAt={editedAt} onClose={() => setOpen(false)} />}
    </>
  );
}

function EditHistoryPopover({
  anchor,
  messageId,
  current,
  editedAt,
  onClose,
}: {
  anchor: HTMLElement | null;
  messageId: string;
  current: string;
  editedAt: string;
  onClose: () => void;
}) {
  const [edits, setEdits] = useState<MessageEditDTO[] | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    http
      .get<{ edits: MessageEditDTO[] }>(`/api/messages/${messageId}/edits`)
      .then((r) => alive && setEdits(r.data.edits))
      .catch(() => alive && setEdits([]));
    return () => {
      alive = false;
    };
  }, [messageId, current]);

  useLayoutEffect(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const w = 380;
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)), top: Math.min(r.bottom + 6, window.innerHeight - 340) });
  }, [anchor]);

  useEffect(() => {
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchor?.contains(t)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [anchor, onClose]);

  if (!pos) return null;
  return createPortal(
    <div ref={ref} className="edit-history" style={pos}>
      <div className="edit-history-title">✏️ {tr("История на редакциите", "Edit history")}</div>
      <div className="edit-history-item now">
        <div className="edit-history-when">
          {tr("Сега", "Now")} · {formatTime(editedAt)}
        </div>
        <div className="edit-history-text">{current}</div>
      </div>
      {edits === null && <div className="edit-history-empty">{tr("Зареждам…", "Loading…")}</div>}
      {edits?.length === 0 && (
        <div className="edit-history-empty">{tr("Няма запазени по-стари версии (редактирано е преди историята да съществува).", "No earlier versions saved (edited before history existed).")}</div>
      )}
      {edits?.map((e, i) => (
        <div key={i} className="edit-history-item">
          <div className="edit-history-when">
            {tr("Заменено", "Replaced")} {formatTime(e.replacedAt)}
          </div>
          <div className="edit-history-text">{e.content}</div>
        </div>
      ))}
    </div>,
    document.body,
  );
}
