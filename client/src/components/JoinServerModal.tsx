import { useEffect, useState } from "react";
import { fetchFeaturedInvite } from "../api/servers.api";
import { useServerStore } from "../store/serverStore";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { joinErrorText, joinWithRetry } from "../utils/invite";
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
    // Retried: right after a restart the server takes a while to answer.
    let stop = false;
    const load = (attempt: number) =>
      fetchFeaturedInvite()
        .then((f) => !stop && setInput((cur) => (cur === DEFAULT_INVITE_CODE ? f.inviteCode : cur)))
        .catch(() => {
          if (!stop && attempt < 6) setTimeout(() => load(attempt + 1), 5000);
        });
    void load(0);
    return () => {
      stop = true;
    };
  }, []);

  async function handleJoin() {
    const code = extractInviteCode(input);
    if (!code) return;

    setError(null);
    setLoading(true);
    try {
      // The server may be waking up / restarting (Render): retried for ~20 s before giving up.
      const server = await joinWithRetry(code, () => setError(tr("Сървърът се събужда… опитвам пак.", "The server is waking up… trying again.")));
      if (!useServerStore.getState().servers.some((s) => s.id === server.id)) addServer(server);
      setActiveServer(server.id);
      onClose();
    } catch (err) {
      setError(joinErrorText(err));
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
