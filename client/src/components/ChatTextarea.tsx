import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAuthStore } from "../store/authStore";
import { useMembersStore, roleOf } from "../store/membersStore";
import { tr } from "../i18n";

/**
 * The message box: grows with the text (Shift+Enter = new line, Enter = send) and, in servers,
 * suggests people when you type "@" (↑/↓, Enter/Tab to pick, Esc to close).
 */
interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Offer @mention suggestions (server channels). */
  mentions?: boolean;
}

interface Suggestion {
  name: string;
  label: string;
  hint: string;
  avatarUrl: string | null;
  color?: string;
}

const MAX_HEIGHT = 220;

export default function ChatTextarea({ value, onChange, onSubmit, onPaste, placeholder, autoFocus, mentions = false }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<{ text: string; start: number; end: number } | null>(null);
  const [sel, setSel] = useState(0);
  const members = useMembersStore((s) => s.members);
  const roles = useMembersStore((s) => s.roles);
  const myId = useAuthStore((s) => s.user?.id);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
  }, [value]);

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!mentions || !query) return [];
    const q = query.text.toLowerCase();
    const people = members
      .filter((m) => m.userId !== myId && m.username.toLowerCase().includes(q))
      .sort((a, b) => {
        const as = a.username.toLowerCase().startsWith(q) ? 0 : 1;
        const bs = b.username.toLowerCase().startsWith(q) ? 0 : 1;
        return as - bs || Number(b.online) - Number(a.online) || a.username.localeCompare(b.username);
      })
      .slice(0, 8)
      .map((m) => ({
        name: m.username,
        label: m.username,
        hint: m.online ? tr("на линия", "online") : "",
        avatarUrl: m.avatarUrl,
        color: roleOf(m, roles)?.color ?? undefined,
      }));
    const special: Suggestion[] = [
      { name: "everyone", label: "@everyone", hint: tr("всички в сървъра", "everyone in the server"), avatarUrl: null },
      { name: "here", label: "@here", hint: tr("всички на линия", "everyone online"), avatarUrl: null },
    ].filter((s) => s.name.startsWith(q));
    return [...people, ...special].slice(0, 9);
  }, [mentions, query, members, roles, myId]);

  function updateQuery(el: HTMLTextAreaElement) {
    if (!mentions) return;
    const caret = el.selectionStart ?? el.value.length;
    if (caret !== (el.selectionEnd ?? caret)) return setQuery(null);
    const before = el.value.slice(0, caret);
    const m = before.match(/(^|\s)@([^\s@]{0,32})$/);
    if (!m) {
      if (query) setQuery(null);
      return;
    }
    const start = caret - m[2].length - 1;
    if (!query || query.text !== m[2] || query.start !== start) {
      setQuery({ text: m[2], start, end: caret });
      setSel(0);
    }
  }

  function pick(s: Suggestion) {
    if (!query) return;
    const insert = `@${s.name} `;
    const next = value.slice(0, query.start) + insert + value.slice(query.end).replace(/^ /, "");
    onChange(next);
    setQuery(null);
    const caret = query.start + insert.length;
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (suggestions.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const d = e.key === "ArrowDown" ? 1 : -1;
        setSel((i) => (i + d + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pick(suggestions[Math.min(sel, suggestions.length - 1)]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setQuery(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSubmit();
    }
  }

  return (
    <>
      {suggestions.length > 0 && (
        <div className="mention-suggest" onMouseDown={(e) => e.preventDefault()}>
          <div className="mention-suggest-title">{tr("Спомени", "Mention")}</div>
          {suggestions.map((s, i) => (
            <button
              key={s.name}
              type="button"
              className={`mention-suggest-item ${i === sel ? "sel" : ""}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => pick(s)}
            >
              {s.avatarUrl ? (
                <img className="mention-suggest-avatar" src={s.avatarUrl} alt="" />
              ) : (
                <span className="mention-suggest-avatar placeholder">{s.label.startsWith("@") ? "@" : s.label.slice(0, 2).toUpperCase()}</span>
              )}
              <span className="mention-suggest-name" style={s.color ? { color: s.color } : undefined}>
                {s.label}
              </span>
              <span className="mention-suggest-hint">{s.hint}</span>
            </button>
          ))}
        </div>
      )}
      <textarea
        ref={ref}
        className="chat-textarea"
        rows={1}
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          updateQuery(e.target);
        }}
        onSelect={(e) => updateQuery(e.currentTarget)}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
      />
    </>
  );
}
