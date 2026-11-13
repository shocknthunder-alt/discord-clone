import { useState } from "react";
import { useDmStore } from "../store/dmStore";
import { isRunning, todaysEvent, upcomingOf, useEventsStore } from "../store/eventsStore";
import { useServerStore } from "../store/serverStore";
import { useReorderable } from "../utils/useReorderable";
import CreateServerModal from "./CreateServerModal";
import DraggableIcon from "./DraggableIcon";
import { useNow } from "./eventUtils";
import JoinServerModal from "./JoinServerModal";

const DEFAULT_SIDEBAR_ACTION_ORDER = ["create", "join"];

export default function ServerSidebar() {
  const { servers, activeServerId, setActiveServer } = useServerStore();
  const { view, setView, unreadCounts } = useDmStore();
  const [mode, setMode] = useState<"none" | "create" | "join">("none");
  const { order, moveItem } = useReorderable("sidebarActions", DEFAULT_SIDEBAR_ACTION_ORDER);

  const events = useEventsStore((s) => s.events);
  useNow(60_000);

  const totalUnread = Object.values(unreadCounts).reduce((sum, n) => sum + n, 0);

  const actionButtons: Record<string, React.ReactNode> = {
    create: (
      <button className="sidebar-action-button" onClick={() => setMode("create")}>
        Create channel
      </button>
    ),
    join: (
      <button className="sidebar-action-button" onClick={() => setMode("join")}>
        Join channel
      </button>
    ),
  };

  return (
    <div className="server-sidebar">
      <div className="server-icon-wrap">
        <button className={`server-icon ${view === "dms" ? "active" : ""}`} title="Direct Messages" onClick={() => setView("dms")}>
          💬
        </button>
        {totalUnread > 0 && <span className="server-icon-badge">{totalUnread > 99 ? "99+" : totalUnread}</span>}
      </div>

      {servers.map((server) => {
        const today = todaysEvent(upcomingOf(events, server.id));
        const live = today ? isRunning(today) : false;
        return (
          <div key={server.id} className="server-icon-wrap">
            <button
              className={`server-icon ${view === "servers" && server.id === activeServerId ? "active" : ""}`}
              title={today ? `${server.name} — ${live ? "тече събитие" : "събитие днес"}: ${today.title}` : server.name}
              onClick={() => {
                setView("servers");
                setActiveServer(server.id);
              }}
            >
              {server.iconUrl ? <img src={server.iconUrl} alt="" /> : server.name.slice(0, 2).toUpperCase()}
            </button>
            {today && <span className={`server-event-dot ${live ? "live" : ""}`}>📅</span>}
          </div>
        );
      })}

      <div className="sidebar-actions-group">
        <div className="sidebar-actions-trigger" aria-hidden>
          ⋯
        </div>
        <div className="sidebar-actions-buttons">
          {order.map((id) => (
            <DraggableIcon key={id} id={id} onDropItem={moveItem} className="sidebar-action-draggable">
              {actionButtons[id]}
            </DraggableIcon>
          ))}
        </div>
      </div>

      {servers.length === 0 && (
        <div className="join-hint">
          <div className="join-hint-arrow">↑</div>
          <div className="join-hint-text">
            <div>click</div>
            <div>here</div>
            <div>to</div>
            <div>join</div>
            <div>pepeg</div>
            <div>!!!!!</div>
          </div>
        </div>
      )}

      {mode === "create" && <CreateServerModal onClose={() => setMode("none")} />}
      {mode === "join" && <JoinServerModal onClose={() => setMode("none")} />}
    </div>
  );
}
