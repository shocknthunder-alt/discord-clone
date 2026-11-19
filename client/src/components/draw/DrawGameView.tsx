import { DRAW_H, DRAW_W, SocketEvents, type DrawChatLine, type DrawOp, type DrawStateDTO, type DrawTopRow } from "@discord-clone/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSocket } from "../../socket/socket";
import { useAuthStore } from "../../store/authStore";
import { playNotifySound } from "../../utils/voiceSounds";
import { tr } from "../../i18n";
import { BG, drawOp, drawSegment, replay } from "./drawCanvas";
import "./draw.css";

const COLORS = [
  "#000000", "#4b4b4b", "#9a9a9a", "#ffffff", "#7a3b12", "#c46a2b", "#ffb38a",
  "#e0262f", "#ff6f91", "#ff9f1c", "#ffd60a", "#2ec27e", "#126e3a", "#4cc9f0",
  "#1c64f2", "#0b2a6f", "#7b2ff7", "#c77dff",
];
const SIZES = [3, 7, 14, 28];

type Tool = "pen" | "eraser" | "fill";

/** 🎨 "Рисувай и познай" — the game screen of a "draw" channel. */
export default function DrawGameView({ channelId }: { channelId: string }) {
  const me = useAuthStore((s) => s.user?.id);
  const [state, setState] = useState<DrawStateDTO | null>(null);
  const [lines, setLines] = useState<DrawChatLine[]>([]);
  const [clockSkew, setClockSkew] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const opsRef = useRef<DrawOp[]>([]);

  const isDrawer = !!state && state.drawerId === me && state.phase === "drawing";
  const amPlayer = !!state?.players.some((p) => p.userId === me && !p.away);

  // ---------------------------------------------------------------- socket
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const watch = () => socket.emit(SocketEvents.DrawWatch, { channelId });
    watch();
    let lastPhaseKey = "";
    const onState = (s: DrawStateDTO) => {
      if (s.channelId !== channelId) return;
      setClockSkew(Date.now() - s.serverNow);
      setState(s);
      // "Your turn to draw" — a sound if the window isn't in front.
      const key = `${s.phase}:${s.drawerId}:${s.round}`;
      if (key !== lastPhaseKey && s.phase === "choosing" && s.drawerId === useAuthStore.getState().user?.id && !document.hasFocus()) playNotifySound();
      lastPhaseKey = key;
    };
    const onCanvas = (p: { channelId: string; ops: DrawOp[] }) => {
      if (p.channelId !== channelId) return;
      opsRef.current = [...p.ops];
      if (ctxRef.current) replay(ctxRef.current, opsRef.current);
    };
    const onOps = (p: { channelId: string; ops: DrawOp[] }) => {
      if (p.channelId !== channelId) return;
      opsRef.current.push(...p.ops);
      const ctx = ctxRef.current;
      if (ctx) for (const op of p.ops) drawOp(ctx, op);
    };
    const onChat = (line: DrawChatLine) => {
      if (line.channelId !== channelId) return;
      setLines((l) => [...l.slice(-199), line]);
    };
    socket.on("connect", watch);
    socket.on(SocketEvents.DrawState, onState);
    socket.on(SocketEvents.DrawCanvas, onCanvas);
    socket.on(SocketEvents.DrawOps, onOps);
    socket.on(SocketEvents.DrawChat, onChat);
    return () => {
      socket.emit(SocketEvents.DrawUnwatch, { channelId });
      socket.off("connect", watch);
      socket.off(SocketEvents.DrawState, onState);
      socket.off(SocketEvents.DrawCanvas, onCanvas);
      socket.off(SocketEvents.DrawOps, onOps);
      socket.off(SocketEvents.DrawChat, onChat);
      setState(null);
      setLines([]);
      opsRef.current = [];
    };
  }, [channelId]);

  const emit = useCallback((event: string, data: Record<string, unknown> = {}) => getSocket()?.emit(event, { channelId, ...data }), [channelId]);

  // ---------------------------------------------------------------- canvas setup
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctxRef.current = ctx;
    replay(ctx, opsRef.current);
  }, []);

  // ---------------------------------------------------------------- drawing (drawer only)
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#000000");
  const [size, setSize] = useState(7);
  const stroke = useRef<{ id: number; c: string; w: number; last: [number, number]; pending: number[] } | null>(null);
  const outbox = useRef<DrawOp[]>([]);

  const flush = useCallback(() => {
    const s = stroke.current;
    if (s && s.pending.length > 2) {
      const op: DrawOp = { t: "line", id: s.id, c: s.c, w: s.w, p: s.pending };
      outbox.current.push(op);
      opsRef.current.push(op);
      // the next chunk starts where this one ended so the line stays joined
      s.pending = [s.last[0], s.last[1]];
    }
    if (outbox.current.length) {
      emit(SocketEvents.DrawOps, { ops: outbox.current });
      outbox.current = [];
    }
  }, [emit]);

  useEffect(() => {
    if (!isDrawer) return;
    const t = setInterval(flush, 50);
    return () => clearInterval(t);
  }, [isDrawer, flush]);

  function toCanvas(e: React.PointerEvent): [number, number] {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * DRAW_W);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * DRAW_H);
    return [Math.min(Math.max(x, 0), DRAW_W - 1), Math.min(Math.max(y, 0), DRAW_H - 1)];
  }

  const newId = () => Math.floor(Math.random() * 2_000_000_000);

  function onPointerDown(e: React.PointerEvent) {
    if (!isDrawer || !ctxRef.current) return;
    e.preventDefault();
    const [x, y] = toCanvas(e);
    if (tool === "fill") {
      const op: DrawOp = { t: "fill", id: newId(), c: color, x, y };
      drawOp(ctxRef.current, op);
      opsRef.current.push(op);
      outbox.current.push(op);
      flush();
      return;
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const c = tool === "eraser" ? BG : color;
    const w = tool === "eraser" ? Math.max(size * 2, 12) : size;
    stroke.current = { id: newId(), c, w, last: [x, y], pending: [x, y] };
    drawSegment(ctxRef.current, c, w, [x, y]);
  }

  function onPointerMove(e: React.PointerEvent) {
    const s = stroke.current;
    if (!s || !ctxRef.current) return;
    const [x, y] = toCanvas(e);
    if (Math.abs(x - s.last[0]) + Math.abs(y - s.last[1]) < 2) return;
    drawSegment(ctxRef.current, s.c, s.w, [s.last[0], s.last[1], x, y]);
    s.last = [x, y];
    s.pending.push(x, y);
    if (s.pending.length > 400) flush();
  }

  function onPointerUp() {
    const s = stroke.current;
    if (!s) return;
    if (s.pending.length === 2) {
      // a dot
      const op: DrawOp = { t: "line", id: s.id, c: s.c, w: s.w, p: s.pending };
      outbox.current.push(op);
      opsRef.current.push(op);
      s.pending = [];
    }
    flush();
    stroke.current = null;
  }

  function undo() {
    flush();
    emit(SocketEvents.DrawUndo);
  }

  // Ctrl+Z while drawing.
  useEffect(() => {
    if (!isDrawer) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDrawer]);

  // ---------------------------------------------------------------- timer
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const left = state?.endsAt ? Math.max(0, Math.ceil((state.endsAt - (now - clockSkew)) / 1000)) : null;
  const totalForPhase = state?.phase === "drawing" ? state.seconds : state?.phase === "choosing" ? 15 : 6;
  const leftShare = left !== null ? Math.min(1, left / totalForPhase) : 0;

  // ---------------------------------------------------------------- chat
  const [text, setText] = useState("");
  const chatEnd = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "end" });
  }, [lines.length]);
  function sendGuess() {
    const t = text.trim();
    if (!t) return;
    emit(SocketEvents.DrawGuess, { text: t });
    setText("");
  }

  const drawer = state?.players.find((p) => p.userId === state.drawerId);
  const sorted = [...(state?.players ?? [])].sort((a, b) => b.score - a.score);
  const inGame = state && state.phase !== "lobby" && state.phase !== "over";
  const meGuessed = !!state?.players.find((p) => p.userId === me)?.guessed;

  return (
    <div className="draw-game">
      <div className="draw-top">
        <div className="draw-round">
          {inGame ? (
            <>
              {tr("Рунд", "Round")} <b>{state.round}</b>/{state.rounds}
            </>
          ) : (
            <>🎨 {tr("Рисувай и познай", "Draw & guess")}</>
          )}
        </div>
        <div className="draw-word">
          {state?.phase === "drawing" || state?.phase === "reveal" ? (
            <>
              <WordBoxes word={state.word} known={state.youKnow} />
              <span className="draw-word-len">{state.wordLengths.join(" + ")}</span>
            </>
          ) : state?.phase === "choosing" ? (
            <span className="draw-word-wait">{state.drawerId === me ? tr("Избери дума", "Pick a word") : `${drawer?.username ?? "…"} ${tr("избира дума…", "is picking a word…")}`}</span>
          ) : null}
        </div>
        <div className={`draw-timer ${left !== null && left <= 10 && state?.phase === "drawing" ? "hurry" : ""}`} style={{ ["--left" as string]: `${leftShare * 360}deg` }}>
          <span>{left ?? "–"}</span>
        </div>
      </div>

      <div className="draw-main">
        <aside className="draw-players">
          {sorted.map((p, i) => (
            <div key={p.userId} className={`draw-player ${p.userId === state?.drawerId ? "drawing" : ""} ${p.guessed ? "guessed" : ""} ${p.away ? "away" : ""}`}>
              <span className="draw-player-rank">#{i + 1}</span>
              {p.avatarUrl ? <img className="draw-player-avatar" src={p.avatarUrl} alt="" /> : <span className="draw-player-avatar placeholder">{p.username.slice(0, 2).toUpperCase()}</span>}
              <span className="draw-player-text">
                <b>
                  {p.username}
                  {p.userId === me && <small> ({tr("ти", "you")})</small>}
                </b>
                <small>
                  {p.score} {tr("т.", "pts")}
                </small>
              </span>
              <span className="draw-player-flag">{p.userId === state?.drawerId && inGame ? "✏️" : p.guessed ? "✅" : p.away ? "💤" : ""}</span>
            </div>
          ))}
          {!sorted.length && <div className="draw-empty">{tr("Още няма играчи.", "No players yet.")}</div>}
        </aside>

        <div className="draw-stage">
          <div className="draw-canvas-wrap">
            <canvas
              ref={canvasRef}
              width={DRAW_W}
              height={DRAW_H}
              className={`draw-canvas ${isDrawer ? `can-draw tool-${tool}` : ""}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
            {state && (
              <Overlay
                state={state}
                me={me}
                amPlayer={amPlayer}
                onJoin={() => emit(SocketEvents.DrawJoin)}
                onLeave={() => emit(SocketEvents.DrawLeave)}
                onStart={(rounds, seconds) => emit(SocketEvents.DrawStart, { rounds, seconds })}
                onPick={(index) => emit(SocketEvents.DrawPick, { index })}
                channelId={channelId}
              />
            )}
          </div>

          {isDrawer && (
            <div className="draw-tools">
              <div className="draw-colors">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    className={`draw-color ${color === c && tool !== "eraser" ? "on" : ""}`}
                    style={{ background: c }}
                    onClick={() => {
                      setColor(c);
                      if (tool === "eraser") setTool("pen");
                    }}
                    aria-label={c}
                  />
                ))}
              </div>
              <div className="draw-sizes">
                {SIZES.map((s) => (
                  <button key={s} className={`draw-size ${size === s ? "on" : ""}`} onClick={() => setSize(s)} title={`${s}px`}>
                    <span style={{ width: Math.min(s, 24), height: Math.min(s, 24) }} />
                  </button>
                ))}
              </div>
              <div className="draw-tool-buttons">
                <button className={tool === "pen" ? "on" : ""} onClick={() => setTool("pen")} title={tr("Молив", "Pen")}>
                  ✏️
                </button>
                <button className={tool === "fill" ? "on" : ""} onClick={() => setTool("fill")} title={tr("Кофа (запълни)", "Fill bucket")}>
                  🪣
                </button>
                <button className={tool === "eraser" ? "on" : ""} onClick={() => setTool("eraser")} title={tr("Гума", "Eraser")}>
                  🧽
                </button>
                <button onClick={undo} title={tr("Върни (Ctrl+Z)", "Undo (Ctrl+Z)")}>
                  ↶
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(tr("Да изчистя ли цялата рисунка?", "Clear the whole picture?"))) {
                      flush();
                      emit(SocketEvents.DrawClear);
                    }
                  }}
                  title={tr("Изчисти всичко", "Clear all")}
                >
                  🗑️
                </button>
              </div>
            </div>
          )}
          {inGame && amPlayer && (
            <button className="draw-stop" onClick={() => window.confirm(tr("Да спра ли играта за всички?", "Stop the game for everyone?")) && emit(SocketEvents.DrawStop)}>
              ⏹ {tr("Спри играта", "Stop the game")}
            </button>
          )}
        </div>

        <aside className="draw-chat">
          <div className="draw-chat-lines">
            {lines.map((l) => (
              <div key={l.id} className={`draw-line ${l.kind}`}>
                {l.kind === "guess" ? (
                  <>
                    <b>{l.username}:</b> {l.text}
                  </>
                ) : (
                  l.text
                )}
              </div>
            ))}
            <div ref={chatEnd} />
          </div>
          <div className="draw-chat-input">
            <input
              value={text}
              maxLength={120}
              placeholder={
                state?.phase === "drawing"
                  ? isDrawer || meGuessed
                    ? tr("Чат само с познали (без спойлери)", "Chat with those who guessed")
                    : tr("Пиши догадка и Enter…", "Type a guess, Enter…")
                  : tr("Пиши в чата…", "Chat…")
              }
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendGuess();
              }}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

function WordBoxes({ word, known }: { word: string; known: boolean }) {
  return (
    <span className={`draw-word-boxes ${known ? "known" : ""}`}>
      {[...word].map((ch, i) =>
        ch === " " ? <span key={i} className="draw-word-gap" /> : <span key={i} className={`draw-letter ${ch === "_" ? "hidden" : ""}`}>{ch === "_" ? "" : ch}</span>,
      )}
    </span>
  );
}

function Overlay({
  state,
  me,
  amPlayer,
  onJoin,
  onLeave,
  onStart,
  onPick,
  channelId,
}: {
  state: DrawStateDTO;
  me: string | undefined;
  amPlayer: boolean;
  onJoin: () => void;
  onLeave: () => void;
  onStart: (rounds: number, seconds: number) => void;
  onPick: (index: number) => void;
  channelId: string;
}) {
  const [rounds, setRounds] = useState(3);
  const [seconds, setSeconds] = useState(80);
  const [top, setTop] = useState<DrawTopRow[] | null>(null);
  const activeCount = state.players.filter((p) => !p.away).length;

  function loadTop() {
    getSocket()?.emit(SocketEvents.DrawTop, { channelId }, (rows: DrawTopRow[]) => setTop(rows));
  }

  if (state.phase === "choosing") {
    if (state.drawerId !== me || !state.choices) return null;
    return (
      <div className="draw-overlay">
        <div className="draw-card">
          <h3>✏️ {tr("Твой ред е! Избери какво да нарисуваш:", "Your turn! Pick what to draw:")}</h3>
          <div className="draw-choices">
            {state.choices.map((w, i) => (
              <button key={w} onClick={() => onPick(i)}>
                {w}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (state.phase === "reveal") {
    const gains = [...state.players].filter((p) => p.lastGain > 0).sort((a, b) => b.lastGain - a.lastGain);
    return (
      <div className="draw-overlay soft">
        <div className="draw-card">
          <div className="draw-reveal-label">{tr("Думата беше", "The word was")}</div>
          <div className="draw-reveal-word">{state.word}</div>
          {gains.length ? (
            <div className="draw-gains">
              {gains.map((p) => (
                <div key={p.userId}>
                  {p.userId === state.drawerId ? "✏️" : "✅"} {p.username} <b>+{p.lastGain}</b>
                </div>
              ))}
            </div>
          ) : (
            <div className="draw-muted">{tr("Никой не позна 😅", "Nobody got it 😅")}</div>
          )}
        </div>
      </div>
    );
  }

  if (state.phase === "drawing") return null;

  // lobby / over
  const podium = state.phase === "over" ? [...state.players].sort((a, b) => b.score - a.score).slice(0, 3) : [];
  return (
    <div className="draw-overlay">
      <div className="draw-card wide">
        {state.phase === "over" && podium.length > 0 && podium[0]!.score > 0 ? (
          <div className="draw-podium">
            {podium.map((p, i) => (
              <div key={p.userId} className={`draw-podium-place p${i + 1}`}>
                <span className="draw-medal">{["🥇", "🥈", "🥉"][i]}</span>
                <b>{p.username}</b>
                <small>
                  {p.score} {tr("т.", "pts")}
                </small>
              </div>
            ))}
          </div>
        ) : (
          <>
            <h2>🎨 {tr("Рисувай и познай", "Draw & guess")}</h2>
            <p className="draw-muted">
              {tr(
                "Един рисува, останалите пишат догадки. Колкото по-бързо познаеш, толкова повече точки. Рисуващият печели за всеки, който познае.",
                "One draws, the rest type guesses. The faster you guess, the more points. The drawer scores for everyone who gets it.",
              )}
            </p>
          </>
        )}

        <div className="draw-lobby-row">
          {amPlayer ? (
            <button className="draw-btn" onClick={onLeave}>
              {tr("Излез от играта", "Leave the game")}
            </button>
          ) : (
            <button className="draw-btn primary" onClick={onJoin}>
              ➕ {tr("Включи се", "Join")}
            </button>
          )}
          <span className="draw-muted">
            {activeCount} {tr(activeCount === 1 ? "играч" : "играчи", activeCount === 1 ? "player" : "players")}
          </span>
        </div>

        {amPlayer && (
          <div className="draw-lobby-row">
            <label>
              {tr("Рундове", "Rounds")}
              <select value={rounds} onChange={(e) => setRounds(Number(e.target.value))}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tr("Секунди", "Seconds")}
              <select value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}>
                {[45, 60, 80, 100, 120].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button className="draw-btn primary" disabled={activeCount < 2} onClick={() => onStart(rounds, seconds)} title={activeCount < 2 ? tr("Трябват поне двама", "Needs at least two") : undefined}>
              ▶ {state.phase === "over" ? tr("Нова игра", "New game") : tr("Започни", "Start")}
            </button>
          </div>
        )}
        {amPlayer && activeCount < 2 && <div className="draw-muted">{tr("Чакаме още поне един играч…", "Waiting for at least one more player…")}</div>}

        <div className="draw-lobby-row">
          <button className="draw-btn" onClick={top ? () => setTop(null) : loadTop}>
            🏆 {top ? tr("Скрий класацията", "Hide the ranking") : tr("Класация на сървъра", "Server ranking")}
          </button>
        </div>
        {top && (
          <div className="draw-top-list">
            {top.length === 0 && <div className="draw-muted">{tr("Още няма изиграни игри.", "No games played yet.")}</div>}
            {top.map((r, i) => (
              <div key={r.username}>
                <span>{["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`}</span> <b>{r.username}</b> — {r.points} {tr("т.", "pts")} · {r.wins} 🏆 · {r.games} {tr("игри", "games")}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
