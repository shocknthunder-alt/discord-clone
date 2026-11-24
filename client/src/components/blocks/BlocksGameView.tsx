import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  SocketEvents,
  type DuelAttackDTO,
  type DuelLobbyDTO,
  type DuelOpponentDTO,
  type DuelOverDTO,
  type DuelPlayerDTO,
  type DuelStartDTO,
} from "@discord-clone/shared";
import { http } from "../../api/http";
import { getSocket } from "../../socket/socket";
import { DuelLobby } from "../match/DuelPanel";
import "../match/match.css";
import { tr } from "../../i18n";
import { useAuthStore } from "../../store/authStore";
import {
  BlocksGame,
  COLS,
  GOLD,
  HIDDEN,
  PIECES,
  RAGE_MAX,
  ROWS,
  STONE,
  bonusCell,
  pieceCells,
  type BonusKind,
  type GameEvent,
  type Mission,
  type MissionId,
  type PieceBonus,
  type PieceType,
} from "./engine";
import Dragon, { DRAGON_COLORS, DRAGON_STAGES, dragonColor, dragonStage, type DragonMood } from "./Dragon";
import { blocksMusic } from "./music";
import { blockSound } from "./sounds";
import "./blocks.css";

/** 🧱 Шметрис — the screen of a "blocks" channel: solo game, ⚔️ duel (last one standing; cleared
 *  rows send garbage rows to the other) + the server's top 10. */

interface DuelTop {
  top: { userId: string; username: string; avatarUrl: string | null; wins: number; games: number }[];
  mine: { wins: number; games: number } | null;
}
interface Duel {
  id: string;
  opponent: DuelPlayerDTO;
  /** local clock */
  startsAt: number;
  endsAt: number;
}

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

/**
 * Cells are drawn once per colour / size / alpha into a small canvas and then just stamped with
 * drawImage (gradients + rounded paths for 200 cells every frame were the slow part).
 */
const cellSprites = new Map<string, HTMLCanvasElement>();
let spriteSize = 0;
function stampCell(g: CanvasRenderingContext2D, x: number, y: number, s: number, dpr: number, color: string, alpha = 1) {
  const px = Math.max(1, Math.round(s * dpr));
  if (px !== spriteSize) {
    cellSprites.clear();
    spriteSize = px;
  }
  const key = `${color}|${alpha}`;
  let c = cellSprites.get(key);
  if (!c) {
    c = document.createElement("canvas");
    c.width = c.height = px;
    drawCell(c.getContext("2d")!, 0, 0, px, color, alpha);
    cellSprites.set(key, c);
  }
  g.drawImage(c, x, y, s, s);
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

/** Board value → colour (1..7 pieces, gold, stone). */
function cellColor(v: number): string {
  if (v === GOLD) return "#ffc93a";
  if (v === STONE) return "#5d6170";
  return BLOCK_COLORS[PIECES[v - 1]!];
}

export const BONUS_ICON: Record<BonusKind, string> = { bomb: "💣", bolt: "⚡", rainbow: "🌈", slow: "⏳" };
const BONUS_GLOW: Record<BonusKind, string> = { bomb: "#ff7a1a", bolt: "#8fd3ff", rainbow: "#ff5df0", slow: "#7cc4ff" };

/** The icon of a bonus cell, on top of the cell (with a pulsing glow). */
function drawBonus(g: CanvasRenderingContext2D, x: number, y: number, s: number, kind: BonusKind, now: number) {
  const k = 0.55 + 0.45 * Math.sin(now / 160);
  g.save();
  g.globalAlpha = 0.35 + 0.4 * k;
  g.fillStyle = BONUS_GLOW[kind];
  g.beginPath();
  g.arc(x + s / 2, y + s / 2, s * (0.36 + 0.06 * k), 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
  g.font = `${Math.round(s * 0.62)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(BONUS_ICON[kind], x + s / 2, y + s * 0.54);
  g.restore();
}

/** A small piece picture (hold / next). */
function PiecePreview({ type, dim, bonus }: { type: PieceType | null; dim?: boolean; bonus?: PieceBonus | null }) {
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
    if (bonus) {
      const [bx, by] = bonusCell(type, 0, bonus.i);
      drawBonus(g, ox + bx * s, oy + by * s, s, bonus.kind, 0);
    }
  }, [type, dim, bonus?.i, bonus?.kind]);
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
  holdBonus: PieceBonus | null;
  nextBonus: (PieceBonus | null)[];
  fever: number;
  rage: number;
  /** Seconds left of the dragon's fire (×2) / of the slow bonus. */
  rageSec: number;
  slowSec: number;
  mission: Mission | null;
  missionsDone: number;
  dragonBonus: number;
  /** ⚔️ garbage rows waiting to rise */
  pending: number;
}

/** ⚔️ The visible well (10×20) with the falling piece, for the opponent's mini picture. */
function wellCodes(game: BlocksGame): number[] {
  const rows = game.board.slice(HIDDEN).map((r) => [...r]);
  const a = game.active;
  if (a && !game.over)
    for (const [cx, cy] of pieceCells(a.type, a.rot)) {
      const y = a.y + cy - HIDDEN;
      if (y >= 0 && y < rows.length) rows[y]![a.x + cx] = PIECES.indexOf(a.type) + 1;
    }
  return rows.flat();
}

const MiniWell = memo(function MiniWell({ codes }: { codes: number[] | null }) {
  return (
    <div className="blk-mini">
      {(codes ?? Array(200).fill(0)).map((v, i) => (
        <i key={i} style={v ? { background: cellColor(v) } : undefined} />
      ))}
    </div>
  );
});

export const MISSION_TEXT: Record<MissionId, [string, string]> = {
  tspin: ["Направи Т-завъртане, което чисти ред", "Do a T-spin that clears a line"],
  triple: ["Изчисти 3 реда наведнъж", "Clear 3 lines at once"],
  tetra: ["Изчисти 4 реда наведнъж", "Clear 4 lines at once"],
  combo3: ["Направи комбо ×3", "Make a ×3 combo"],
  lines8: ["Изчисти 8 реда", "Clear 8 lines"],
  bonus: ["Задействай бонус блокче", "Fire a bonus cell"],
  spin: ["Завъртане (всяка фигура), което чисти ред", "A spin (any piece) that clears a line"],
  b2b: ["Два трудни подред (4 реда / завъртане)", "Two hard clears in a row"],
  fever2: ["Стигни огнен множител ×2", "Reach the ×2 fever"],
  chain3: ["Чисти редове с 3 фигури подред", "Clear with 3 pieces in a row"],
  gold: ["Изчисти златния ред", "Clear the golden row"],
};
const missionText = (id: MissionId) => tr(...MISSION_TEXT[id]);

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
const savedDuels = new Map<string, Duel>();
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
  const [loaded, setLoaded] = useState(false);
  const [startLevel, setStartLevel] = useState(() => Number(localStorage.getItem("blocksStartLevel")) || 1);
  const [sound, setSound] = useState(() => localStorage.getItem("blocksSound") !== "off");
  const [musicOn, setMusicOn] = useState(() => localStorage.getItem("blocksMusic") !== "off");
  const [musicVol, setMusicVol] = useState(() => {
    const v = Number(localStorage.getItem("blocksMusicVol"));
    return Number.isFinite(v) && localStorage.getItem("blocksMusicVol") !== null ? v : 50;
  });
  const [softSpeed, setSoftSpeed] = useState(() => Number(localStorage.getItem("blocksSoftSpeed")) || 2);
  const softRef = useRef(softSpeed);
  softRef.current = softSpeed;
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
  // ⚔️ duel
  const [mode, setMode] = useState<"solo" | "duel">(() => (resumed?.versus ? "duel" : localStorage.getItem("blocksMode") === "duel" ? "duel" : "solo"));
  const [lobby, setLobby] = useState<DuelLobbyDTO | null>(null);
  const [duel, setDuel] = useState<Duel | null>(() => (resumed?.versus ? savedDuels.get(channelId) ?? null : null));
  const duelRef = useRef(duel);
  duelRef.current = duel;
  const [opp, setOpp] = useState<{ score: number; board: number[] | null; lines: number }>({ score: 0, board: null, lines: 0 });
  const oppRef = useRef(opp);
  oppRef.current = opp;
  const [countdown, setCountdown] = useState(0);
  const [duelDone, setDuelDone] = useState(false);
  const [duelResult, setDuelResult] = useState<DuelOverDTO | null>(null);
  const duelResultRef = useRef(duelResult);
  duelResultRef.current = duelResult;
  const [duelTop, setDuelTop] = useState<DuelTop | null>(null);
  const [topTab, setTopTab] = useState<"score" | "duel">(mode === "duel" ? "duel" : "score");
  const [shakeWell, setShakeWell] = useState(false);
  const lastOpp = useRef<DuelPlayerDTO | null>(duel?.opponent ?? null);

  const load = useCallback(() => {
    http
      .get<{ top: TopRow[]; mine: Mine | null; duel?: DuelTop }>(`/api/text-channels/${channelId}/blocks`)
      .then((r) => {
        setTop(r.data.top);
        setMine(r.data.mine);
        if (r.data.duel) setDuelTop(r.data.duel);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [channelId]);
  useEffect(load, [load]);

  const popup = (text: string, big = false) => {
    const id = ++popupId.current;
    setPopups((p) => [...p.slice(-5), { id, text, big }]);
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

  // 🐉 The dragon: cheers for a while after lines go (more lines / combo / T-spin → wilder).
  const [cheer, setCheer] = useState<{ mood: DragonMood; key: number } | null>(null);
  const [forceStage, setForceStage] = useState<number | null>(null); // dev screenshots only
  const [forceColor, setForceColor] = useState<number | null>(null); // dev screenshots only
  const [dragonName, setDragonName] = useState(() => localStorage.getItem("blocksDragonName") || "Змейчо");
  const [naming, setNaming] = useState(false);
  const cheerTimer = useRef<number | undefined>(undefined);
  const cheerFor = (lines: number, combo: number, tspin: boolean) => {
    const lvl = Math.min(4, Math.max(1, lines + (combo >= 2 ? 1 : 0) + (tspin ? 1 : 0)));
    const mood = `c${lvl}` as DragonMood;
    setCheer((c) => ({ mood, key: (c?.key ?? 0) + 1 }));
    window.clearTimeout(cheerTimer.current);
    cheerTimer.current = window.setTimeout(() => setCheer((c) => (c ? { ...c, mood: "idle" } : c)), [0, 1500, 1700, 2000, 3000][lvl]);
  };
  useEffect(() => () => window.clearTimeout(cheerTimer.current), []);
  // Dev / e2e only: show a mood on demand (for screenshots of every pose).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __dragon?: (m: DragonMood, stage?: number, color?: number) => void };
    w.__dragon = (mood, stage, color) => {
      window.clearTimeout(cheerTimer.current);
      if (stage !== undefined) setForceStage(stage);
      if (color !== undefined) setForceColor(color);
      setCheer((c) => ({ mood, key: (c?.key ?? 0) + 1 }));
    };
    const wg = window as unknown as { __blocksGame?: () => BlocksGame | null };
    wg.__blocksGame = () => gameRef.current; // e2e: set up bonus cells / rage / golden rows
    return () => {
      delete w.__dragon;
      delete wg.__blocksGame;
    };
  }, []);

  const onEvent = useCallback(
    (e: GameEvent) => {
      if (soundRef.current) blockSound(e);
      if (e.kind === "clear" && (e.lines > 0 || e.spin))
        cheerFor(e.perfect ? 4 : e.lines + (e.bonuses.length || e.cascades ? 1 : 0), e.combo, !!e.spin && !e.mini);
      if (e.kind === "clear") {
        const n = e.rows.length;
        const spinName = e.spin
          ? `${e.spin === "T" ? "Т" : e.spin}-${tr("завъртане", "spin")}${e.mini ? tr(" мини", " mini") : ""}${n ? ` ×${n}` : ""}`
          : "";
        const name =
          spinName ||
          (n === 4 ? tr("ЧЕТИРИ РЕДА!", "FOUR LINES!") : n === 3 ? tr("Три реда", "Three lines") : n === 2 ? tr("Два реда", "Two lines") : "");
        if (e.perfect) popup(tr("✨ ЧИСТ КЛАДЕНЕЦ!", "✨ PERFECT CLEAR!"), true);
        if (name) popup(`${name}${e.b2b ? ` · ${tr("подред", "back-to-back")} ×${e.b2bChain}` : ""}`, n === 4 || (!!e.spin && !e.mini));
        for (const k of new Set(e.bonuses))
          popup(
            k === "bomb"
              ? tr("💣 Бомба!", "💣 Bomb!")
              : k === "bolt"
                ? tr("⚡ Мълния!", "⚡ Lightning!")
                : k === "rainbow"
                  ? tr("🌈 Дъга!", "🌈 Rainbow!")
                  : tr("⏳ Забавяне 10 с", "⏳ Slow-down 10 s"),
            k !== "slow",
          );
        if (e.cascades > 0) popup(`${tr("Каскада", "Cascade")} ×${e.cascades + 1}!`, true);
        if (e.gold) popup(tr("🪙 Златен ред!", "🪙 Golden row!"), true);
        if (e.combo > 0) popup(`${tr("Комбо", "Combo")} ×${e.combo}`);
        if (e.points > 0) popup(`+${fmt(e.points)}${e.fever > 1 ? ` (×${e.fever})` : ""}`);
      } else if (e.kind === "fever") {
        popup(e.mult > 1 ? `🔥 ${tr("Огнен множител", "Fever")} ×${e.mult}` : tr("огънят угасна", "the fever is out"), e.mult > 1);
      } else if (e.kind === "rageReady") {
        popup(tr("🐉 Гневът е пълен — натисни V!", "🐉 Rage is full — press V!"), true);
      } else if (e.kind === "rage") {
        popup(tr("🔥 ДРАКОНОВ ОГЪН! ×2 за 10 с", "🔥 DRAGON FIRE! ×2 for 10 s"), true);
        if (e.points) popup(`+${fmt(e.points)}`);
        cheerFor(4, 0, false);
      } else if (e.kind === "mission") {
        popup(`🎯 ${tr("Мисията е изпълнена!", "Mission done!")} +${fmt(e.points)}`, true);
        cheerFor(2, 0, false);
      } else if (e.kind === "missionNew") {
        popup(`🎯 ${missionText(e.id)}`);
      } else if (e.kind === "goldRow") {
        popup(tr("🪙 Златен ред отдолу!", "🪙 A golden row!"));
      } else if (e.kind === "stone") {
        popup(tr("Златото стана на камък", "The gold turned to stone"));
      } else if (e.kind === "attack") {
        const d = duelRef.current;
        if (d) getSocket()?.emit(SocketEvents.MatchDuelAttack, { duelId: d.id, kind: "garbage", power: e.lines });
        popup(`⚔️ +${e.lines} ${tr(e.lines === 1 ? "ред" : "реда", "rows")} → ${d?.opponent.username ?? ""}`, e.lines >= 3);
      } else if (e.kind === "cancel") {
        popup(`🛡 ${tr("Спря", "Blocked")} ${e.lines} ${tr(e.lines === 1 ? "ред" : "реда", "rows")}`);
      } else if (e.kind === "garbage") {
        popup(`🧱 +${e.lines} ${tr(e.lines === 1 ? "ред боклук!" : "реда боклук!", "garbage rows!")}`, true);
        setShakeWell(true);
        window.setTimeout(() => setShakeWell(false), 450);
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
    getSocket()?.emit(SocketEvents.MatchDuelCancel, { channelId });
    setDuel(null);
    setDuelDone(false);
    setDuelResult(null);
    localStorage.setItem("blocksMode", "solo");
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
        case "KeyV":
          if (!e.repeat) g.unleash();
          break;
        case "Escape":
        case "KeyP":
          if (!e.repeat && !g.over && !g.versus) g.paused = !g.paused;
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
      if (g && !g.over && !g.versus) {
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
    // the canvas size is read only when it changes (not every frame: that forces a layout)
    const size = { w: 0, h: 0 };
    const ro = new ResizeObserver(() => {
      const r = canvasRef.current?.getBoundingClientRect();
      if (r) {
        size.w = r.width;
        size.h = r.height;
      }
    });
    if (canvasRef.current) ro.observe(canvasRef.current);
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(50, now - last);
      last = now;
      const game = gameRef.current;
      if (game) {
        game.softSpeed = softRef.current;
        game.tick(dt);
      }
      draw(canvasRef.current, game, size.w, size.h, now);
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
          holdBonus: game.holdBonus,
          nextBonus: game.queueBonus.slice(0, 3),
          fever: game.fever,
          rage: Math.floor(game.rage),
          rageSec: Math.ceil(game.rageMs / 1000),
          slowSec: Math.ceil(game.slowMs / 1000),
          mission: game.mission && { ...game.mission },
          missionsDone: game.missionsDone,
          dragonBonus: game.dragonBonus,
          pending: game.pendingLines,
        };
        const k = JSON.stringify(h);
        if (k !== lastHud) {
          lastHud = k;
          setHud(h);
        }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  // This view receives the events of the running game (also one resumed from an earlier visit).
  useEffect(() => {
    const handler = (game: BlocksGame, e: GameEvent) => {
      if (game !== gameRef.current) return;
      onEvent(e);
      if (e.kind === "over" && game.versus) {
        const d = duelRef.current;
        if (d) getSocket()?.emit(SocketEvents.MatchDuelUpdate, { duelId: d.id, score: game.score, board: wellCodes(game), out: true });
        setDuelDone(true);
      } else if (e.kind === "over") setTimeout(() => finish(game), 0);
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
        if (!g.versus) g.paused = true;
        g.setShift(0);
        g.setSoftDrop(false);
        savedGames.set(channelId, g);
        if (g.versus && duelRef.current) savedDuels.set(channelId, duelRef.current);
      } else savedGames.delete(channelId);
      blocksMusic.stop();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ⚔️ Duel over the socket: lobby, start, the opponent's well, garbage, the result.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const watch = () => socket.emit(SocketEvents.MatchWatch, { channelId });
    const onLobby = (l: DuelLobbyDTO) => {
      if (l.channelId !== channelId) return;
      setLobby(l);
      const d = duelRef.current;
      if (d && !duelResultRef.current && Date.now() > d.startsAt && !l.playing.some((p) => p.a.userId === me?.id || p.b.userId === me?.id)) {
        // the duel ended while this window was away
        const g = gameRef.current;
        if (g) g.over = true;
        setDuelDone(true);
        setPhase("over");
        setDuelResult({ duelId: d.id, channelId, you: g?.score ?? 0, them: oppRef.current.score, winnerId: null, reason: "left", wins: 0, games: 0 });
        savedGames.delete(channelId);
        savedDuels.delete(channelId);
        load();
      }
    };
    const onStart = (st: DuelStartDTO) => {
      if (st.channelId !== channelId) return;
      const off = Date.now() - st.serverNow;
      const d: Duel = { id: st.duelId, opponent: st.opponent, startsAt: st.startsAt + off, endsAt: st.endsAt + off };
      lastOpp.current = st.opponent;
      if (duelRef.current?.id === st.duelId && gameRef.current?.versus) {
        setDuel(d);
        if (st.opponentScore !== undefined) setOpp((o) => ({ ...o, score: st.opponentScore!, board: st.opponentBoard ?? o.board }));
        return;
      }
      (document.activeElement as HTMLElement | null)?.blur?.();
      const game: BlocksGame = new BlocksGame((e) => liveHandler?.(game, e), 1);
      game.versus = true;
      game.paused = Date.now() < d.startsAt;
      if (st.yourScore) game.score = st.yourScore;
      blocksMusic.stop();
      savedGames.delete(channelId);
      gameRef.current = game;
      setMode("duel");
      setTopTab("duel");
      setDuel(d);
      setDuelDone(false);
      setDuelResult(null);
      setOpp({ score: st.opponentScore ?? 0, board: st.opponentBoard ?? null, lines: 0 });
      setResult(null);
      setPopups([]);
      setPhase("playing");
    };
    const onOpp = (o: DuelOpponentDTO) => {
      if (o.duelId !== duelRef.current?.id) return;
      setOpp((cur) => ({ score: o.score, board: o.board ?? cur.board, lines: o.combo ?? cur.lines }));
    };
    const onAttacked = (a: DuelAttackDTO) => {
      if (a.duelId !== duelRef.current?.id || a.kind !== "garbage") return;
      const g = gameRef.current;
      if (!g || g.over) return;
      g.receiveGarbage(a.power);
      popup(`⚠️ ${a.power} ${tr(a.power === 1 ? "ред идва" : "реда идват", "rows coming")} — ${tr("изчисти ред, за да ги спреш!", "clear lines to stop them!")}`, a.power >= 3);
      if (soundRef.current) blockSound({ kind: "stone" });
    };
    const onOver = (o: DuelOverDTO) => {
      if (o.channelId !== channelId || o.duelId !== duelRef.current?.id) return;
      const g = gameRef.current;
      if (g) g.over = true;
      setDuelResult(o);
      setDuelDone(true);
      setPhase("over");
      savedGames.delete(channelId);
      savedDuels.delete(channelId);
      blocksMusic.stop();
      if (soundRef.current) blockSound(o.winnerId === me?.id ? { kind: "level", level: 2 } : { kind: "over" });
      if (o.winnerId === me?.id) cheerFor(4, 0, false);
      load();
    };
    watch();
    socket.on("connect", watch);
    socket.on(SocketEvents.MatchLobby, onLobby);
    socket.on(SocketEvents.MatchDuelStart, onStart);
    socket.on(SocketEvents.MatchDuelOpponent, onOpp);
    socket.on(SocketEvents.MatchDuelAttacked, onAttacked);
    socket.on(SocketEvents.MatchDuelOver, onOver);
    return () => {
      socket.emit(SocketEvents.MatchUnwatch, { channelId });
      socket.off("connect", watch);
      socket.off(SocketEvents.MatchLobby, onLobby);
      socket.off(SocketEvents.MatchDuelStart, onStart);
      socket.off(SocketEvents.MatchDuelOpponent, onOpp);
      socket.off(SocketEvents.MatchDuelAttacked, onAttacked);
      socket.off(SocketEvents.MatchDuelOver, onOver);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, me?.id]);

  // ⚔️ countdown, then the boards open; my well + score go to the opponent a few times a second
  useEffect(() => {
    if (phase !== "playing" || !duel) return;
    let lastKey = "";
    const t = window.setInterval(() => {
      const g = gameRef.current;
      if (!g?.versus) return;
      const now = Date.now();
      const cd = Math.max(0, Math.ceil((duel.startsAt - now) / 1000));
      setCountdown((c) => (c !== cd ? cd : c));
      if (!g.over) g.paused = now < duel.startsAt || now >= duel.endsAt;
      if (now >= duel.endsAt && !g.over) setDuelDone(true);
      if (g.over) return;
      const codes = wellCodes(g);
      const key = g.score + "|" + g.lines + "|" + codes.join("");
      if (key !== lastKey) {
        lastKey = key;
        // (the "combo" field carries the lines: the server only relays it)
        getSocket()?.emit(SocketEvents.MatchDuelUpdate, { duelId: duel.id, score: g.score, board: codes, combo: g.lines });
      }
    }, 250);
    return () => window.clearInterval(t);
  }, [phase, duel]);
  const seek = (withId?: string) => {
    localStorage.setItem("blocksMode", "duel");
    getSocket()?.emit(SocketEvents.MatchDuelSeek, { channelId, ...(withId ? { with: withId } : {}) });
  };
  const forfeit = () => {
    const d = duelRef.current;
    if (d) getSocket()?.emit(SocketEvents.MatchDuelForfeit, { duelId: d.id });
  };
  const inDuel = phase === "playing" && !!duel && mode === "duel";
  const oppPlayer = duel?.opponent ?? lastOpp.current;

  // 🎵 Music: plays while a game runs (not paused), follows the level (new song + faster).
  const hudLevel = hud?.level ?? startLevel;
  const hudPaused = !!hud?.paused;
  useEffect(() => {
    if (phase === "playing" && musicOn && !hudPaused && !duelDone) blocksMusic.play(hudLevel);
    else if (phase === "over") blocksMusic.stop();
    else blocksMusic.pause();
  }, [phase, musicOn, hudPaused, hudLevel, duelDone]);
  useEffect(() => blocksMusic.setVolume(musicVol / 100), [musicVol]);
  const hudDanger = phase === "playing" && !!hud?.danger;
  useEffect(() => blocksMusic.setDanger(hudDanger), [hudDanger]);
  // 🐉 Every game hatches a new egg: it grows with this game's lines, its colour follows the levels climbed.
  const liveLines = phase !== "idle" ? (hud?.lines ?? 0) + (hud?.dragonBonus ?? 0) : 0;
  const grown = dragonStage(liveLines);
  const tint = forceColor ?? dragonColor(phase !== "idle" && hud && gameRef.current ? hud.level - gameRef.current.startLevel : 0);
  const stage = forceStage ?? grown.stage;
  const prevStage = useRef<number | null>(null);
  useEffect(() => {
    if (!loaded || (phase !== "idle" && !hud)) return; // a resumed game: its lines are not read yet
    const before = prevStage.current;
    prevStage.current = stage;
    if (before === null || stage <= before || forceStage !== null) return;
    window.clearTimeout(cheerTimer.current);
    setCheer((c) => ({ mood: "grow", key: (c?.key ?? 0) + 1 }));
    cheerTimer.current = window.setTimeout(() => setCheer((c) => (c ? { ...c, mood: "idle" } : c)), 3000);
    if (soundRef.current) blockSound({ kind: "level", level: stage + 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, loaded, forceStage, !hud]);
  const dragonMood: DragonMood =
    cheer && cheer.mood !== "idle"
      ? cheer.mood
      : phase === "over"
        ? "sad"
        : phase !== "playing" || hudPaused
          ? "sleep"
          : hudDanger
            ? "danger"
            : "idle";
  const saveName = (v: string) => {
    const name = v.trim().slice(0, 20) || "Змейчо";
    setDragonName(name);
    localStorage.setItem("blocksDragonName", name);
    setNaming(false);
  };

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
          <PiecePreview type={hud?.hold ?? null} dim={hud?.holdUsed} bonus={hud?.holdBonus} />
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
          {mine && mode !== "duel" && (
            <div className="blk-stat-row blk-best">
              <span>{tr("Моят рекорд", "My best")}</span>
              <b>{fmt(mine.best)}</b>
            </div>
          )}
          {mode === "duel" && duelTop?.mine && (
            <div className="blk-stat-row blk-best">
              <span>{tr("Победи в дуели", "Duel wins")}</span>
              <b>
                {duelTop.mine.wins} / {duelTop.mine.games}
              </b>
            </div>
          )}
          {inDuel && (
            <div className="mx-controls">
              <button onClick={forfeit} disabled={duelDone}>
                🏳️ {tr("Предай се", "Give up")}
              </button>
            </div>
          )}
        </div>
        {mode === "duel" && oppPlayer && (phase === "playing" || duelResult) && (
          <div className="blk-box blk-opp">
            <div className="blk-label">⚔️ {tr("Противник", "Opponent")}</div>
            <div className="mx-opp-head">
              {oppPlayer.avatarUrl ? <img className="mx-duel-ava" src={oppPlayer.avatarUrl} alt="" /> : <span className="mx-duel-ava">{oppPlayer.username[0]?.toUpperCase()}</span>}
              <b>{oppPlayer.username}</b>
            </div>
            <div className="mx-opp-score">{fmt(opp.score)}</div>
            <div className="blk-muted">
              {opp.lines} {tr("реда", "lines")}
            </div>
            <MiniWell codes={opp.board} />
          </div>
        )}
        <div className="blk-pet">
          <Dragon
            mood={dragonMood}
            cheerKey={cheer?.key ?? 0}
            beat={60 / blocksMusic.bpmFor(hudLevel)}
            stage={stage}
            progress={forceStage !== null ? 0.7 : grown.progress}
            color={tint}
          />
          <div className="blk-box blk-pet-info">
            {naming ? (
              <input
                className="blk-pet-input"
                autoFocus
                defaultValue={dragonName}
                maxLength={20}
                onBlur={(e) => saveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName(e.currentTarget.value);
                  if (e.key === "Escape") setNaming(false);
                }}
              />
            ) : (
              <button className="blk-pet-name" title={tr("Кръсти го", "Rename")} onClick={() => setNaming(true)}>
                🐉 {dragonName} <span>✏️</span>
              </button>
            )}
            <div className="blk-pet-stage">
              {DRAGON_STAGES[stage]!.name} · {stage + 1}/{DRAGON_STAGES.length}
              {stage > 0 && <> · {DRAGON_COLORS[tint]!.name}</>}
            </div>
            <div className="blk-pet-bar">
              <i style={{ width: `${Math.round(grown.progress * 100)}%` }} />
            </div>
            <div className="blk-muted">
              {grown.toNext !== null
                ? `${tr("още", "")} ${grown.toNext} ${tr(grown.toNext === 1 ? "ред до" : "реда до", "lines to")} „${DRAGON_STAGES[grown.stage + 1]!.name}“`
                : tr("Порасна докрай! 👑", "Fully grown! 👑")}
              {phase === "idle" && <> · {tr("всяка игра — ново яйце", "every game hatches a new egg")}</>}
            </div>
          </div>
        </div>
        <div className="blk-box blk-keys">
          <div><kbd>←</kbd><kbd>→</kbd> {tr("местене", "move")}</div>
          <div><kbd>↑</kbd>/<kbd>X</kbd> {tr("завърти", "rotate")} · <kbd>Z</kbd> {tr("обратно", "back")}</div>
          <div><kbd>↓</kbd> {tr("по-бързо", "soft drop")} · <kbd>{tr("Интервал", "Space")}</kbd> {tr("пусни", "drop")}</div>
          <div><kbd>C</kbd>/<kbd>Shift</kbd> {tr("запази", "hold")} · <kbd>P</kbd> {tr("пауза", "pause")}</div>
          <div><kbd>V</kbd> {tr("драконов огън (когато гневът е пълен)", "dragon fire (when rage is full)")}</div>
          <label className="blk-soft-pick" title={tr("Колко бързо пада блокчето, докато държиш ↓", "How fast a piece falls while ↓ is held")}>
            <kbd>↓</kbd> {tr("скорост", "speed")}
            <select
              value={softSpeed}
              onChange={(e) => {
                const v = Number(e.target.value);
                setSoftSpeed(v);
                localStorage.setItem("blocksSoftSpeed", String(v));
                e.currentTarget.blur();
              }}
            >
              <option value={1}>{tr("бавно", "slow")}</option>
              <option value={2}>{tr("средно", "medium")}</option>
              <option value={3}>{tr("бързо", "fast")}</option>
              <option value={4}>{tr("много бързо", "very fast")}</option>
            </select>
          </label>
        </div>
      </div>

      <div className="blk-center">
        <div ref={wellRef} className={"blk-well-wrap" + (phase === "playing" && hud ? (hud.fever > 1 ? " fever f" + String(hud.fever).replace(".", "") : "") + (hud.rageSec > 0 ? " raging" : "") + (hud.slowSec > 0 ? " slowed" : "") : "")} style={customH && !fullscreen ? { height: customH } : undefined}>
          <canvas ref={canvasRef} className={"blk-well" + (shakeWell ? " blk-hit" : "")} />
          {phase === "playing" && !!hud?.pending && (
            <div className="blk-garbage" title={tr("Редове боклук, които идват", "Garbage rows coming")}>
              <i style={{ height: `${Math.min(100, (hud.pending / 20) * 100)}%` }} />
              <span>{hud.pending}</span>
            </div>
          )}
          {inDuel && countdown > 0 && (
            <div className="blk-overlay mx-countdown">
              <div className="mx-vs">
                ⚔️ {me?.username} <span>vs</span> {duel!.opponent.username}
              </div>
              <div key={countdown} className="mx-count">
                {countdown}
              </div>
            </div>
          )}
          {inDuel && duelDone && (
            <div className="blk-overlay">
              <div className="blk-paused">{hud?.over ? tr("💥 Препълни се!", "💥 Topped out!") : tr("⏱ Времето свърши!", "⏱ Time is up!")}</div>
              <div className="blk-muted">{tr("Чакаме резултата…", "Waiting for the result…")}</div>
            </div>
          )}
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
              <div className="mx-modes">
                <button
                  className={mode === "solo" ? "on" : ""}
                  onClick={() => {
                    setMode("solo");
                    setTopTab("score");
                    localStorage.setItem("blocksMode", "solo");
                  }}
                >
                  🧱 {tr("Соло", "Solo")}
                </button>
                <button
                  className={mode === "duel" ? "on" : ""}
                  onClick={() => {
                    setMode("duel");
                    setTopTab("duel");
                    localStorage.setItem("blocksMode", "duel");
                  }}
                >
                  ⚔️ {tr("Дуел", "Duel")}
                </button>
              </div>
              {mode === "duel" && duelResult && (
                <div className="blk-result">
                  <div className={`mx-duel-verdict ${duelResult.winnerId === me?.id ? "win" : duelResult.winnerId ? "lose" : ""}`}>
                    {duelResult.winnerId === me?.id ? `🏆 ${tr("Победа!", "Victory!")}` : duelResult.winnerId ? tr("Загуба", "Defeat") : tr("Равенство", "Draw")}
                  </div>
                  <div className="mx-duel-score">
                    {fmt(duelResult.you)} : {fmt(duelResult.them)}
                  </div>
                  {duelResult.reason === "out" && <div>{duelResult.winnerId === me?.id ? tr("противникът се препълни", "the opponent topped out") : tr("препълни се", "you topped out")}</div>}
                  {duelResult.reason === "forfeit" && <div>{duelResult.winnerId === me?.id ? tr("противникът се предаде", "the opponent gave up") : tr("предаде се", "you gave up")}</div>}
                  {duelResult.reason === "left" && <div>{duelResult.winnerId === me?.id ? tr("противникът излезе", "the opponent left") : tr("дуелът приключи, докато те нямаше", "the duel ended while you were away")}</div>}
                  {duelResult.games > 0 && (
                    <div>
                      {tr("Победи", "Wins")}: {duelResult.wins} / {duelResult.games}
                    </div>
                  )}
                </div>
              )}
              {mode === "duel" && (
                <>
                  {duelResult && oppPlayer && (
                    <button className="blk-start" onClick={() => seek(lobby?.waiting.some((p) => p.userId === oppPlayer.userId) ? oppPlayer.userId : undefined)}>
                      🔁 {tr("Реванш", "Rematch")}
                    </button>
                  )}
                  <DuelLobby lobby={lobby} meId={me?.id} onSeek={seek} onCancel={() => getSocket()?.emit(SocketEvents.MatchDuelCancel, { channelId })} gameName="Шметрис" />
                  <div className="mx-duel-help blk-duel-help">
                    <div>⚔️ {tr("Който се препълни пръв, губи.", "Whoever tops out first loses.")}</div>
                    <div>
                      🧱 {tr("2 реда → 1 ред боклук на другия, 3 → 2, 4 → 4; завъртане ×2; комбо, подред, чист кладенец и огнен множител — още.", "2 lines → 1 garbage row for the other, 3 → 2, 4 → 4; spins ×2; combos, back-to-back, perfect clears and fever add more.")}
                    </div>
                    <div>🛡 {tr("Твоите редове първо спират идващите към теб (червената лента).", "Your lines first cancel the rows coming at you (the red bar).")}</div>
                    <div>🐉 {tr("Драконов огън (V) праща 3 реда.", "Dragon fire (V) sends 3 rows.")}</div>
                  </div>
                </>
              )}
              {mode === "solo" && result && (
                <div className="blk-result">
                  <div className="blk-result-score">{fmt(result.score)}</div>
                  <div>
                    {result.lines} {tr("реда", "lines")} · {tr("ниво", "level")} {result.level}
                  </div>
                  {result.record && <div className="blk-record">🏆 {tr("Нов личен рекорд!", "New personal best!")}</div>}
                  {result.score > 0 && !result.saved && <div className="blk-muted">{tr("записва се…", "saving…")}</div>}
                </div>
              )}
              {mode === "solo" && (
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
              )}
              {mode === "solo" && (
              <button className="blk-start" onClick={start}>
                {result ? tr("▶ Нова игра", "▶ New game") : tr("▶ Играй", "▶ Play")}
              </button>
              )}
            </div>
          )}
          {phase === "playing" && hud?.paused && !gameRef.current?.versus && (
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
          <button className={hud?.rage && hud.rage >= RAGE_MAX ? "blk-touch-rage ready" : "blk-touch-rage"} onPointerDown={tap((x) => x.unleash())}>🔥</button>
          <button onPointerDown={tap((x) => !x.over && (x.paused = !x.paused))}>⏸</button>
        </div>
      </div>

      <div className="blk-side blk-right">
        <div className="blk-box">
          <div className="blk-label">{tr("Следващи", "Next")}</div>
          {(hud?.next ?? []).map((t, i) => (
            <PiecePreview key={i} type={t} bonus={hud?.nextBonus[i]} />
          ))}
          {!hud && <div className="blk-muted blk-next-empty">—</div>}
        </div>
        {phase === "playing" && hud && (
          <div className="blk-box blk-extras">
            <div className={"blk-rage" + (hud.rage >= RAGE_MAX ? " ready" : "") + (hud.rageSec > 0 ? " burning" : "")}>
              <div className="blk-label">
                🐉 {tr("Гняв", "Rage")}{" "}
                {hud.rageSec > 0 ? <b>🔥 ×2 · {hud.rageSec} {tr("с", "s")}</b> : hud.rage >= RAGE_MAX ? <b>{tr("натисни", "press")} <kbd>V</kbd>!</b> : null}
              </div>
              <div className="blk-rage-bar">
                <i style={{ width: (hud.rageSec > 0 ? (hud.rageSec / 10) * 100 : (hud.rage / RAGE_MAX) * 100) + "%" }} />
              </div>
            </div>
            {hud.fever > 1 && <div className={"blk-fever f" + String(hud.fever).replace(".", "")}>🔥 {tr("Огнен множител", "Fever")} ×{hud.fever}</div>}
            {hud.slowSec > 0 && <div className="blk-slow">⏳ {tr("Забавено", "Slowed")} · {hud.slowSec} {tr("с", "s")}</div>}
            <div className="blk-mission">
              <div className="blk-label">🎯 {tr("Мисия", "Mission")} {hud.missionsDone > 0 && <span className="blk-muted">· ✔ {hud.missionsDone}</span>}</div>
              {hud.mission ? (
                <>
                  <div className="blk-mission-text">{missionText(hud.mission.id)}</div>
                  {hud.mission.goal > 1 && (
                    <div className="blk-pet-bar">
                      <i style={{ width: (hud.mission.progress / hud.mission.goal) * 100 + "%" }} />
                    </div>
                  )}
                </>
              ) : (
                <div className="blk-muted">{tr("следващата идва…", "the next one is coming…")}</div>
              )}
            </div>
          </div>
        )}
        <div className="blk-box blk-top">
          <div className="blk-label">🏆 {tr("Класация на сървъра", "Server top list")}</div>
          <div className="mx-tabs">
            <button className={topTab === "score" ? "on" : ""} onClick={() => setTopTab("score")}>
              🧱 {tr("Точки", "Score")}
            </button>
            <button className={topTab === "duel" ? "on" : ""} onClick={() => setTopTab("duel")}>
              ⚔️ {tr("Дуели", "Duels")}
            </button>
          </div>
          {topTab === "duel" ? (
            <>
              {!duelTop?.top.length && <div className="blk-muted">{tr("Още няма дуели.", "No duels yet.")}</div>}
              <ol>
                {(duelTop?.top ?? []).map((r, i) => (
                  <li key={r.userId} className={me?.id === r.userId ? "me" : ""} title={`${r.games} ${tr("дуела", "duels")}`}>
                    <span className="blk-rank">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</span>
                    {r.avatarUrl ? <img src={r.avatarUrl} alt="" /> : <span className="blk-ava">{r.username.slice(0, 1).toUpperCase()}</span>}
                    <span className="blk-name">{r.username}</span>
                    <b>{r.wins} 🏆</b>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <>
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
            </>
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

function draw(canvas: HTMLCanvasElement | null, game: BlocksGame | null, cw: number, ch: number, now: number) {
  if (!canvas || !cw) return;
  const rect = { width: cw, height: ch };
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
      if (!v) continue;
      stampCell(g, x * s, (y - HIDDEN) * s, s, dpr, cellColor(v), game.over ? 0.45 : 1);
      if (v === GOLD) {
        // a glint running along the golden row
        const k = Math.max(0, Math.sin(now / 220 - x * 0.7));
        if (k > 0.6) {
          g.fillStyle = "rgba(255,255,255," + ((k - 0.6) * 1.8).toFixed(2) + ")";
          g.beginPath();
          g.roundRect(x * s + s * 0.15, (y - HIDDEN) * s + s * 0.15, s * 0.7, s * 0.7, s * 0.15);
          g.fill();
        }
      }
      const tag = game.tags[y]![x];
      if (tag && !game.over) drawBonus(g, x * s, (y - HIDDEN) * s, s, tag, now);
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
    // drawn part of the way to the next row → a smooth fall instead of a jump per row
    const off = game.dropOffset;
    for (const [cx, cy] of pieceCells(a.type, a.rot)) {
      const y = a.y + cy - HIDDEN + off;
      if (y > -1) stampCell(g, (a.x + cx) * s, y * s, s, dpr, col);
    }
    if (a.bonus) {
      const [bx, by] = bonusCell(a.type, a.rot, a.bonus.i);
      drawBonus(g, (a.x + bx) * s, (a.y + by - HIDDEN + off) * s, s, a.bonus.kind, now);
    }
  }
  drawFx(g, game, s, rect.width, rect.height);
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

/** Bonus / rage / perfect-clear effects on top of the well. */
function drawFx(g: CanvasRenderingContext2D, game: BlocksGame, s: number, W: number, H: number) {
  for (const f of game.fx) {
    const t = 1 - f.ms / f.total; // 0 → 1
    const cx = (f.x + 0.5) * s;
    const cy = (f.y + 0.5) * s;
    g.save();
    if (f.kind === "bomb") {
      g.globalAlpha = 1 - t;
      const r = s * (0.5 + 3 * t);
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, "rgba(255,250,210,0.95)");
      grad.addColorStop(0.4, "rgba(255,150,40,0.8)");
      grad.addColorStop(1, "rgba(255,60,20,0)");
      g.fillStyle = grad;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();
    } else if (f.kind === "bolt") {
      g.globalAlpha = (1 - t) * (0.7 + 0.3 * Math.sin(t * 40));
      const grad = g.createLinearGradient(cx - s, 0, cx + s, 0);
      grad.addColorStop(0, "rgba(120,200,255,0)");
      grad.addColorStop(0.5, "rgba(235,248,255,1)");
      grad.addColorStop(1, "rgba(120,200,255,0)");
      g.fillStyle = grad;
      g.fillRect(cx - s, 0, 2 * s, H);
      // the zig-zag
      g.strokeStyle = "#fff";
      g.lineWidth = Math.max(2, s * 0.12);
      g.beginPath();
      for (let y = 0; y <= H; y += s * 0.8) g.lineTo(cx + (Math.random() - 0.5) * s * 0.7, y);
      g.stroke();
    } else if (f.kind === "rainbow") {
      g.globalAlpha = 0.35 * (1 - t);
      const grad = g.createLinearGradient(0, 0, W, H);
      ["#ff4d6d", "#ff8a3d", "#ffc53d", "#33d17a", "#3d9bff", "#b06bff"].forEach((c, i) => grad.addColorStop(i / 5, c));
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
    } else if (f.kind === "slow") {
      g.globalAlpha = 1 - t;
      g.strokeStyle = "#9fd8ff";
      g.lineWidth = s * 0.15;
      for (const k of [0, 0.3]) {
        g.beginPath();
        g.arc(cx, cy, s * (0.5 + 5 * Math.max(0, t - k)), 0, Math.PI * 2);
        g.stroke();
      }
    } else if (f.kind === "rage") {
      // flames licking up from the bottom
      g.globalAlpha = 1 - t * t;
      const h = s * (3 + 4 * Math.sin(t * Math.PI));
      const grad = g.createLinearGradient(0, H, 0, H - h);
      grad.addColorStop(0, "rgba(255,240,170,0.95)");
      grad.addColorStop(0.35, "rgba(255,140,30,0.85)");
      grad.addColorStop(1, "rgba(220,30,20,0)");
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(cx - s * 1.2, H);
      g.quadraticCurveTo(cx - s * 0.6, H - h * 0.6, cx + Math.sin(t * 20 + f.x) * s * 0.4, H - h);
      g.quadraticCurveTo(cx + s * 0.6, H - h * 0.6, cx + s * 1.2, H);
      g.fill();
    } else if (f.kind === "perfect") {
      g.globalAlpha = 0.5 * (1 - t);
      g.fillStyle = "#fff6c0";
      g.fillRect(0, 0, W, H);
    } else if (f.kind === "gold") {
      g.globalAlpha = 0.6 * (1 - t);
      const grad = g.createLinearGradient(0, H - s, 0, H - 3 * s);
      grad.addColorStop(0, "rgba(255,210,60,0.9)");
      grad.addColorStop(1, "rgba(255,210,60,0)");
      g.fillStyle = grad;
      g.fillRect(0, H - 3 * s, W, 3 * s);
    }
    g.restore();
  }
}
