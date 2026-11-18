import { useEffect, useState } from "react";
import { fetchFeaturedInvite, joinServer } from "../api/servers.api";
import { useServerStore } from "../store/serverStore";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { tr } from "../i18n";

// Pre-filled so friends only have to press the button: the main server's CURRENT code from the
// server (this hardcoded one is only the fallback while that loads / if it fails).
const DEFAULT_INVITE_CODE = "cmw6c0h3z0004123k7n8dqxww";

interface Props {
  onClose: () => void;
}

function extractInviteCode(input: string): string {
  const trimmed = input.trim();
  const parts = trimmed.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? trimmed;
}

export default function JoinServerModal({ onClose }: Props) {
  useEscapeKey(onClose);
  const { addServer, setActiveServer } = useServerStore();
  const [input, setInput] = useState(DEFAULT_INVITE_CODE);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    fetchFeaturedInvite()
      .then((f) => setInput((cur) => (cur === DEFAULT_INVITE_CODE ? f.inviteCode : cur)))
      .catch(() => {});
  }, []);

  async function handleJoin() {
    const code = extractInviteCode(input);
    if (!code) return;

    setError(null);
    setLoading(true);
    try {
      const server = await joinServer(code);
      if (!useServerStore.getState().servers.some((s) => s.id === server.id)) addServer(server);
      setActiveServer(server.id);
      onClose();
    } catch {
      setError(tr("Невалидна покана — провери кода и опитай пак.", "Invalid invite — check the code and try again."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-back" onClick={onClose} aria-label={tr("Назад", "Back")}>
          ←
        </button>

        <h1 className="modal-title">{tr("Влез в сървър", "Join a server")}</h1>
        <p className="modal-subtitle">{tr("Въведи код за покана, за да влезеш в съществуващ сървър.", "Enter an invite below to join an existing server.")}</p>

        <label className="modal-label" htmlFor="invite-input">
          {tr("Код за покана", "Invite Link")}
        </label>
        <input
          id="invite-input"
          className="modal-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          placeholder={tr("Постави кода за покана", "Paste an invite code")}
          autoFocus
        />

        <p className="modal-examples-text">{tr("Кликни", "Click")} <strong>{tr("Влез", "Join Server")}</strong> Pepega !</p>

        {error && <div className="modal-error">{error}</div>}

        <button className="modal-join-button" onClick={handleJoin} disabled={loading || !input.trim()}>
          {loading ? tr("Влизане…", "Joining…") : tr("Влез", "Join Server")}
        </button>
      </div>
    </div>
  );
}
