import { useState } from "react";
import { useServerStore } from "../store/serverStore";
import CreateServerModal from "./CreateServerModal";
import JoinServerModal from "./JoinServerModal";

export default function ServerSidebar() {
  const { servers, activeServerId, setActiveServer } = useServerStore();
  const [mode, setMode] = useState<"none" | "create" | "join">("none");

  return (
    <div className="server-sidebar">
      {servers.map((server) => (
        <button
          key={server.id}
          className={`server-icon ${server.id === activeServerId ? "active" : ""}`}
          title={server.name}
          onClick={() => setActiveServer(server.id)}
        >
          {server.iconUrl ? <img src={server.iconUrl} alt="" /> : server.name.slice(0, 2).toUpperCase()}
        </button>
      ))}

      <div className="sidebar-actions-group">
        <div className="sidebar-actions-trigger" aria-hidden>
          ⋯
        </div>
        <div className="sidebar-actions-buttons">
          <button className="sidebar-action-button" onClick={() => setMode("create")}>
            Create channel
          </button>
          <button className="sidebar-action-button" onClick={() => setMode("join")}>
            Join channel
          </button>
        </div>
      </div>

      {mode === "create" && <CreateServerModal onClose={() => setMode("none")} />}
      {mode === "join" && <JoinServerModal onClose={() => setMode("none")} />}
    </div>
  );
}
