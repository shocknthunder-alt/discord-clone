import { useState } from "react";
import { createServer } from "../api/servers.api";
import { useServerStore } from "../store/serverStore";
import JoinServerModal from "./JoinServerModal";

export default function ServerSidebar() {
  const { servers, activeServerId, setActiveServer, addServer } = useServerStore();
  const [mode, setMode] = useState<"none" | "create" | "join">("none");
  const [input, setInput] = useState("");

  async function handleCreate() {
    if (!input.trim()) return;
    const server = await createServer(input.trim());
    addServer(server);
    setActiveServer(server.id);
    setInput("");
    setMode("none");
  }

  return (
    <div className="server-sidebar">
      {servers.map((server) => (
        <button
          key={server.id}
          className={`server-icon ${server.id === activeServerId ? "active" : ""}`}
          title={server.name}
          onClick={() => setActiveServer(server.id)}
        >
          {server.name.slice(0, 2).toUpperCase()}
        </button>
      ))}

      <button className="sidebar-action-button" onClick={() => setMode(mode === "create" ? "none" : "create")}>
        Create channel
      </button>
      <button className="sidebar-action-button" onClick={() => setMode(mode === "join" ? "none" : "join")}>
        Join channel
      </button>

      {mode === "create" && (
        <div style={{ padding: 8 }}>
          <input style={{ width: 56 }} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Name" />
          <button onClick={handleCreate}>Go</button>
        </div>
      )}

      {mode === "join" && <JoinServerModal onClose={() => setMode("none")} />}
    </div>
  );
}
