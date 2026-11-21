import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAuthStore } from "../store/authStore";
import { useMembersStore, roleOf } from "../store/membersStore";
import { tr } from "../i18n";
import { TEXT_COLORS } from "../utils/textStyle";

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

  // ── Aa: formatting bar (bold / italic / … / colour) — wraps the selection, or the caret ──
  const [fmtOpen, setFmtOpen] = useState(() => localStorage.getItem("formatBarOpen") === "1");
  const [colorsOpen, setColorsOpen] = useState(false);
  const [custom, setCustom] = useState(() => localStorage.getItem("formatCustomColor") ?? "#ff5c5c");

  function toggleFmt() {
    setFmtOpen((o) => {
      localStorage.setItem("formatBarOpen", o ? "0" : "1");
      return !o;
    });
    setColorsOpen(false);
    requestAnimationFrame(() => ref.current?.focus());
  }

  // The selection to restore after a format button changed the text — applied right in the commit
  // that shows the new value (a frame later could undo a selection the person already moved).
  const pendingSel = useRef<[number, number] | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const p = pendingSel.current;
    if (!el || !p) return;
    pendingSel.current = null;
    el.focus();
    el.setSelectionRange(p[0], p[1]);
  }, [value]);

  function select(a: number, b: number) {
    pendingSel.current = [a, b];
  }

  /** Put `before`/`after` around the selection — or take them off if they are already there. */
  function wrap(before: string, after = before) {
    const el = ref.current;
    if (!el) return;
    const s = el.selectionStart ?? value.length;
    const e = el.selectionEnd ?? s;
    if (value.slice(s - before.length, s) === before && value.slice(e, e + after.length) === after) {
      onChange(value.slice(0, s - before.length) + value.slice(s, e) + value.slice(e + after.length));
      select(s - before.length, e - before.length);
      return;
    }
    onChange(value.slice(0, s) + before + value.slice(s, e) + after + value.slice(e));
    select(s + before.length, e + before.length);
  }

  function code() {
    const el = ref.current;
    if (!el) return;
    const multiline = value.slice(el.selectionStart, el.selectionEnd).includes("\n");
    if (multiline) wrap("```\n", "\n```");
    else wrap("`");
  }

  /** "> " in front of every selected line (or the current one); again = off. */
  function quote() {
    const el = ref.current;
    if (!el) return;
    const s = value.lastIndexOf("\n", (el.selectionStart ?? 0) - 1) + 1;
    let e = value.indexOf("\n", el.selectionEnd ?? s);
    if (e === -1) e = value.length;
    const lines = value.slice(s, e).split("\n");
    const quoted = lines.every((l) => l.startsWith("> "));
    const next = lines.map((l) => (quoted ? l.slice(2) : `> ${l}`)).join("\n");
    onChange(value.slice(0, s) + next + value.slice(e));
    select(s, s + next.length);
  }

  /** "# " at the start of the current line (big text); again = off. */
  function heading() {
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart ?? 0;
    const s = value.lastIndexOf("\n", caret - 1) + 1;
    const on = value.startsWith("# ", s);
    onChange(on ? value.slice(0, s) + value.slice(s + 2) : value.slice(0, s) + "# " + value.slice(s));
    select(caret + (on ? -2 : 2), (el.selectionEnd ?? caret) + (on ? -2 : 2));
  }

  function color(hex: string) {
    wrap(`{${hex}}`, "{/}");
    setColorsOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Ctrl+B / I / U, Ctrl+Shift+X = strike, Ctrl+E = code. Handled here so global hotkeys don't see them.
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      const act =
        !e.shiftKey && k === "b" ? () => wrap("**")
        : !e.shiftKey && k === "i" ? () => wrap("*")
        : !e.shiftKey && k === "u" ? () => wrap("__")
        : !e.shiftKey && k === "e" ? code
        : e.shiftKey && k === "x" ? () => wrap("~~")
        : null;
      if (act) {
        e.preventDefault();
        e.stopPropagation();
        act();
        return;
      }
    }
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
      {fmtOpen && suggestions.length === 0 && (
        <div className="format-bar" onMouseDown={(e) => e.preventDefault()}>
          <button type="button" onClick={() => wrap("**")} title={tr("Удебелен (Ctrl+B)", "Bold (Ctrl+B)")}>
            <b>B</b>
          </button>
          <button type="button" onClick={() => wrap("*")} title={tr("Курсив (Ctrl+I)", "Italic (Ctrl+I)")}>
            <i>I</i>
          </button>
          <button type="button" onClick={() => wrap("__")} title={tr("Подчертан (Ctrl+U)", "Underline (Ctrl+U)")}>
            <u>U</u>
          </button>
          <button type="button" onClick={() => wrap("~~")} title={tr("Зачеркнат (Ctrl+Shift+X)", "Strikethrough (Ctrl+Shift+X)")}>
            <s>S</s>
          </button>
          <span className="format-sep" />
          <button type="button" onClick={code} title={tr("Код (Ctrl+E)", "Code (Ctrl+E)")}>
            {"</>"}
          </button>
          <button type="button" onClick={() => wrap("||")} title={tr("Спойлер — скрит, докато не цъкнат", "Spoiler — hidden until clicked")}>
            👁️
          </button>
          <button type="button" onClick={quote} title={tr("Цитат", "Quote")}>
            ❝
          </button>
          <button type="button" onClick={heading} title={tr("Голям текст (заглавие)", "Big text (heading)")}>
            H
          </button>
          <span className="format-sep" />
          <button type="button" className={colorsOpen ? "on" : ""} onClick={() => setColorsOpen((o) => !o)} title={tr("Цвят на избрания текст", "Colour of the selected text")}>
            🎨
          </button>
          {colorsOpen && (
            <span className="format-colors">
              {TEXT_COLORS.map((c) => (
                <button key={c} type="button" className="format-swatch" style={{ background: c }} onClick={() => color(c)} title={c} aria-label={c} />
              ))}
              <input
                type="color"
                value={custom}
                onChange={(e) => {
                  setCustom(e.target.value);
                  localStorage.setItem("formatCustomColor", e.target.value);
                }}
                title={tr("Друг цвят", "Another colour")}
              />
              <button type="button" className="format-swatch custom" style={{ background: custom }} onClick={() => color(custom)} title={tr("Сложи този цвят", "Use this colour")}>
                ✓
              </button>
            </span>
          )}
        </div>
      )}
      <button
        type="button"
        className={`format-toggle ${fmtOpen ? "on" : ""}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggleFmt}
        title={tr("Форматиране: удебелен, курсив, цвят…", "Formatting: bold, italic, colour…")}
        aria-label={tr("Форматиране", "Formatting")}
      >
        Aa
      </button>
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
