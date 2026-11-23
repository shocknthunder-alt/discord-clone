import { useCallback, useEffect, useRef, useState } from "react";
import { http } from "../../api/http";
import { tr } from "../../i18n";
import { useAuthStore } from "../../store/authStore";
import { BlocksGame, COLS, HIDDEN, PIECES, ROWS, pieceCells, type GameEvent, type PieceType } from "./engine";
import BaiShmirko, { type ShmirkoMood } from "./BaiShmirko";
import { blocksMusic } from "./music";
import { blockSound } from "./sounds";
import "./blocks.css";

/** 🧱 Шметрис — the screen of a "blocks" channel: solo game + the server's top 10. */

interface TopRow {
  userId: string;
  username: string;
  avatarUrl: string | null;
  best: number;
  lines: number;
  level: number;
  games: number;
}
interface Mine {
  best: number;
  games: number;
  totalLines: number;
}

// Our own palette (not any other game's colours).
export const BLOCK_COLORS: Record<PieceType, string> = {
  I: "#ff5d8f",
  J: "#4dabf7",
  L: "#ffa94d",
  O: "#ffd43b",
  S: "#b197fc",
  T: "#38d9a9",
  Z: "#ff6b6b",
};

function shadeHex(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const t = amt > 0 ? 255 : 0;
    return Math.round(v + (t - v) * Math.abs(amt));
  });
  return `rgb(${ch.join(",")})`;
}

/** One block: rounded gem with a glossy top. */
function drawCell(g: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, alpha = 1) {
  const p = Math.max(1, s * 0.06);
  const r = s * 0.2;
  g.save();
  g.globalAlpha = alpha;
  const grad = g.createLinearGradient(x, y, x + s, y + s);
  grad.addColorStop(0, shadeHex(color, 0.35));
  grad.addColorStop(0.55, color);
  grad.addColorStop(1, shadeHex(color, -0.35));
  g.fillStyle = grad;
  g.beginPath();
  g.roundRect(x + p, y + p, s - 2 * p, s - 2 * p, r);
  g.fill();
  g.strokeStyle = shadeHex(color, -0.55);
  g.lineWidth = Math.max(1, s * 0.05);
  g.stroke();
  // gloss
  g.fillStyle = "rgba(255,255,255,0.28)";
  g.beginPath();
  g.roundRect(x + s * 0.18, y + s * 0.14, s * 0.64, s * 0.22, s * 0.11);
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.55)";
  g.beginPath();
  g.arc(x + s * 0.28, y + s * 0.25, s * 0.06, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function drawGhost(g: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  const p = s * 0.12;
  g.save();
  g.strokeStyle = color;
  g.globalAlpha = 0.55;
  g.lineWidth = Math.max(1, s * 0.07);
  g.setLineDash([s * 0.18, s * 0.1]);
  g.beginPath();
  g.roundRect(x + p, y + p, s - 2 * p, s - 2 * p, s * 0.18);
  g.stroke();
  g.globalAlpha = 0.1;
  g.fillStyle = color;
  g.fill();
  g.restore();
}

/** A small piece picture (hold / next). */
function PiecePreview({ type, dim }: { type: PieceType | null; dim?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const W = 84;
    const H = 52;
    c.width = W * dpr;
    c.height = H * dpr;
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    if (!type) return;
    const cells = pieceCells(type, 0);
    const xs = cells.map(([x]) => x);
    const ys = cells.map(([, y]) => y);
    const w = Math.max(...xs) - Math.min(...xs) + 1;
    const h = Math.max(...ys) - Math.min(...ys) + 1;
    const s = 18;
    const ox = (W - w * s) / 2 - Math.min(...xs) * s;
    const oy = (H - h * s) / 2 - Math.min(...ys) * s;
    for (const [x, y] of cells) drawCell(g, ox + x * s, oy + y * s, s, BLOCK_COLORS[type], dim ? 0.35 : 1);
  }, [type, dim]);
  return <canvas ref={ref} className="blk-preview" style={{ width: 84, height: 52 }} />;
}

interface Hud {
  score: number;
  lines: number;
  level: number;
  hold: PieceType | null;
  holdUsed: boolean;
  next: PieceType[];
  paused: boolean;
  over: boolean;
  /** The stack reaches close to the top. */
  danger: boolean;
}

type Phase = "idle" | "playing" | "over";

const fmt = (n: number) => n.toLocaleString("bg-BG");

const SIZE_KEY = "blocksWellHeight";
const MIN_H = 320;
const MAX_H = 2400;

/**
 * A game in progress survives leaving the channel (e.g. a peek at a friend's stream): it is kept here
 * paused, per channel, and picked up again when the channel is opened. Its events go to whichever view
 * is mounted at the moment (`liveHandler`).
 */
const savedGames = new Map<string, BlocksGame>();
let liveHandler: ((game: BlocksGame, e: GameEvent) => void) | null = null;

export default function BlocksGameView({ channelId }: { channelId: string }) {
  const me = useAuthStore((s) => s.user);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [resumed] = useState(() => {
    const g = savedGames.get(channelId) ?? null;
    return g && !g.over ? g : null;
  });
  const gameRef = useRef<BlocksGame | null>(resumed);
  const [phase, setPhase] = useState<Phase>(resumed ? "playing" : "idle");
  const [hud, setHud] = useState<Hud | null>(null);
  const [top, setTop] = useState<TopRow[]>([]);
  const [mine, setMine] = useState<Mine | null>(null);
  const [startLevel, setStartLevel] = useState(() => Number(localStorage.getItem("blocksStartLevel")) || 1);
  const [sound, setSound] = useState(() => localStorage.getItem("blocksSound") !== "off");
  const [musicOn, setMusicOn] = useState(() => localStorage.getItem("blocksMusic") !== "off");
  const [musicVol, setMusicVol] = useState(() => {
    const v = Number(localStorage.getItem("blocksMusicVol"));
    return Number.isFinite(v) && localStorage.getItem("blocksMusicVol") !== null ? v : 50;
  });
  const [popups, setPopups] = useState<{ id: number; text: string; big?: boolean }[]>([]);
  const [result, setResult] = useState<{ score: number; lines: number; level: number; record: boolean; saved: boolean } | null>(null);
  // Size of the well: null = fit the window; a number = the height the person dragged it to.
  const [customH, setCustomH] = useState<number | null>(() => Number(localStorage.getItem(SIZE_KEY)) || null);
  const [resizing, setResizing] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const viewRef = useRef<HTMLDivElement>(null);
  const wellRef = useRef<HTMLDivElement>(null);
  const musicRef = useRef(musicOn);
  musicRef.current = musicOn;
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const popupId = useRef(0);

  const load = useCallback(() => {
    http
      .get<{ top: TopRow[]; mine: Mine | null }>(`/api/text-channels/${channelId}/blocks`)
      .then((r) => {
        setTop(r.data.top);
        setMine(r.data.mine);
      })
      .catch(() => {});
  }, [channelId]);
  useEffect(load, [load]);

  const popup = (text: string, big = false) => {
    const id = ++popupId.current;
    setPopups((p) => [...p.slice(-3), { id, text, big }]);
    setTimeout(() => setPopups((p) => p.filter((x) => x.id !== id)), 1300);
  };

  const finish = useCallback(
    (game: BlocksGame) => {
      setPhase("over");
      const res = { score: game.score, lines: game.lines, level: game.level, record: false, saved: false };
      setResult(res);
      if (game.score <= 0) return;
      http
        .post<{ record: boolean; mine: Mine; top: TopRow[] }>(`/api/text-channels/${channelId}/blocks/score`, {
          score: game.score,
          lines: game.lines,
          level: game.level,
          durationMs: Math.round(game.elapsedMs),
        })
        .then((r) => {
          setTop(r.data.top);
          setMine(r.data.mine);
          setResult({ ...res, record: r.data.record, saved: true });
        })
        .catch(() => setResult({ ...res, saved: false }));
    },
    [channelId],
  );

  // 👴 Бай Шмирко: cheers for a while after lines go (more lines / combo / T-spin → wilder).
  const [cheer, setCheer] = useState<{ mood: ShmirkoMood; key: number } | null>(null);
  const cheerTimer = useRef<number | undefined>(undefined);
  const cheerFor = (lines: number, combo: number, tspin: boolean) => {
    const lvl = Math.min(4, Math.max(1, lines + (combo >= 2 ? 1 : 0) + (tspin ? 1 : 0)));
    const mood = `c${lvl}` as ShmirkoMood;
    setCheer((c) => ({ mood, key: (c?.key ?? 0) + 1 }));
    window.clearTimeout(cheerTimer.current);
    cheerTimer.current = window.setTimeout(() => setCheer((c) => (c ? { ...c, mood: "idle" } : c)), [0, 1500, 1700, 2000, 3000][lvl]);
  };
  useEffect(() => () => window.clearTimeout(cheerTimer.current), []);
  // Dev / e2e only: show a mood on demand (for screenshots of every pose).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __shmirko?: (m: ShmirkoMood) => void };
    w.__shmirko = (mood) => {
      window.clearTimeout(cheerTimer.current);
      setCheer((c) => ({ mood, key: (c?.key ?? 0) + 1 }));
    };
    return () => void delete w.__shmirko;
  }, []);

  const onEvent = useCallback(
    (e: GameEvent) => {
      if (soundRef.current) blockSound(e);
      if (e.kind === "clear" && (e.lines > 0 || e.tspin)) cheerFor(e.lines, e.combo, e.tspin);
      if (e.kind === "clear") {
        const name =
          e.lines === 4
            ? tr("ЧЕТИРИ РЕДА!", "FOUR LINES!")
            : e.tspin
              ? `${tr("Т-завъртане", "T-spin")}${e.lines ? ` ×${e.lines}` : ""}`
              : e.lines === 3
                ? tr("Три реда", "Three lines")
                : e.lines === 2
                  ? tr("Два реда", "Two lines")
                  : "";
        if (name) popup(`${name}${e.b2b ? tr(" · подред", " · back-to-back") : ""}`, e.lines === 4 || e.tspin);
        if (e.combo > 0) popup(`${tr("Комбо", "Combo")} ×${e.combo}`);
        if (e.points > 0) popup(`+${fmt(e.points)}`);
      } else if (e.kind === "level") {
        popup(`${tr("Ниво", "Level")} ${e.level}!`, true);
        // a new style every two levels
        if (musicRef.current && blocksMusic.songName(e.level) !== blocksMusic.songName(e.level - 1)) popup(`🎵 ${blocksMusic.songName(e.level)}`);
      }
    },
    [],
  );

  const start = useCallback(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    const game: BlocksGame = new BlocksGame((e) => liveHandler?.(game, e), startLevel);
    blocksMusic.stop(); // a new game starts its level's song from the top
    savedGames.delete(channelId);
    gameRef.current = game;
    setResult(null);
    setPopups([]);
    setPhase("playing");
  }, [startLevel, channelId]);

  // Keyboard.
  useEffect(() => {
    if (phase !== "playing") return;
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const down = (e: KeyboardEvent) => {
      const g = gameRef.current;
      if (!g || typing(e.target) || e.ctrlKey && e.code !== "ControlLeft" && e.code !== "ControlRight" || e.altKey || e.metaKey) return;
      let used = true;
      switch (e.code) {
        case "ArrowLeft":
          if (!e.repeat) g.setShift(-1);
          break;
        case "ArrowRight":
          if (!e.repeat) g.setShift(1);
          break;
        case "ArrowDown":
          g.setSoftDrop(true);
          break;
        case "ArrowUp":
        case "KeyX":
          if (!e.repeat) g.rotate(1);
          break;
        case "KeyZ":
        case "ControlLeft":
        case "ControlRight":
          if (!e.repeat) g.rotate(-1);
          break;
        case "KeyA":
          if (!e.repeat) g.rotate(2);
          break;
        case "Space":
          if (!e.repeat) g.hardDrop();
          break;
        case "KeyC":
        case "ShiftLeft":
        case "ShiftRight":
          if (!e.repeat) g.holdPiece();
          break;
        case "Escape":
        case "KeyP":
          if (!e.repeat && !g.over) g.paused = !g.paused;
          break;
        default:
          used = false;
      }
      if (used) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const up = (e: KeyboardEvent) => {
      const g = gameRef.current;
      if (!g) return;
      if (e.code === "ArrowLeft" && g.shiftDir === -1) g.setShift(0);
      if (e.code === "ArrowRight" && g.shiftDir === 1) g.setShift(0);
      if (e.code === "ArrowDown") g.setSoftDrop(false);
    };
    const pause = () => {
      const g = gameRef.current;
      if (g && !g.over) {
        g.paused = true;
        g.setShift(0);
        g.setSoftDrop(false);
      }
    };
    const vis = () => document.hidden && pause();
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", pause);
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", pause);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [phase]);

  // Game loop + drawing.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastHud = "";
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(50, now - last);
      last = now;
      const game = gameRef.current;
      if (game) game.tick(dt);
      draw(canvasRef.current, game);
      if (game) {
        const h: Hud = {
          score: game.score,
          lines: game.lines,
          level: game.level,
          hold: game.hold,
          holdUsed: game.holdUsed,
          next: game.queue.slice(0, 3),
          paused: game.paused,
          over: game.over,
          danger: stackDanger(game),
        };
        const k = JSON.stringify(h);
        if (k !== lastHud) {
          lastHud = k;
          setHud(h);
        }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // This view receives the events of the running game (also one resumed from an earlier visit).
  useEffect(() => {
    const handler = (game: BlocksGame, e: GameEvent) => {
      if (game !== gameRef.current) return;
      onEvent(e);
      if (e.kind === "over") setTimeout(() => finish(game), 0);
    };
    liveHandler = handler;
    return () => {
      if (liveHandler === handler) liveHandler = null;
    };
  }, [onEvent, finish]);

  // Leaving the channel pauses an unfinished game and keeps it for when you come back.
  useEffect(
    () => () => {
      const g = gameRef.current;
      if (g && !g.over) {
        g.paused = true;
        g.setShift(0);
        g.setSoftDrop(false);
        savedGames.set(channelId, g);
      } else savedGames.delete(channelId);
      blocksMusic.stop();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // 🎵 Music: plays while a game runs (not paused), follows the level (new song + faster).
  const hudLevel = hud?.level ?? startLevel;
  const hudPaused = !!hud?.paused;
  useEffect(() => {
    if (phase === "playing" && musicOn && !hudPaused) blocksMusic.play(hudLevel);
    else if (phase === "over") blocksMusic.stop();
    else blocksMusic.pause();
  }, [phase, musicOn, hudPaused, hudLevel]);
  useEffect(() => blocksMusic.setVolume(musicVol / 100), [musicVol]);
  const hudDanger = phase === "playing" && !!hud?.danger;
  useEffect(() => blocksMusic.setDanger(hudDanger), [hudDanger]);
  const shmirkoMood: ShmirkoMood =
    cheer && cheer.mood !== "idle" ? cheer.mood : phase === "over" ? "sad" : hudDanger ? "danger" : "idle";

  const g = () => gameRef.current;
  const tap = (fn: (game: BlocksGame) => void) => (e: React.PointerEvent) => {
    e.preventDefault();
    const game = g();
    if (game) fn(game);
  };

  const myRank = me ? top.findIndex((r) => r.userId === me.id) : -1;

  // Drag the corner handle to resize the well (like the stream); double-click = fit the window.
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const well = wellRef.current;
    if (!well) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startH = well.getBoundingClientRect().height;
    setResizing(true);
    const move = (ev: PointerEvent) => {
      // The well is centred (width grows on both sides) and twice as tall as wide → 4× the sideways travel.
      // Whichever direction moved more wins, so it can shrink as well as grow.
      const dy = ev.clientY - startY;
      const dx = (ev.clientX - startX) * 4;
      const grow = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
      setCustomH(Math.round(Math.min(MAX_H, Math.max(MIN_H, startH + grow))));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setResizing(false);
      setCustomH((cur) => {
        if (cur) localStorage.setItem(SIZE_KEY, String(cur));
        return cur;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const resetSize = () => {
    localStorage.removeItem(SIZE_KEY);
    setCustomH(null);
  };

  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === viewRef.current && !!viewRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  const toggleFullscreen = () => {
    (document.activeElement as HTMLElement | null)?.blur?.(); // so Space drops a piece, not "clicks" this button again
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void viewRef.current?.requestFullscreen().catch(() => {});
  };

  return (
    <div ref={viewRef} className={`blk-view ${fullscreen ? "blk-fullscreen" : ""} ${resizing ? "resizing" : ""}`}>
      <div className="blk-side blk-left">
        <div className="blk-box">
          <div className="blk-label">{tr("Запазен", "Hold")} <kbd>C</kbd></div>
          <PiecePreview type={hud?.hold ?? null} dim={hud?.holdUsed} />
        </div>
        <div className="blk-box blk-stats">
          <div className="blk-label">{tr("Точки", "Score")}</div>
          <div className="blk-score">{fmt(hud?.score ?? 0)}</div>
          <div className="blk-stat-row">
            <span>{tr("Ниво", "Level")}</span>
            <b>{hud?.level ?? startLevel}</b>
          </div>
          <div className="blk-stat-row">
            <span>{tr("Редове", "Lines")}</span>
            <b>{hud?.lines ?? 0}</b>
          </div>
          {mine && (
            <div className="blk-stat-row blk-best">
              <span>{tr("Моят рекорд", "My best")}</span>
              <b>{fmt(mine.best)}</b>
            </div>
          )}
        </div>
        <div className="blk-shmirko">
          <BaiShmirko mood={shmirkoMood} cheerKey={cheer?.key ?? 0} beat={60 / blocksMusic.bpmFor(hudLevel)} />
        </div>
        <div className="blk-box blk-keys">
          <div><kbd>←</kbd><kbd>→</kbd> {tr("местене", "move")}</div>
          <div><kbd>↑</kbd>/<kbd>X</kbd> {tr("завърти", "rotate")} · <kbd>Z</kbd> {tr("обратно", "back")}</div>
          <div><kbd>↓</kbd> {tr("по-бързо", "soft drop")} · <kbd>{tr("Интервал", "Space")}</kbd> {tr("пусни", "drop")}</div>
          <div><kbd>C</kbd>/<kbd>Shift</kbd> {tr("запази", "hold")} · <kbd>P</kbd> {tr("пауза", "pause")}</div>
        </div>
      </div>

      <div className="blk-center">
        <div ref={wellRef} className="blk-well-wrap" style={customH && !fullscreen ? { height: customH } : undefined}>
          <canvas ref={canvasRef} className="blk-well" />
          <div className="blk-popups">
            {popups.map((p) => (
              <div key={p.id} className={`blk-popup ${p.big ? "big" : ""}`}>
                {p.text}
              </div>
            ))}
          </div>
          {phase !== "playing" && (
            <div className="blk-overlay">
              <div className="blk-title">
                <span>Ш</span>
                <span>М</span>
                <span>Е</span>
                <span>Т</span>
                <span>Р</span>
                <span>И</span>
                <span>С</span>
              </div>
              {result && (
                <div className="blk-result">
                  <div className="blk-result-score">{fmt(result.score)}</div>
                  <div>
                    {result.lines} {tr("реда", "lines")} · {tr("ниво", "level")} {result.level}
                  </div>
                  {result.record && <div className="blk-record">🏆 {tr("Нов личен рекорд!", "New personal best!")}</div>}
                  {result.score > 0 && !result.saved && <div className="blk-muted">{tr("записва се…", "saving…")}</div>}
                </div>
              )}
              <label className="blk-level-pick">
                {tr("Начално ниво", "Start level")}
                <select
                  value={startLevel}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setStartLevel(v);
                    localStorage.setItem("blocksStartLevel", String(v));
                  }}
                >
                  {Array.from({ length: 15 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <button className="blk-start" onClick={start}>
                {result ? tr("▶ Нова игра", "▶ New game") : tr("▶ Играй", "▶ Play")}
              </button>
            </div>
          )}
          {phase === "playing" && hud?.paused && (
            <div className="blk-overlay">
              <div className="blk-paused">{tr("Пауза", "Paused")}</div>
              <button
                className="blk-start"
                onClick={() => {
                  const game = g();
                  if (game) game.paused = false;
                  (document.activeElement as HTMLElement | null)?.blur?.();
                }}
              >
                {tr("▶ Продължи", "▶ Resume")}
              </button>
              <button
                className="blk-quit"
                onClick={() => {
                  const game = g();
                  if (!game) return;
                  game.over = true;
                  finish(game);
                }}
              >
                {tr("Край на играта", "End game")}
              </button>
            </div>
          )}
          {!fullscreen && (
            <div
              className="blk-resize-handle"
              onPointerDown={startResize}
              onDoubleClick={resetSize}
              title={tr("Влачи, за да смениш размера · двоен клик = по екрана", "Drag to resize · double-click = fit the window")}
            />
          )}
        </div>

        <div className="blk-touch">
          <button onPointerDown={tap((x) => x.holdPiece())}>{tr("Запази", "Hold")}</button>
          <button onPointerDown={tap((x) => x.rotate(-1))}>↺</button>
          <button onPointerDown={tap((x) => x.rotate(1))}>↻</button>
          <button
            onPointerDown={tap((x) => x.setShift(-1))}
            onPointerUp={tap((x) => x.setShift(0))}
            onPointerLeave={tap((x) => x.setShift(0))}
            onPointerCancel={tap((x) => x.setShift(0))}
          >
            ←
          </button>
          <button
            onPointerDown={tap((x) => x.setSoftDrop(true))}
            onPointerUp={tap((x) => x.setSoftDrop(false))}
            onPointerLeave={tap((x) => x.setSoftDrop(false))}
            onPointerCancel={tap((x) => x.setSoftDrop(false))}
          >
            ↓
          </button>
          <button
            onPointerDown={tap((x) => x.setShift(1))}
            onPointerUp={tap((x) => x.setShift(0))}
            onPointerLeave={tap((x) => x.setShift(0))}
            onPointerCancel={tap((x) => x.setShift(0))}
          >
            →
          </button>
          <button onPointerDown={tap((x) => x.hardDrop())}>⤓</button>
          <button onPointerDown={tap((x) => !x.over && (x.paused = !x.paused))}>⏸</button>
        </div>
      </div>

      <div className="blk-side blk-right">
        <div className="blk-box">
          <div className="blk-label">{tr("Следващи", "Next")}</div>
          {(hud?.next ?? []).map((t, i) => (
            <PiecePreview key={i} type={t} />
          ))}
          {!hud && <div className="blk-muted blk-next-empty">—</div>}
        </div>
        <div className="blk-box blk-top">
          <div className="blk-label">🏆 {tr("Класация на сървъра", "Server top list")}</div>
          {top.length === 0 && <div className="blk-muted">{tr("Още никой не е играл. Бъди първи!", "Nobody has played yet. Be the first!")}</div>}
          <ol>
            {top.map((r, i) => (
              <li key={r.userId} className={me?.id === r.userId ? "me" : ""} title={`${r.lines} ${tr("реда", "lines")} · ${tr("ниво", "level")} ${r.level} · ${r.games} ${tr("игри", "games")}`}>
                <span className="blk-rank">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</span>
                {r.avatarUrl ? <img src={r.avatarUrl} alt="" /> : <span className="blk-ava">{r.username.slice(0, 1).toUpperCase()}</span>}
                <span className="blk-name">{r.username}</span>
                <b>{fmt(r.best)}</b>
              </li>
            ))}
          </ol>
          {mine && myRank < 0 && mine.best > 0 && (
            <div className="blk-muted">
              {tr("Твоят рекорд", "Your best")}: {fmt(mine.best)}
            </div>
          )}
        </div>
        <button
          className="blk-sound"
          onClick={() => {
            const v = !sound;
            setSound(v);
            localStorage.setItem("blocksSound", v ? "on" : "off");
          }}
          title={tr("Звуци на играта", "Game sounds")}
        >
          {sound ? "🔊" : "🔇"} {tr("Звук", "Sound")}
        </button>
        <div className="blk-music">
          <button
            className="blk-sound"
            onClick={() => {
              const v = !musicOn;
              setMusicOn(v);
              localStorage.setItem("blocksMusic", v ? "on" : "off");
              (document.activeElement as HTMLElement | null)?.blur?.();
            }}
            title={tr("Музика по време на игра — всяко ниво е друга песен", "Music while playing — every level has its own song")}
          >
            {musicOn ? "🎵" : "🔇"} {tr("Музика", "Music")}
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
                localStorage.setItem("blocksMusicVol", String(v));
              }}
              onPointerUp={(e) => e.currentTarget.blur()}
              title={tr("Сила на музиката", "Music volume")}
            />
          )}
        </div>
        <div className="blk-size-buttons">
          <button className="blk-sound blk-fs" onClick={toggleFullscreen} title={tr("Цял екран", "Full screen")}>
            {fullscreen ? tr("🗗 Изход от цял екран", "🗗 Exit full screen") : tr("⛶ Цял екран", "⛶ Full screen")}
          </button>
          {customH && !fullscreen && (
            <button className="blk-sound" onClick={resetSize} title={tr("Размер по екрана", "Fit the window")}>
              ↺ {tr("Размер", "Size")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** The stack's top is within 5 rows of the top of the visible well. */
function stackDanger(game: BlocksGame): boolean {
  if (game.over) return false;
  for (let y = HIDDEN; y < HIDDEN + 5; y++) if (game.board[y]!.some((v) => v)) return true;
  return false;
}

/* ───────── drawing the well ───────── */

const VISIBLE = ROWS - HIDDEN;

function draw(canvas: HTMLCanvasElement | null, game: BlocksGame | null) {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width) return;
  const dpr = window.devicePixelRatio || 1;
  const W = Math.round(rect.width * dpr);
  const H = Math.round(rect.height * dpr);
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  const g = canvas.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const s = rect.width / COLS;
  g.clearRect(0, 0, rect.width, rect.height);

  // grid
  g.strokeStyle = "rgba(255,255,255,0.045)";
  g.lineWidth = 1;
  g.beginPath();
  for (let x = 1; x < COLS; x++) {
    g.moveTo(x * s + 0.5, 0);
    g.lineTo(x * s + 0.5, rect.height);
  }
  for (let y = 1; y < VISIBLE; y++) {
    g.moveTo(0, y * s + 0.5);
    g.lineTo(rect.width, y * s + 0.5);
  }
  g.stroke();

  if (!game) return;
  for (let y = HIDDEN; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const v = game.board[y]![x]!;
      if (v) drawCell(g, x * s, (y - HIDDEN) * s, s, BLOCK_COLORS[PIECES[v - 1]!], game.over ? 0.45 : 1);
    }
  }
  const a = game.active;
  if (a && !game.over) {
    const gy = game.ghostY();
    const col = BLOCK_COLORS[a.type];
    for (const [cx, cy] of pieceCells(a.type, a.rot)) {
      const y = gy + cy - HIDDEN;
      if (y >= 0) drawGhost(g, (a.x + cx) * s, y * s, s, col);
    }
    for (const [cx, cy] of pieceCells(a.type, a.rot)) {
      const y = a.y + cy - HIDDEN;
      if (y >= 0) drawCell(g, (a.x + cx) * s, y * s, s, col);
    }
  }
  if (game.flash) {
    // The rows that just went: a white sweep (they are gone from the board already).
    const k = Math.max(0, game.flash.ms / 220);
    g.fillStyle = `rgba(255,255,255,${0.5 * k})`;
    const n = game.flash.rows.length;
    for (let i = 0; i < n; i++) g.fillRect(0, (game.flash.rows[i]! - HIDDEN) * s, rect.width, s);
  }
  if (game.paused) {
    g.fillStyle = "rgba(10,10,14,0.55)";
    g.fillRect(0, 0, rect.width, rect.height);
  }
}
