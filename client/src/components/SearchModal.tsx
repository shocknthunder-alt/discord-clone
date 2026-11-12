import { formatDateTime } from "../utils/appPrefs";
import { Fragment, useEffect, useRef, useState } from "react";
import { searchMessages, type SearchResult } from "../api/channels.api";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { useChatStore } from "../store/chatStore";
import { useSearchStore } from "../store/searchStore";
import { useServerStore } from "../store/serverStore";

function highlight(text: string, q: string) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  // Keep a window around the match so long messages stay readable in the list.
  const start = Math.max(0, i - 40);
  const end = Math.min(text.length, i + q.length + 80);
  return (
    <>
      {start > 0 && "…"}
      {text.slice(start, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length, end)}
      {end < text.length && "…"}
    </>
  );
}

export default function SearchModal() {
  const open = useSearchStore((s) => s.open);
  const setOpen = useSearchStore((s) => s.setOpen);
  const { activeServerId, activeTextChannelId, textChannels, setActiveTextChannel } = useServerStore();
  const setJumpTarget = useChatStore((s) => s.setJumpTarget);
  const [query, setQuery] = useState("");
  const [thisChannelOnly, setThisChannelOnly] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEscapeKey(() => open && setOpen(false));

  // Ctrl/Cmd+K opens the search from anywhere.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useSearchStore.getState().setOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  useEffect(() => {
    if (!open || !activeServerId) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const t = setTimeout(() => {
      searchMessages(activeServerId, q, thisChannelOnly ? (activeTextChannelId ?? undefined) : undefined)
        .then((r) => !cancelled && setResults(r))
        .catch(console.error)
        .finally(() => !cancelled && setLoading(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, thisChannelOnly, open, activeServerId, activeTextChannelId]);

  if (!open || !activeServerId) return null;

  function jump(r: SearchResult) {
    setJumpTarget({ channelId: r.textChannelId, messageId: r.replyToId ?? r.id, rootId: r.replyToId });
    setActiveTextChannel(r.textChannelId);
    setOpen(false);
  }

  const q = query.trim();
  const channelName = textChannels.find((c) => c.id === activeTextChannelId)?.name;

  return (
    <div className="modal-overlay" onMouseDown={() => setOpen(false)}>
      <div className="modal-card search-modal" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="search-input"
          placeholder="Search messages in all channels…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {activeTextChannelId && (
          <label className="search-scope">
            <input type="checkbox" checked={thisChannelOnly} onChange={(e) => setThisChannelOnly(e.target.checked)} />
            Only in #{channelName}
          </label>
        )}
        <div className="search-results">
          {q.length < 2 && <div className="search-hint">Type at least 2 characters. Tip: Ctrl+K opens search anywhere.</div>}
          {q.length >= 2 && !loading && results.length === 0 && <div className="search-hint">No messages found.</div>}
          {results.map((r, i) => (
            <Fragment key={r.id}>
              {(i === 0 || results[i - 1]!.textChannelId !== r.textChannelId) && (
                <div className="search-channel"># {r.channelName}</div>
              )}
              <button className="search-result" onClick={() => jump(r)}>
                <div className="search-result-meta">
                  <strong>{r.authorUsername}</strong>
                  <span>{formatDateTime(r.createdAt)}</span>
                  {r.replyToId && <span>· in thread</span>}
                </div>
                <div className="search-result-text">{highlight(r.content, q)}</div>
              </button>
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
