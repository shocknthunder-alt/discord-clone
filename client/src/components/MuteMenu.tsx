import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { isChannelMuted, isServerMuted, muteUntilLabel, useMuteStore } from "../store/muteStore";
import { tr } from "../i18n";

const OPTIONS: { label: () => string; minutes: number | null }[] = [
  { label: () => tr("За 15 минути", "For 15 minutes"), minutes: 15 },
  { label: () => tr("За 1 час", "For 1 hour"), minutes: 60 },
  { label: () => tr("За 8 часа", "For 8 hours"), minutes: 8 * 60 },
  { label: () => tr("За 24 часа", "For 24 hours"), minutes: 24 * 60 },
  { label: () => tr("Докато не го включа", "Until I turn it back on"), minutes: null },
];

/** Right-click menu on a text channel / server icon: 🔕 mute for a while, or unmute. */
export default function MuteMenu({
  kind,
  id,
  name,
  x,
  y,
  onClose,
  extra,
}: {
  kind: "channel" | "server";
  id: string;
  name: string;
  x: number;
  y: number;
  onClose: () => void;
  extra?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const state = useMuteStore();
  const muted = kind === "channel" ? isChannelMuted(state, id) : isServerMuted(state, id);
  const until = kind === "channel" ? state.channels[id] : state.servers[id];

  useEffect(() => {
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    // The timer must be cancelled too: a re-render right after opening (onClose is a new function
    // every time) used to leave a stale listener behind that closed the NEXT menu on its first
    // mousedown — "Включи канала" never got its click. (Found by the e2e tests.)
    const t = setTimeout(() => window.addEventListener("mousedown", down), 0);
    window.addEventListener("keydown", key);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousedown", down);
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);

  return createPortal(
    <div ref={ref} className="member-menu mute-menu" style={{ left: Math.min(x, window.innerWidth - 250), top: Math.min(y, window.innerHeight - 300) }}>
      <div className="member-menu-head">
        <strong>{kind === "channel" ? `# ${name}` : name}</strong>
        <span>{muted ? `🔕 ${tr("заглушен", "muted")} ${muteUntilLabel(until, tr)}` : tr("Известия", "Notifications")}</span>
      </div>
      {muted ? (
        <button
          onClick={() => {
            state.unmute(kind, id);
            onClose();
          }}
        >
          🔔 {kind === "channel" ? tr("Включи канала", "Unmute channel") : tr("Включи сървъра", "Unmute server")}
        </button>
      ) : (
        <>
          <div className="member-menu-label">
            🔕 {kind === "channel" ? tr("Заглуши канала", "Mute channel") : tr("Заглуши сървъра", "Mute server")}
          </div>
          {OPTIONS.map((o) => (
            <button
              key={o.label()}
              onClick={() => {
                state.mute(kind, id, o.minutes);
                onClose();
              }}
            >
              {o.label()}
            </button>
          ))}
          <div className="member-menu-info">
            {tr("Без известия и маркери за непрочетено. Лично @споменаване пак ще стигне до теб.", "No notifications or unread markers. A direct @mention still reaches you.")}
          </div>
        </>
      )}
      {extra}
    </div>,
    document.body,
  );
}
