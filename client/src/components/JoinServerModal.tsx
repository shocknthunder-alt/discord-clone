import { useEffect, useState } from "react";
import { fetchFeaturedInvite, joinServer } from "../api/servers.api";
import { useServerStore } from "../store/serverStore";

interface Props {
  onClose: () => void;
}

function extractInviteCode(input: string): string {
  const trimmed = input.trim();
  const parts = trimmed.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? trimmed;
}

export default function JoinServerModal({ onClose }: Props) {
  const { addServer, setActiveServer } = useServerStore();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [featured, setFeatured] = useState<{ name: string; inviteCode: string } | null>(null);

  useEffect(() => {
    fetchFeaturedInvite()
      .then(setFeatured)
      .catch(() => setFeatured(null));
  }, []);

  async function handleJoin() {
    const code = extractInviteCode(input);
    if (!code) return;

    setError(null);
    setLoading(true);
    try {
      const server = await joinServer(code);
      addServer(server);
      setActiveServer(server.id);
      onClose();
    } catch {
      setError("Invalid invite — check the code and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-back" onClick={onClose} aria-label="Back">
          ←
        </button>

        <h1 className="modal-title">Join a server</h1>
        <p className="modal-subtitle">Enter an invite below to join an existing server.</p>

        <label className="modal-label" htmlFor="invite-input">
          Invite Link
        </label>
        <input
          id="invite-input"
          className="modal-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          placeholder="Paste an invite code"
          autoFocus
        />

        {featured && (
          <p className="modal-examples-text">
            Paste THIS <strong>{featured.inviteCode}</strong> To Join {featured.name} CHannel!
          </p>
        )}

        {error && <div className="modal-error">{error}</div>}

        <button className="modal-join-button" onClick={handleJoin} disabled={loading || !input.trim()}>
          {loading ? "Joining…" : "Join Server"}
        </button>
      </div>
    </div>
  );
}
