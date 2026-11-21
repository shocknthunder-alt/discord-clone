import { useState, type ReactNode } from "react";
import { COLOR_CLOSE, COLOR_OPEN } from "@discord-clone/shared";

/**
 * Discord-style message formatting:
 *   **bold**  *italic* / _italic_  __underline__  ~~strike~~  `code`  ```code block```
 *   ||spoiler||  > quote  # heading  -# small text  links (<link> = no preview)  @mentions
 *   {#ff5c5c}coloured text{/}  (written by the 🎨 in the format bar)
 * A backslash escapes the next symbol (\*not italic\*).
 */

export interface RenderOptions {
  /** Known usernames (for @mentions with spaces). */
  names?: string[];
  /** My username: mentions of me (and @everyone/@here) get the "me" style. */
  myName?: string | null;
  onMentionClick?: (name: string, e: React.MouseEvent) => void;
}

const WORD = /[\p{L}\p{N}_]/u;
const URL_AT = /^https?:\/\/[^\s<>]+/;

function trimUrl(u: string): string {
  let out = u.replace(/[.,!?;:'"]+$/, "");
  // A ")" closing a sentence, not part of the link (wikipedia_(x) links keep theirs).
  while (out.endsWith(")") && (out.match(/\(/g)?.length ?? 0) < (out.match(/\)/g)?.length ?? 0)) out = out.slice(0, -1);
  return out;
}

function Spoiler({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false);
  return (
    <span
      className={`md-spoiler ${shown ? "shown" : ""}`}
      onClick={(e) => {
        if (!shown) {
          e.preventDefault();
          e.stopPropagation();
          setShown(true);
        }
      }}
      title={shown ? undefined : "Спойлер — цъкни, за да видиш"}
    >
      {children}
    </span>
  );
}

interface Ctx extends RenderOptions {
  k: number;
  sortedNames: string[];
}

function inline(s: string, ctx: Ctx): ReactNode[] {
  const out: ReactNode[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push(buf);
    buf = "";
  };
  const key = () => `m${ctx.k++}`;
  let i = 0;
  outer: while (i < s.length) {
    const c = s[i];
    const prev = i > 0 ? s[i - 1] : "";

    if (c === "\\" && i + 1 < s.length && /[\\*_~`|@<>#{-]/.test(s[i + 1])) {
      buf += s[i + 1];
      i += 2;
      continue;
    }

    if (c === "`") {
      const j = s.indexOf("`", i + 1);
      if (j > i + 1) {
        flush();
        out.push(
          <code key={key()} className="md-code">
            {s.slice(i + 1, j)}
          </code>,
        );
        i = j + 1;
        continue;
      }
    }

    if (c === "{") {
      const m = s.slice(i).match(COLOR_OPEN);
      if (m) {
        const start = i + m[0].length;
        const end = s.indexOf(COLOR_CLOSE, start);
        if (end > start) {
          flush();
          out.push(
            <span key={key()} className="md-color" style={{ color: `#${m[1]}` }}>
              {inline(s.slice(start, end), ctx)}
            </span>,
          );
          i = end + COLOR_CLOSE.length;
          continue;
        }
      }
    }

    for (const [tok, kind] of [
      ["||", "spoiler"],
      ["**", "b"],
      ["__", "u"],
      ["~~", "s"],
    ] as const) {
      if (s.startsWith(tok, i)) {
        const j = s.indexOf(tok, i + 2);
        if (j > i + 2) {
          flush();
          const inner = inline(s.slice(i + 2, j), ctx);
          const k = key();
          out.push(
            kind === "spoiler" ? (
              <Spoiler key={k}>{inner}</Spoiler>
            ) : kind === "b" ? (
              <strong key={k}>{inner}</strong>
            ) : kind === "u" ? (
              <u key={k}>{inner}</u>
            ) : (
              <s key={k}>{inner}</s>
            ),
          );
          i = j + 2;
          continue outer;
        }
      }
    }

    if ((c === "*" || c === "_") && s[i + 1] && s[i + 1] !== " " && s[i + 1] !== c && !(c === "_" && prev && WORD.test(prev))) {
      for (let j = i + 2; j < s.length; j++) {
        if (s[j] !== c || s[j - 1] === " " || s[j + 1] === c) continue;
        if (c === "_" && s[j + 1] && WORD.test(s[j + 1])) continue;
        flush();
        out.push(<em key={key()}>{inline(s.slice(i + 1, j), ctx)}</em>);
        i = j + 1;
        continue outer;
      }
    }

    if (c === "<") {
      const m = s.slice(i + 1).match(URL_AT);
      if (m && s[i + 1 + m[0].length] === ">") {
        flush();
        out.push(
          <a key={key()} href={m[0]} target="_blank" rel="noreferrer noopener" className="message-link">
            {m[0]}
          </a>,
        );
        i += m[0].length + 2;
        continue;
      }
    }

    if ((c === "h" || c === "H") && (!prev || !WORD.test(prev))) {
      const m = s.slice(i).match(URL_AT);
      if (m) {
        const url = trimUrl(m[0]);
        flush();
        out.push(
          <a key={key()} href={url} target="_blank" rel="noreferrer noopener" className="message-link">
            {url}
          </a>,
        );
        i += url.length;
        continue;
      }
    }

    if (c === "@" && (!prev || !WORD.test(prev))) {
      const rest = s.slice(i + 1).toLowerCase();
      for (const name of ["everyone", "here", ...ctx.sortedNames]) {
        const n = name.toLowerCase();
        if (!rest.startsWith(n)) continue;
        const after = rest[n.length];
        if (after && WORD.test(after)) continue;
        const shown = s.slice(i, i + 1 + name.length);
        const me = name === "everyone" || name === "here" || (!!ctx.myName && n === ctx.myName.toLowerCase());
        flush();
        out.push(
          <span
            key={key()}
            className={`mention ${me ? "me" : ""}`}
            onClick={ctx.onMentionClick && name !== "everyone" && name !== "here" ? (e) => ctx.onMentionClick?.(name, e) : undefined}
          >
            {shown}
          </span>,
        );
        i += 1 + name.length;
        continue outer;
      }
    }

    buf += c;
    i++;
  }
  flush();
  return out;
}

function blocks(text: string, ctx: Ctx): ReactNode[] {
  const out: ReactNode[] = [];
  const lines = text.split("\n");
  let plain: string[] = [];
  let quote: string[] = [];
  const key = () => `b${ctx.k++}`;
  const flushPlain = () => {
    if (!plain.length) return;
    const joined = plain.join("\n");
    if (joined) out.push(<span key={key()}>{inline(joined, ctx)}</span>);
    plain = [];
  };
  const flushQuote = () => {
    if (!quote.length) return;
    out.push(
      <blockquote key={key()} className="md-quote">
        {inline(quote.join("\n"), ctx)}
      </blockquote>,
    );
    quote = [];
  };
  for (const line of lines) {
    const q = line.match(/^>\s?(.*)$/);
    if (q && !line.startsWith(">>")) {
      flushPlain();
      quote.push(q[1]);
      continue;
    }
    flushQuote();
    const h = line.match(/^(#{1,3}|-#)\s+(.+)$/);
    if (h) {
      flushPlain();
      const cls = h[1] === "-#" ? "md-sub" : `md-h${h[1].length}`;
      out.push(
        <div key={key()} className={cls}>
          {inline(h[2], ctx)}
        </div>,
      );
      continue;
    }
    plain.push(line);
  }
  flushPlain();
  flushQuote();
  return out;
}

/** Message text → React nodes with formatting, links and @mentions. */
export function renderMessage(text: string, opts: RenderOptions = {}): ReactNode {
  const ctx: Ctx = {
    ...opts,
    k: 0,
    sortedNames: [...new Set(opts.names ?? [])].filter(Boolean).sort((a, b) => b.length - a.length),
  };
  const out: ReactNode[] = [];
  const fence = /```(?:([\w+-]{1,20})\n)?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(text))) {
    if (!m[2].trim()) continue;
    if (m.index > last) out.push(...blocks(text.slice(last, m.index).replace(/\n$/, ""), ctx));
    out.push(
      <pre key={`c${ctx.k++}`} className="md-codeblock">
        <code>{m[2].replace(/^\n+|\n+$/g, "")}</code>
      </pre>,
    );
    last = fence.lastIndex;
  }
  if (last < text.length) out.push(...blocks(last ? text.slice(last).replace(/^\n/, "") : text, ctx));
  return out;
}

/** The text without code and spoilers — what link previews / inline images may look at. */
export function visibleText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/\|\|[\s\S]*?\|\|/g, " ");
}

/** Links that should get a preview card (not <wrapped>, not direct images), max 3. */
export function previewLinksIn(text: string, isImage: (url: string) => boolean): string[] {
  const t = visibleText(text);
  const out: string[] = [];
  for (const m of t.matchAll(/(<)?(https?:\/\/[^\s<>]+)/g)) {
    if (m[1]) continue;
    const url = trimUrl(m[2]);
    if (isImage(url) || out.includes(url)) continue;
    out.push(url);
    if (out.length >= 3) break;
  }
  return out;
}
