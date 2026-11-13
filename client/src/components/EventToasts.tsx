import { useEffect } from "react";
import { useEventsStore, type EventToast } from "../store/eventsStore";
import { useServerStore } from "../store/serverStore";
import { useDmStore } from "../store/dmStore";
import "./events.css";

/** New event / reminder / "it started" pop-ups (top right). */
export default function EventToasts({ onJoinVoice }: { onJoinVoice: (serverId: string, voiceChannelId: string) => void }) {
  const toasts = useEventsStore((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="ev-toasts">
      {toasts.map((t) => (
        <Toast key={t.id} t={t} onJoinVoice={onJoinVoice} />
      ))}
    </div>
  );
}

function Toast({ t, onJoinVoice }: { t: EventToast; onJoinVoice: (serverId: string, voiceChannelId: string) => void }) {
  const dismiss = useEventsStore((s) => s.dismissToast);
  const openBoard = useEventsStore((s) => s.openBoard);

  useEffect(() => {
    const id = setTimeout(() => dismiss(t.id), t.kind === "new" ? 20_000 : 120_000);
    return () => clearTimeout(id);
  }, [t.id, t.kind, dismiss]);

  function show() {
    // The board shows the open server's events — switch to the event's server first.
    useDmStore.getState().setView("servers");
    if (useServerStore.getState().activeServerId !== t.serverId) useServerStore.getState().setActiveServer(t.serverId);
    openBoard({ eventId: t.eventId });
    dismiss(t.id);
  }

  const head = t.kind === "new" ? "📅 Ново събитие" : t.kind === "reminder" ? "⏰ Напомняне" : "🔴 Започна";
  return (
    <div className={`ev-toast ${t.kind}`}>
      {t.imageUrl && <img className="ev-toast-img" src={t.imageUrl} alt="" />}
      <div className="ev-toast-body">
        <div className="ev-toast-head">{head}</div>
        <div className="ev-toast-title">{t.title}</div>
        <div className="ev-toast-text">{t.text}</div>
        <div className="ev-toast-actions">
          {t.voiceChannelId && t.kind !== "new" && (
            <button
              className="ev-btn small primary"
              onClick={() => {
                onJoinVoice(t.serverId, t.voiceChannelId!);
                dismiss(t.id);
              }}
            >
              Влез
            </button>
          )}
          <button className="ev-btn small" onClick={show}>
            Виж
          </button>
          <button className="ev-btn small" onClick={() => dismiss(t.id)}>
            Затвори
          </button>
        </div>
      </div>
    </div>
  );
}
