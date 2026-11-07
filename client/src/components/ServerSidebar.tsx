import { useState } from "react";
import { createServer, joinServer } from "../api/servers.api";
import { useServerStore } from "../store/serverStore";

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

  async function handleJoin() {
    if (!input.trim()) return;
    const server = await joinServer(input.trim());
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

      <button className="server-icon add" title="Create server" onClick={() => setMode(mode === "create" ? "none" : "create")}>
        +
      </button>
      <button className="server-icon add" title="Join server" onClick={() => setMode(mode === "join" ? "none" : "join")}>
        ⇒
      </button>

      {mode !== "none" && (
        <div style={{ padding: 8 }}>
          <input
            style={{ width: 56 }}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={mode === "create" ? "Name" : "Invite code"}
          />
          <button onClick={mode === "create" ? handleCreate : handleJoin}>Go</button>
        </div>
      )}
    </div>
  );
}
