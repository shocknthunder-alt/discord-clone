import { useCallback, useEffect, useRef, useState } from "react";
import { http } from "../../api/http";
import { tr } from "../../i18n";
import { useAuthStore } from "../../store/authStore";
import { matchMusic } from "../blocks/music";
import "../blocks/blocks.css";
import { Gem, GemDefs, GEM_COLORS } from "./Gems";
import { MatchBoard, SIZE, type Pos, type Step, type Tile } from "./engine";
import { matchSound } from "./sounds";
import "./match.css";

/** 🍬 Шмиксер — the screen of a "match" channel: solo match-3 + the server's top lists. */

type Mode = "time" | "moves";
const TIME_S = 240;
const SIZE_KEY = "matchBoardSize";
const MIN_W = 260;
const MAX_W = 1600;
const MOVES = 30;

interface TopRow {
  userId: string;
  username: string;
  avatarUrl: string | null;
  best: number;
  combo: number;
  games: number;
}
interface Mine {
  best: number;
  games: number;
  combo: number;
}
type Lists = Record<Mode, { top: TopRow[]; mine: Mine | null }>;

interface ViewTile {
  tile: Tile;
  r: number;
  c: number;
  pop?: boolean;
  fresh?: boolean; // just made (a special)
  swap?: boolean; // sliding in a swap (quicker, eased both ways)
}
interface Fx {
  id: number;
  kind: "spark" | "beamRow" | "beamCol" | "ring" | "flash" | "score";
  r: number;
  c: number;
  color?: string;
  dx?: number;
  dy?: number;
  text?: string;
  big?: boolean;
}

interface Saved {
  board: MatchBoard;
  mode: Mode;
  timeLeft: number;
  movesLeft: number;
}
/** An unfinished game survives leaving the channel (kept paused per channel). */
const savedGames = new Map<string, Saved>();

const fmt = (n: number) => n.toLocaleString("bg-BG");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const POP_MS = 230;
const FALL_MS = 280;

function viewOf(board: MatchBoard): Record<number, ViewTile> {
  const out: Record<number, ViewTile> = {};
  board.grid.forEach((row, r) => row.forEach((t, c) => t && (out[t.id] = { tile: t, r, c })));
  return out;
}

function comboName(combo: number) {
  if (combo >= 7) return tr("Невероятно!", "Incredible!");
  if (combo >= 5) return tr("Машина!", "Machine!");
  if (combo >= 3) return tr("Супер!", "Super!");
  return tr("Комбо", "Combo");
}

export default function MatchGameView({ channelId }: { channelId: string }) {
  const me = useAuthStore((s) => s.user);
  const [resumed] = useState(() => savedGames.get(channelId) ?? null);
  const boardRef = useRef<MatchBoard | null>(resumed?.board ?? null);
  const [phase, setPhase] = useState<"idle" | "playing" | "over">(resumed ? "playing" : "idle");
  const [paused, setPaused] = useState(!!resumed);
  const [mode, setMode] = useState<Mode>(resumed?.mode ?? ((localStorage.getItem("matchMode") as Mode) || "time"));
  const [tiles, setTiles] = useState<Record<number, ViewTile>>(() => (resumed ? viewOf(resumed.board) : {}));
  const [fx, setFx] = useState<Fx[]>([]);
  const [score, setScore] = useState(resumed?.board.score ?? 0);
  const [combo, setCombo] = useState<{ n: number; key: number } | null>(null);
  const [timeLeft, setTimeLeft] = useState(resumed?.timeLeft ?? TIME_S);
  const [movesLeft, setMovesLeft] = useState(resumed?.movesLeft ?? MOVES);
  const [selected, setSelected] = useState<Pos | null>(null);
  const [hint, setHint] = useState<number[]>([]);
  const [shake, setShake] = useState(false);
  const shakeTimer = useRef<number | undefined>(undefined);
  const [lists, setLists] = useState<Lists | null>(null);
  const [tab, setTab] = useState<Mode>(mode);
  const [result, setResult] = useState<{ score: number; combo: number; record: boolean; saved: boolean } | null>(null);
  const [sound, setSound] = useState(() => localStorage.getItem("matchSound") !== "off");
  const [musicOn, setMusicOn] = useState(() => localStorage.getItem("matchMusic") !== "off");
  const [musicVol, setMusicVol] = useState(() => {
    const v = localStorage.getItem("matchMusicVol");
    return v !== null && Number.isFinite(Number(v)) ? Number(v) : 50;
  });
  const busy = useRef(false);
  const fxId = useRef(0);
  const lastInput = useRef(Date.now());
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const boardEl = useRef<HTMLDivElement>(null);
  const timeRef = useRef(timeLeft);
  timeRef.current = timeLeft;
  const movesRef = useRef(movesLeft);
  movesRef.current = movesLeft;
  const sfx = <K extends keyof typeof matchSound>(k: K, ...a: Parameters<(typeof matchSound)[K]>) => {
    if (soundRef.current) (matchSound[k] as (...x: unknown[]) => void)(...a);
  };

  const load = useCallback(() => {
    http
      .get<Lists>(`/api/text-channels/${channelId}/match`)
      .then((r) => setLists(r.data))
      .catch(() => {});
  }, [channelId]);
  useEffect(load, [load]);

  const addFx = (items: Omit<Fx, "id">[], ms: number) => {
    const made = items.map((f) => ({ ...f, id: ++fxId.current }));
    setFx((cur) => [...cur.slice(-300), ...made]);
    const ids = new Set(made.map((m) => m.id));
    setTimeout(() => setFx((cur) => cur.filter((f) => !ids.has(f.id))), ms);
  };

  const start = () => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    const board = new MatchBoard();
    boardRef.current = board;
    savedGames.delete(channelId);
    localStorage.setItem("matchMode", mode);
    setTab(mode);
    setTiles(viewOf(board));
    setScore(0);
    setTimeLeft(TIME_S);
    setMovesLeft(MOVES);
    setResult(null);
    setSelected(null);
    setHint([]);
    setPaused(false);
    matchMusic.stop();
    setPhase("playing");
    lastInput.current = Date.now();
  };

  const finish = useCallback(() => {
    const board = boardRef.current;
    if (!board) return;
    setPhase("over");
    savedGames.delete(channelId);
    sfx("over");
    const res = { score: board.score, combo: board.bestCombo, record: false, saved: false };
    setResult(res);
    if (board.score <= 0) return;
    http
      .post<Lists & { record: boolean }>(`/api/text-channels/${channelId}/match/score`, { mode, score: board.score, combo: board.bestCombo, moves: board.moves })
      .then((r) => {
        setLists({ time: r.data.time, moves: r.data.moves });
        setResult({ ...res, record: r.data.record, saved: true });
        if (r.data.record) sfx("record");
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, mode]);

  /** Animate one step: pop → effects → fall + new gems from the top. */
  const playStep = async (st: Step) => {
    const ids = new Set(st.popped.map((p) => p.tile.id));
    setTiles((cur) => {
      const next = { ...cur };
      for (const [id, v] of Object.entries(next)) if (v.swap) next[Number(id)] = { ...v, swap: false };
      for (const id of ids) if (next[id]) next[id] = { ...next[id]!, pop: true };
      return next;
    });
    // effects
    const items: Omit<Fx, "id">[] = [];
    for (const p of st.popped.slice(0, 40)) {
      const color = p.tile.special === "prism" ? "#fff" : GEM_COLORS[p.tile.color] ?? "#fff";
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = 30 + Math.random() * 45;
        items.push({ kind: "spark", r: p.r, c: p.c, color, dx: Math.cos(a) * d, dy: Math.sin(a) * d });
      }
    }
    let bigShake = false;
    for (const b of st.blasts) {
      if (b.kind === "rowRocket") items.push({ kind: "beamRow", r: b.r, c: b.c });
      else if (b.kind === "colRocket") items.push({ kind: "beamCol", r: b.r, c: b.c });
      else if (b.kind === "cross") items.push({ kind: "beamRow", r: b.r, c: b.c }, { kind: "beamCol", r: b.r, c: b.c });
      else if (b.kind === "bomb" || b.kind === "bigBomb") {
        items.push({ kind: "ring", r: b.r, c: b.c, big: b.kind === "bigBomb" });
        bigShake = true;
      } else items.push({ kind: "flash", r: b.r, c: b.c });
    }
    const cr = st.popped.reduce((s, p) => s + p.r, 0) / Math.max(1, st.popped.length);
    const cc = st.popped.reduce((s, p) => s + p.c, 0) / Math.max(1, st.popped.length);
    items.push({ kind: "score", r: cr, c: cc, text: `+${fmt(st.points)}`, big: st.points >= 1000 });
    addFx(items, 900);
    if (bigShake || st.blasts.some((b) => b.kind === "board")) {
      setShake(false);
      requestAnimationFrame(() => setShake(true));
      window.clearTimeout(shakeTimer.current);
      shakeTimer.current = window.setTimeout(() => setShake(false), 420);
    }
    // sounds
    sfx("pop", st.popped.length, st.combo);
    const kinds = new Set(st.blasts.map((b) => b.kind));
    if (kinds.has("rowRocket") || kinds.has("colRocket") || kinds.has("cross")) sfx("rocket");
    if (kinds.has("bomb") || kinds.has("bigBomb")) sfx("bomb", kinds.has("bigBomb"));
    if (kinds.has("allColor") || kinds.has("board") || kinds.has("prism")) sfx("prism", kinds.has("board"));
    if (st.made.length) setTimeout(() => sfx("made"), 120);
    if (st.combo >= 2) {
      setCombo((c) => ({ n: st.combo, key: (c?.key ?? 0) + 1 }));
      if (st.combo === 5 || st.combo === 7) sfx("fanfare", st.combo);
    }
    setScore((s) => s + st.points);
    await sleep(POP_MS);

    // remove popped, add specials made, move the rest down, new ones start above the board
    setTiles((cur) => {
      const next: Record<number, ViewTile> = {};
      for (const [id, v] of Object.entries(cur)) if (!ids.has(Number(id))) next[Number(id)] = v;
      for (const m of st.made) next[m.tile.id] = { tile: m.tile, r: m.r, c: m.c, fresh: true };
      for (const f of st.falls) if (next[f.id]) next[f.id] = { ...next[f.id]!, r: f.r, c: f.c };
      for (const s of st.spawned) next[s.tile.id] = { tile: s.tile, r: s.fromR, c: s.c };
      return next;
    });
    // next frame: let the new ones fall into place
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    setTiles((cur) => {
      const next = { ...cur };
      for (const s of st.spawned) if (next[s.tile.id]) next[s.tile.id] = { ...next[s.tile.id]!, r: s.r };
      return next;
    });
    await sleep(FALL_MS);
    sfx("land");
  };

  const trySwap = async (a: Pos, b: Pos) => {
    const board = boardRef.current;
    if (!board || busy.current || phase !== "playing" || paused) return;
    if (Math.abs(a.r - b.r) + Math.abs(a.c - b.c) !== 1) return;
    busy.current = true;
    setSelected(null);
    setHint([]);
    lastInput.current = Date.now();
    const ta = board.at(a)!;
    const tb = board.at(b)!;
    const res = board.swap(a, b);
    sfx("swap");
    setTiles((cur) => ({ ...cur, [ta.id]: { ...cur[ta.id]!, r: b.r, c: b.c, swap: true }, [tb.id]: { ...cur[tb.id]!, r: a.r, c: a.c, swap: true } }));
    await sleep(170);
    if (!res.ok) {
      sfx("invalid");
      setTiles((cur) => ({ ...cur, [ta.id]: { ...cur[ta.id]!, r: a.r, c: a.c }, [tb.id]: { ...cur[tb.id]!, r: b.r, c: b.c } }));
      await sleep(170);
      busy.current = false;
      return;
    }
    if (mode === "moves") setMovesLeft((m) => m - 1);
    for (const st of res.steps) await playStep(st);
    if (res.shuffled) {
      sfx("shuffle");
      addFx([{ kind: "score", r: 3.5, c: 3.5, text: tr("Разбъркване!", "Shuffle!"), big: true }], 1100);
    }
    setTiles(viewOf(board)); // exact state of the board (also after a shuffle)
    setScore(board.score);
    busy.current = false;
    lastInput.current = Date.now();
    if ((mode === "moves" && movesRef.current <= 0) || (mode === "time" && timeRef.current <= 0)) finish();
  };

  // ⏱ the clock (time mode), paused with the game
  useEffect(() => {
    if (phase !== "playing" || paused || mode !== "time") return;
    let last = performance.now();
    const t = window.setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      setTimeLeft((v) => {
        const nv = Math.max(0, v - dt);
        if (Math.ceil(nv) !== Math.ceil(v) && nv <= 10 && nv > 0) sfx("tick", nv <= 5);
        return nv;
      });
    }, 100);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, paused, mode]);
  useEffect(() => {
    if (phase === "playing" && mode === "time" && timeLeft <= 0 && !busy.current) finish();
  }, [timeLeft, phase, mode, finish]);

  // 💡 hint after a few idle seconds
  useEffect(() => {
    if (phase !== "playing" || paused) return;
    const t = window.setInterval(() => {
      const board = boardRef.current;
      if (!board || busy.current || hint.length || Date.now() - lastInput.current < 6000) return;
      const mv = board.findMove();
      if (mv) setHint([board.at(mv[0])!.id, board.at(mv[1])!.id]);
    }, 500);
    return () => window.clearInterval(t);
  }, [phase, paused, hint.length]);

  // pause when the window loses focus / the tab is hidden
  useEffect(() => {
    if (phase !== "playing") return;
    const pause = () => setPaused(true);
    const vis = () => document.hidden && pause();
    window.addEventListener("blur", pause);
    document.addEventListener("visibilitychange", vis);
    const key = (e: KeyboardEvent) => {
      if ((e.code === "KeyP" || e.code === "Escape") && !(e.target instanceof HTMLInputElement)) setPaused((p) => !p);
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("blur", pause);
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("keydown", key);
    };
  }, [phase]);

  // leaving the channel keeps an unfinished game (paused)
  useEffect(
    () => () => {
      const board = boardRef.current;
      if (board && phaseRef.current === "playing") savedGames.set(channelId, { board, mode: modeRef.current, timeLeft: timeRef.current, movesLeft: movesRef.current });
      matchMusic.stop();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // Dev / e2e only: a valid move on the current board (so tests can play).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __matchMove?: () => [Pos, Pos] | null; __matchBusy?: () => boolean };
    w.__matchMove = () => boardRef.current?.findMove() ?? null;
    w.__matchBusy = () => busy.current;
    return () => {
      delete w.__matchMove;
      delete w.__matchBusy;
    };
  }, []);

  // 🎵 music: playful; the last 20 s / last 5 moves are faster
  const hurry = phase === "playing" && (mode === "time" ? timeLeft <= 20 : movesLeft <= 5);
  useEffect(() => {
    if (phase === "playing" && musicOn && !paused) matchMusic.play(hurry);
    else if (phase === "over") matchMusic.stop();
    else matchMusic.pause();
  }, [phase, musicOn, paused, hurry]);
  useEffect(() => matchMusic.setVolume(musicVol / 100), [musicVol]);

  // input: tap one gem then a neighbour, or drag a gem towards a neighbour
  const drag = useRef<{ p: Pos; x: number; y: number; done: boolean } | null>(null);
  const cellAt = (x: number, y: number): Pos | null => {
    const el = boardEl.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const c = Math.floor(((x - r.left) / r.width) * SIZE);
    const rr = Math.floor(((y - r.top) / r.height) * SIZE);
    return c >= 0 && c < SIZE && rr >= 0 && rr < SIZE ? { r: rr, c } : null;
  };
  const onDown = (e: React.PointerEvent) => {
    if (phase !== "playing" || paused || busy.current) return;
    const p = cellAt(e.clientX, e.clientY);
    if (!p) return;
    e.preventDefault();
    if (selected && Math.abs(selected.r - p.r) + Math.abs(selected.c - p.c) === 1) {
      void trySwap(selected, p);
      return;
    }
    drag.current = { p, x: e.clientX, y: e.clientY, done: false };
    setSelected(p);
    sfx("select");
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.done) return;
    const size = (boardEl.current?.getBoundingClientRect().width ?? 400) / SIZE;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < size * 0.35) return;
    d.done = true;
    const to = Math.abs(dx) > Math.abs(dy) ? { r: d.p.r, c: d.p.c + Math.sign(dx) } : { r: d.p.r + Math.sign(dy), c: d.p.c };
    void trySwap(d.p, to);
  };
  const onUp = () => {
    drag.current = null;
  };

  // ↘ drag the corner to resize the board (like the stream / Шметрис); double-click = fit the window
  const [customW, setCustomW] = useState<number | null>(() => Number(localStorage.getItem(SIZE_KEY)) || null);
  const [resizing, setResizing] = useState(false);
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = boardEl.current;
    if (!el) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const w0 = el.getBoundingClientRect().width;
    setResizing(true);
    const move = (ev: PointerEvent) => {
      // the board is centred, so sideways travel counts twice; whichever direction moved more wins
      const dx = (ev.clientX - x0) * 2;
      const dy = ev.clientY - y0;
      const grow = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
      setCustomW(Math.round(Math.min(MAX_W, Math.max(MIN_W, w0 + grow))));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setResizing(false);
      setCustomW((w) => {
        if (w) localStorage.setItem(SIZE_KEY, String(w));
        return w;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const resetSize = (e: React.MouseEvent) => {
    e.stopPropagation();
    localStorage.removeItem(SIZE_KEY);
    setCustomW(null);
  };

  const cur = lists?.[tab];
  const mine = lists?.[mode]?.mine;
  const myRank = me && cur ? cur.top.findIndex((r) => r.userId === me.id) : -1;
  const pct = (n: number) => `${(n / SIZE) * 100}%`;

  return (
    <div className={`blk-view mx-view ${resizing ? "resizing" : ""}`}>
      <GemDefs />
      <div className="blk-side blk-left">
        <div className="blk-box blk-stats">
          <div className="blk-label">{tr("Точки", "Score")}</div>
          <div className="blk-score">{fmt(score)}</div>
          {mode === "time" ? (
            <div className={`mx-clock ${phase === "playing" && timeLeft <= 10 ? "urgent" : ""}`}>
              ⏱ {Math.floor(Math.ceil(timeLeft) / 60)}:{String(Math.ceil(timeLeft) % 60).padStart(2, "0")}
            </div>
          ) : (
            <div className={`mx-clock ${phase === "playing" && movesLeft <= 5 ? "urgent" : ""}`}>
              👆 {movesLeft} {tr("хода", "moves")}
            </div>
          )}
          <div className="blk-stat-row">
            <span>{tr("Най-голямо комбо", "Best combo")}</span>
            <b>×{boardRef.current?.bestCombo ?? 0}</b>
          </div>
          {mine && (
            <div className="blk-stat-row blk-best">
              <span>{tr("Моят рекорд", "My best")}</span>
              <b>{fmt(mine.best)}</b>
            </div>
          )}
        </div>
        <div className="blk-box blk-keys mx-help">
          <div>{tr("Размени две съседни камъчета — 3+ еднакви се пръсват.", "Swap two neighbours — 3+ alike pop.")}</div>
          <div>
            <b>4</b> {tr("в редица → ракета", "in a row → rocket")} 🚀
          </div>
          <div>
            <b>Г / Т</b> {tr("→ бомба", "→ bomb")} 💣
          </div>
          <div>
            <b>5</b> {tr("в редица → призма", "in a row → prism")} 🌈
          </div>
          <div>{tr("Две специални заедно = мега взрив!", "Two specials together = mega blast!")}</div>
          <div>
            <kbd>P</kbd> {tr("пауза", "pause")}
          </div>
        </div>
      </div>

      <div className="blk-center">
        <div
          ref={boardEl}
          className={`mx-board ${shake ? "shake" : ""}`}
          style={customW ? { width: customW, minWidth: 0 } : undefined}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          {Object.entries(tiles).map(([id, v]) => (
            <div
              key={id}
              className={`mx-tile ${v.pop ? "pop" : ""} ${v.fresh ? "fresh" : ""} ${hint.includes(Number(id)) ? "hint" : ""} ${selected && selected.r === v.r && selected.c === v.c ? "selected" : ""} ${v.r < 0 ? "above" : ""} ${v.swap ? "swapping" : ""}`}
              style={{ transform: `translate3d(${v.c * 100}%, ${v.r * 100}%, 0)` }}
            >
              <Gem color={v.tile.color} special={v.tile.special} />
            </div>
          ))}
          {fx.map((f) =>
            f.kind === "spark" ? (
              <i key={f.id} className="mx-spark" style={{ left: pct(f.c + 0.5), top: pct(f.r + 0.5), background: f.color, ["--dx" as string]: `${f.dx}px`, ["--dy" as string]: `${f.dy}px` }} />
            ) : f.kind === "beamRow" ? (
              <i key={f.id} className="mx-beam row" style={{ top: pct(f.r) }} />
            ) : f.kind === "beamCol" ? (
              <i key={f.id} className="mx-beam col" style={{ left: pct(f.c) }} />
            ) : f.kind === "ring" ? (
              <i key={f.id} className={`mx-ring ${f.big ? "big" : ""}`} style={{ left: pct(f.c + 0.5), top: pct(f.r + 0.5) }} />
            ) : f.kind === "flash" ? (
              <i key={f.id} className="mx-flash" />
            ) : (
              <span key={f.id} className={`mx-points ${f.big ? "big" : ""}`} style={{ left: pct(f.c + 0.5), top: pct(f.r + 0.5) }}>
                {f.text}
              </span>
            ),
          )}
          {combo && combo.n >= 2 && phase === "playing" && (
            <div key={combo.key} className={`mx-combo c${Math.min(7, combo.n)}`}>
              {comboName(combo.n)} ×{combo.n}
            </div>
          )}

          {phase !== "playing" && (
            <div className="blk-overlay">
              <div className="mx-title">🍬 Шмиксер</div>
              {result && (
                <div className="blk-result">
                  <div className="blk-result-score">{fmt(result.score)}</div>
                  <div>
                    {tr("Най-голямо комбо", "Best combo")} ×{result.combo}
                  </div>
                  {result.record && <div className="blk-record">🏆 {tr("Нов личен рекорд!", "New personal best!")}</div>}
                </div>
              )}
              <div className="mx-modes">
                <button className={mode === "time" ? "on" : ""} onClick={() => setMode("time")}>
                  ⏱ {tr("4 минути", "4 minutes")}
                </button>
                <button className={mode === "moves" ? "on" : ""} onClick={() => setMode("moves")}>
                  👆 {tr("30 хода", "30 moves")}
                </button>
              </div>
              <button className="blk-start" onClick={start}>
                {result ? tr("Нова игра", "New game") : tr("Играй", "Play")}
              </button>
            </div>
          )}
          <div
            className="blk-resize-handle mx-resize"
            title={tr("Влачи за размер · двоен клик = по екрана", "Drag to resize · double-click = fit")}
            onPointerDown={startResize}
            onDoubleClick={resetSize}
          />
          {phase === "playing" && paused && (
            <div className="blk-overlay">
              <div className="blk-paused">{tr("Пауза", "Paused")}</div>
              <button
                className="blk-start"
                onClick={() => {
                  setPaused(false);
                  lastInput.current = Date.now();
                }}
              >
                {tr("Продължи", "Resume")}
              </button>
              <button className="blk-quit" onClick={finish}>
                {tr("Край на играта", "End game")}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="blk-side blk-right">
        <div className="blk-box blk-top">
          <div className="blk-label">🏆 {tr("Класация", "Top 10")}</div>
          <div className="mx-tabs">
            <button className={tab === "time" ? "on" : ""} onClick={() => setTab("time")}>
              ⏱ 2 {tr("мин", "min")}
            </button>
            <button className={tab === "moves" ? "on" : ""} onClick={() => setTab("moves")}>
              👆 30 {tr("хода", "moves")}
            </button>
          </div>
          {!cur || cur.top.length === 0 ? (
            <div className="blk-muted">{tr("Още никой не е играл.", "Nobody has played yet.")}</div>
          ) : (
            <ol>
              {cur.top.map((r, i) => (
                <li key={r.userId} className={r.userId === me?.id ? "me" : ""}>
                  <span className="blk-rank">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</span>
                  {r.avatarUrl ? <img src={r.avatarUrl} alt="" /> : <span className="blk-ava">{r.username[0]?.toUpperCase()}</span>}
                  <span className="blk-name">{r.username}</span>
                  <b>{fmt(r.best)}</b>
                </li>
              ))}
            </ol>
          )}
          {myRank < 0 && cur?.mine && (
            <div className="blk-muted">
              {tr("Твоят рекорд", "Your best")}: {fmt(cur.mine.best)}
            </div>
          )}
        </div>
        <div className="blk-box blk-sound-box">
          <button
            className="blk-sound"
            onClick={() => {
              localStorage.setItem("matchSound", sound ? "off" : "on");
              setSound(!sound);
            }}
          >
            {sound ? "🔊" : "🔇"} {tr("Звуци", "Sounds")}
          </button>
          <div className="blk-music">
            <button
              className="blk-sound"
              onClick={() => {
                localStorage.setItem("matchMusic", musicOn ? "off" : "on");
                setMusicOn(!musicOn);
              }}
            >
              {musicOn ? "🎵" : "🔕"} {tr("Музика", "Music")}
            </button>
            {musicOn && (
              <input
                type="range"
                min={0}
                max={100}
                value={musicVol}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setMusicVol(v);
                  localStorage.setItem("matchMusicVol", String(v));
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
