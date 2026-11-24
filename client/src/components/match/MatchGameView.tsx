import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  DUEL_SECONDS,
  DUEL_WARN_MS,
  SocketEvents,
  type DuelAttackDTO,
  type DuelAttackKind,
  type DuelLobbyDTO,
  type DuelOpponentDTO,
  type DuelOverDTO,
  type DuelPlayerDTO,
  type DuelStartDTO,
} from "@discord-clone/shared";
import { http } from "../../api/http";
import { getSocket } from "../../socket/socket";
import { tr } from "../../i18n";
import { useAuthStore } from "../../store/authStore";
import { matchMusic } from "../blocks/music";
import "../blocks/blocks.css";
import { Gem, GemDefs, GEM_COLORS } from "./Gems";
import { MatchBoard, SIZE, feverOf, type MoveResult, type Pos, type Special, type Step, type Tile } from "./engine";
import { matchSound } from "./sounds";
import { ATTACK_ICON, AttackHelp, DuelLobby, DuelSpectator, LiveDuels, MiniBoard, OpponentCard, attackName } from "./DuelPanel";
import "./match.css";

/** 🍬 Шмиксер — the screen of a "match" channel: solo match-3 (4 minutes / 60 moves), ⚔️ duels
 *  against another person (combos send attacks), + the server's top lists. */

type Mode = "time" | "moves" | "duel";
const TIME_S = 240;
const SIZE_KEY = "matchBoardSize";
const MIN_W = 260;
const MAX_W = 1600;
const MOVES = 60;

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
  kind: "beamRow" | "beamCol" | "ring" | "flash" | "score" | "fly";
  /** fly: target cell */
  tr?: number;
  tc?: number;
  r: number;
  c: number;
  color?: string;
  dx?: number;
  dy?: number;
  text?: string;
  big?: boolean;
}

interface Duel {
  id: string;
  opponent: DuelPlayerDTO;
  /** local clock */
  startsAt: number;
  endsAt: number;
}
interface Saved {
  board: MatchBoard;
  mode: Mode;
  timeLeft: number;
  movesLeft: number;
  duel?: Duel | null;
}
/** An unfinished game survives leaving the channel (kept paused per channel). */
const savedGames = new Map<string, Saved>();

const fmt = (n: number) => n.toLocaleString("bg-BG");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const POP_MS = 230;
const FALL_MS = 280;

/** One tile: memoised, so a change of one tile (or the clock) doesn't re-render all 64 gems. */
const TileView = memo(function TileView({ cls, r, c, color, special, ice }: { cls: string; r: number; c: number; color: number; special: Special | null; ice?: boolean }) {
  return (
    <div className={cls} style={{ transform: `translate3d(${c * 100}%, ${r * 100}%, 0)` }}>
      <Gem color={color} special={special} ice={ice} />
    </div>
  );
});

/** Sparks on a canvas over the board (hundreds of DOM sparks were the slow part of big combos). */
interface Spark {
  x: number; // 0..1 of the board
  y: number;
  vx: number; // board widths per second
  vy: number;
  life: number; // s left
  total: number;
  color: string;
  size: number; // of a cell
}
class SparkLayer {
  sparks: Spark[] = [];
  canvas: HTMLCanvasElement | null = null;
  private raf = 0;
  private last = 0;
  burst(items: Spark[]) {
    this.sparks.push(...items);
    if (this.sparks.length > 700) this.sparks.splice(0, this.sparks.length - 700);
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    }
  }
  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.sparks = [];
  }
  private frame = (now: number) => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const c = this.canvas;
    if (!c) {
      this.raf = 0;
      return;
    }
    const w = c.clientWidth;
    const h = c.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.globalCompositeOperation = "lighter";
    const cell = w / SIZE;
    for (const p of this.sparks) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 0.9 * dt; // gravity
      p.vx *= 1 - 1.5 * dt;
      const k = Math.max(0, p.life / p.total);
      g.globalAlpha = k;
      g.fillStyle = p.color;
      const r = cell * p.size * (0.4 + 0.6 * k);
      g.beginPath();
      g.arc(p.x * w, p.y * h, r, 0, Math.PI * 2);
      g.fill();
    }
    this.sparks = this.sparks.filter((p) => p.life > 0);
    if (this.sparks.length) this.raf = requestAnimationFrame(this.frame);
    else {
      g.clearRect(0, 0, w, h);
      this.raf = 0;
    }
  };
}

function viewOf(board: MatchBoard): Record<number, ViewTile> {
  const out: Record<number, ViewTile> = {};
  board.grid.forEach((row, r) => row.forEach((t, c) => t && (out[t.id] = { tile: t, r, c })));
  return out;
}

function comboName(combo: number) {
  if (combo >= 9) return tr("Божествено!", "Divine!");
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
  const [paused, setPaused] = useState(!!resumed && resumed.mode !== "duel");
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
  // the exact time left lives here; the state only changes once a second (no re-render 10× a second)
  const timeRef = useRef(resumed?.timeLeft ?? TIME_S);
  const [streak, setStreak] = useState(resumed?.board.streak ?? 0);
  const sparks = useRef(new SparkLayer());
  useEffect(() => () => sparks.current.stop(), []);
  const movesRef = useRef(movesLeft);
  movesRef.current = movesLeft;
  // ⚔️ duel
  const [lobby, setLobby] = useState<DuelLobbyDTO | null>(null);
  /** 👁 the duel this person is watching */
  const [spectating, setSpectating] = useState<string | null>(null);
  const [duel, setDuel] = useState<Duel | null>(resumed?.duel ?? null);
  const duelRef = useRef(duel);
  duelRef.current = duel;
  const [opp, setOpp] = useState<{ score: number; board: number[] | null; combo: number }>({ score: 0, board: null, combo: 0 });
  const [countdown, setCountdown] = useState(0);
  const [duelDone, setDuelDone] = useState(false); // my time is up, waiting for the result
  const [duelResult, setDuelResult] = useState<DuelOverDTO | null>(null);
  const [incoming, setIncoming] = useState<(DuelAttackDTO & { key: number; landsAt: number }) | null>(null);
  const incomingRef = useRef(incoming);
  incomingRef.current = incoming;
  const [fogUntil, setFogUntil] = useState(0);
  const lastOpp = useRef<DuelPlayerDTO | null>(null);
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

  const resetDuel = () => {
    setDuel(null);
    setDuelDone(false);
    setDuelResult(null);
    setIncoming(null);
    setFogUntil(0);
    setCountdown(0);
  };

  const start = () => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (mode === "duel") return;
    getSocket()?.emit(SocketEvents.MatchDuelCancel, { channelId });
    resetDuel();
    const board = new MatchBoard();
    boardRef.current = board;
    savedGames.delete(channelId);
    localStorage.setItem("matchMode", mode);
    setTab(mode);
    setTiles(viewOf(board));
    setScore(0);
    setTimeLeft(TIME_S);
    timeRef.current = TIME_S;
    setStreak(0);
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
    if (!board || mode === "duel") return;
    setPhase("over");
    savedGames.delete(channelId);
    sfx("over");
    const res = { score: board.score, combo: board.bestCombo, record: false, saved: false };
    setResult(res);
    if (board.score <= 0) return;
    http
      .post<Lists & { record: boolean }>(`/api/text-channels/${channelId}/match/score`, { mode, score: board.score, combo: board.bestCombo, moves: board.moves })
      .then((r) => {
        setLists({ time: r.data.time, moves: r.data.moves, duel: r.data.duel });
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
    const burst: Spark[] = [];
    for (const p of st.popped) {
      const color = p.tile.special === "prism" ? "#fff" : GEM_COLORS[p.tile.color] ?? "#fff";
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 0.08 + Math.random() * 0.22;
        const life = 0.45 + Math.random() * 0.4;
        burst.push({ x: (p.c + 0.5) / SIZE, y: (p.r + 0.5) / SIZE, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.05, life, total: life, color, size: 0.05 + Math.random() * 0.05 });
      }
    }
    sparks.current.burst(burst);
    let bigShake = false;
    for (const b of st.blasts) {
      if (b.kind === "rowRocket") items.push({ kind: "beamRow", r: b.r, c: b.c });
      else if (b.kind === "colRocket") items.push({ kind: "beamCol", r: b.r, c: b.c });
      else if (b.kind === "cross") items.push({ kind: "beamRow", r: b.r, c: b.c }, { kind: "beamCol", r: b.r, c: b.c });
      else if (b.kind === "firefly" && b.tr !== undefined) items.push({ kind: "fly", r: b.r, c: b.c, tr: b.tr, tc: b.tc });
      else if (b.kind === "firefly") items.push({ kind: "ring", r: b.r, c: b.c });
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
    if (kinds.has("firefly")) sfx("firefly");
    if (st.made.length) setTimeout(() => sfx("made"), 120);
    if (st.combo >= 2) {
      setCombo((c) => ({ n: st.combo, key: (c?.key ?? 0) + 1 }));
      if (st.combo === 5 || st.combo === 7 || st.combo === 9) sfx("fanfare", st.combo);
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

  /** Fever, move bonuses and extra seconds, once the steps are shown. */
  const afterMove = (res: MoveResult) => {
    const before = feverOf(streak);
    setStreak(res.streak ?? 0);
    const fever = res.fever ?? 1;
    if (fever > before) {
      sfx("fever", fever);
      addFx([{ kind: "score", r: 2.2, c: 3.5, text: `🔥 ${tr("Огнен множител", "Fever")} ×${fever}`, big: true }], 1300);
    } else if (fever === 1 && before > 1) addFx([{ kind: "score", r: 2.2, c: 3.5, text: tr("огънят угасна", "the fever is out") }], 1100);
    const texts: string[] = [];
    for (const b of res.bonuses ?? []) {
      texts.push(`${b.kind === "double" ? tr("⚡ Двоен удар!", "⚡ Double strike!") : tr("💥 Мега ход!", "💥 Mega move!")} +${fmt(b.points)}`);
      sfx("bonus", b.kind === "mega");
    }
    if (mode === "time" && res.timeBonus) {
      timeRef.current += res.timeBonus;
      setTimeLeft(timeRef.current);
      texts.push(`⏱ +${res.timeBonus} ${tr("с", "s")}`);
    }
    texts.forEach((text, i) => addFx([{ kind: "score", r: 4.6 + i * 0.8, c: 3.5, text, big: true }], 1400));
  };

  const trySwap = async (a: Pos, b: Pos) => {
    const board = boardRef.current;
    if (!board || busy.current || phase !== "playing" || paused || duelLocked()) return;
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
    afterMove(res);
    if (mode === "duel") duelAfterMove(res, board);
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

  /** ⚔️ No moves before the countdown ends / after my duel time is up. */
  const duelLocked = () => {
    const d = duelRef.current;
    return mode === "duel" && (!d || Date.now() < d.startsAt || Date.now() >= d.endsAt);
  };

  const sendUpdate = (board: MatchBoard, combo = 0) => {
    const d = duelRef.current;
    if (d) getSocket()?.emit(SocketEvents.MatchDuelUpdate, { duelId: d.id, score: board.score, board: board.codes(), combo });
  };

  /** Which attack a move sends (the strongest one; null = none). */
  const attackOf = (res: MoveResult): { kind: DuelAttackKind; power: number } | null => {
    const kinds = new Set(res.steps.flatMap((st) => st.blasts.map((b) => b.kind)));
    let a: { kind: DuelAttackKind; power: number } | null = null;
    if (kinds.has("allColor") || kinds.has("board")) a = { kind: "scramble", power: kinds.has("board") ? 2 : 1 };
    else if (kinds.has("bigBomb")) a = { kind: "stone", power: 3 };
    else if (kinds.has("bomb")) a = { kind: "stone", power: 1 };
    else if (kinds.has("cross")) a = { kind: "fog", power: 2 };
    else if (kinds.has("rowRocket") || kinds.has("colRocket")) a = { kind: "fog", power: 1 };
    else if (res.steps.length >= 4 || kinds.has("firefly")) a = { kind: "ice", power: Math.min(3, Math.max(1, res.steps.length - 3)) };
    if (a && (res.fever ?? 1) >= 2) a.power = Math.min(3, a.power + 1);
    return a;
  };

  const duelAfterMove = (res: MoveResult, board: MatchBoard) => {
    const d = duelRef.current;
    if (!d) return;
    sendUpdate(board, res.steps.length);
    const atk = attackOf(res);
    if (!atk) return;
    const inc = incomingRef.current;
    if (inc && Date.now() < inc.landsAt) {
      // 🛡 a strong move while an attack is on its way blocks it (yours is spent on the block)
      setIncoming(null);
      getSocket()?.emit(SocketEvents.MatchDuelBlock, { duelId: d.id });
      sfx("block");
      addFx([{ kind: "score", r: 3.4, c: 3.5, text: `🛡 ${tr("Блокира!", "Blocked!")}`, big: true }], 1300);
      return;
    }
    getSocket()?.emit(SocketEvents.MatchDuelAttack, { duelId: d.id, kind: atk.kind, power: atk.power });
    sfx("attack");
    addFx([{ kind: "score", r: 1.2, c: 3.5, text: `⚔️ ${ATTACK_ICON[atk.kind]} ${attackName(atk.kind)} → ${d.opponent.username}`, big: true }], 1300);
  };

  /** An incoming attack lands (once no move is running). */
  const landAttack = (a: DuelAttackDTO) => {
    const board = boardRef.current;
    if (!board) return;
    sfx("hit", a.kind);
    setHint([]);
    if (a.kind === "ice") board.freeze(2 + a.power * 2);
    else if (a.kind === "stone") board.stones(1 + a.power);
    else if (a.kind === "scramble") board.scramble();
    else setFogUntil(Date.now() + 2500 + a.power * 1500);
    if (a.kind !== "fog") {
      setTiles(viewOf(board));
      setShake(false);
      requestAnimationFrame(() => setShake(true));
      window.clearTimeout(shakeTimer.current);
      shakeTimer.current = window.setTimeout(() => setShake(false), 420);
      sendUpdate(board);
    }
    addFx([{ kind: "score", r: 3.4, c: 3.5, text: `${ATTACK_ICON[a.kind]} ${attackName(a.kind)}!`, big: true }], 1200);
  };

  // incoming attacks land after the warning (if not blocked), waiting for a running move to finish
  useEffect(() => {
    if (!incoming) return;
    const t = window.setInterval(() => {
      const inc = incomingRef.current;
      if (!inc || Date.now() < inc.landsAt || busy.current) return;
      setIncoming(null);
      if (phaseRef.current === "playing" && duelRef.current && Date.now() < duelRef.current.endsAt) landAttack(inc);
    }, 80);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming?.key]);
  useEffect(() => {
    if (!fogUntil) return;
    const t = window.setTimeout(() => setFogUntil(0), Math.max(0, fogUntil - Date.now()));
    return () => window.clearTimeout(t);
  }, [fogUntil]);

  // ⚔️ the duel over the socket: lobby, start, the opponent's score, attacks, the result
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const watch = () => socket.emit(SocketEvents.MatchWatch, { channelId });
    const onLobby = (l: DuelLobbyDTO) => {
      if (l.channelId !== channelId) return;
      setLobby(l);
      // came back after the duel ended while away
      const d = duelRef.current;
      if (d && !duelResultRef.current && Date.now() > d.startsAt && !l.playing.some((p) => p.a.userId === me?.id || p.b.userId === me?.id)) {
        setDuelDone(true);
        setPhase("over");
        setDuelResult({ duelId: d.id, channelId, you: boardRef.current?.score ?? 0, them: oppRef.current.score, winnerId: null, reason: "left", wins: 0, games: 0 });
        savedGames.delete(channelId);
        load();
      }
    };
    const onStart = (st: DuelStartDTO) => {
      if (st.channelId === channelId) setSpectating(null);
      if (st.channelId !== channelId) return;
      const off = Date.now() - st.serverNow;
      const d: Duel = { id: st.duelId, opponent: st.opponent, startsAt: st.startsAt + off, endsAt: st.endsAt + off };
      lastOpp.current = st.opponent;
      if (duelRef.current?.id === st.duelId && boardRef.current) {
        // reconnected: same duel, same board
        setDuel(d);
        if (st.opponentScore !== undefined) setOpp((o) => ({ ...o, score: st.opponentScore!, board: st.opponentBoard ?? o.board }));
        return;
      }
      const board = new MatchBoard();
      if (st.yourScore) board.score = st.yourScore;
      boardRef.current = board;
      savedGames.delete(channelId);
      setMode("duel");
      setTab("duel");
      setDuel(d);
      setDuelDone(false);
      setDuelResult(null);
      setIncoming(null);
      setFogUntil(0);
      setOpp({ score: st.opponentScore ?? 0, board: st.opponentBoard ?? null, combo: 0 });
      setTiles(viewOf(board));
      setScore(board.score);
      setStreak(0);
      timeRef.current = Math.max(0, (d.endsAt - Math.max(Date.now(), d.startsAt)) / 1000);
      setTimeLeft(timeRef.current);
      setResult(null);
      setSelected(null);
      setHint([]);
      setPaused(false);
      matchMusic.stop();
      setPhase("playing");
      lastInput.current = Date.now();
      sfx("warn");
      // the opponent and 👁 spectators see the board from the start, not only after the first move
      socket.emit(SocketEvents.MatchDuelUpdate, { duelId: d.id, score: board.score, board: board.codes(), combo: 0 });
    };
    const onOpp = (o: DuelOpponentDTO) => {
      if (o.duelId !== duelRef.current?.id) return;
      setOpp((cur) => ({ score: o.score, board: o.board ?? cur.board, combo: o.combo ?? 0 }));
    };
    const onAttacked = (a: DuelAttackDTO) => {
      if (a.duelId !== duelRef.current?.id) return;
      // a second one while one is on its way: the stronger one wins
      const cur = incomingRef.current;
      if (cur && cur.power >= a.power && Date.now() < cur.landsAt) return;
      sfx("warn");
      setIncoming({ ...a, key: Date.now(), landsAt: Date.now() + DUEL_WARN_MS });
    };
    const onBlocked = (b: { duelId: string }) => {
      if (b.duelId !== duelRef.current?.id) return;
      addFx([{ kind: "score", r: 1.2, c: 3.5, text: `🛡 ${duelRef.current?.opponent.username} ${tr("блокира атаката ти", "blocked your attack")}` }], 1400);
    };
    const onOver = (o: DuelOverDTO) => {
      if (o.channelId !== channelId || o.duelId !== duelRef.current?.id) return;
      setDuelResult(o);
      setDuelDone(true);
      setIncoming(null);
      setFogUntil(0);
      setPhase("over");
      savedGames.delete(channelId);
      matchMusic.stop();
      if (o.winnerId === me?.id) sfx("win");
      else if (o.winnerId) sfx("lose");
      else sfx("over");
      load();
    };
    watch();
    socket.on("connect", watch);
    socket.on(SocketEvents.MatchLobby, onLobby);
    socket.on(SocketEvents.MatchDuelStart, onStart);
    socket.on(SocketEvents.MatchDuelOpponent, onOpp);
    socket.on(SocketEvents.MatchDuelAttacked, onAttacked);
    socket.on(SocketEvents.MatchDuelBlocked, onBlocked);
    socket.on(SocketEvents.MatchDuelOver, onOver);
    return () => {
      socket.emit(SocketEvents.MatchUnwatch, { channelId });
      socket.off("connect", watch);
      socket.off(SocketEvents.MatchLobby, onLobby);
      socket.off(SocketEvents.MatchDuelStart, onStart);
      socket.off(SocketEvents.MatchDuelOpponent, onOpp);
      socket.off(SocketEvents.MatchDuelAttacked, onAttacked);
      socket.off(SocketEvents.MatchDuelBlocked, onBlocked);
      socket.off(SocketEvents.MatchDuelOver, onOver);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, me?.id]);
  const duelResultRef = useRef(duelResult);
  duelResultRef.current = duelResult;
  const oppRef = useRef(opp);
  oppRef.current = opp;

  // ⚔️ the duel clock: from the shared end time (no pause in a duel), the countdown before it
  useEffect(() => {
    if (phase !== "playing" || mode !== "duel" || !duel) return;
    const t = window.setInterval(() => {
      const now = Date.now();
      const cd = Math.ceil((duel.startsAt - now) / 1000);
      setCountdown((c) => (c !== Math.max(0, cd) ? Math.max(0, cd) : c));
      const v = timeRef.current;
      const nv = Math.max(0, Math.min(DUEL_SECONDS, (duel.endsAt - Math.max(now, duel.startsAt)) / 1000));
      timeRef.current = nv;
      if (Math.ceil(nv) !== Math.ceil(v)) {
        if (nv <= 10 && nv > 0) sfx("tick", nv <= 5);
        setTimeLeft(nv);
      }
      if (nv <= 0 && !duelDone && !busy.current && boardRef.current) {
        setDuelDone(true);
        sendUpdate(boardRef.current); // the final score
      }
    }, 100);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, mode, duel, duelDone]);

  const seek = (withId?: string) => getSocket()?.emit(SocketEvents.MatchDuelSeek, { channelId, ...(withId ? { with: withId } : {}) });
  const forfeit = () => {
    const d = duelRef.current;
    if (d) getSocket()?.emit(SocketEvents.MatchDuelForfeit, { duelId: d.id });
  };

  /** 🔄 Start over (the current game is dropped, no score saved). */
  const restart = () => {
    if (mode === "duel") return;
    start();
  };

  // ⏱ the clock (time mode), paused with the game
  useEffect(() => {
    if (phase !== "playing" || paused || mode !== "time") return;
    let last = performance.now();
    const t = window.setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      const v = timeRef.current;
      const nv = Math.max(0, v - dt);
      timeRef.current = nv;
      if (Math.ceil(nv) !== Math.ceil(v)) {
        if (nv <= 10 && nv > 0) sfx("tick", nv <= 5);
        setTimeLeft(nv);
      }
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
    if (phase !== "playing" || mode === "duel") return;
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
  }, [phase, mode]);

  // leaving the channel keeps an unfinished game (paused)
  useEffect(
    () => () => {
      const board = boardRef.current;
      if (board && phaseRef.current === "playing")
        savedGames.set(channelId, { board, mode: modeRef.current, timeLeft: timeRef.current, movesLeft: movesRef.current, duel: duelRef.current });
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
    // e2e: set up a board by hand, then show it
    const wb = window as unknown as { __matchBoard?: () => MatchBoard | null; __matchSync?: () => void };
    wb.__matchBoard = () => boardRef.current;
    wb.__matchSync = () => boardRef.current && setTiles(viewOf(boardRef.current));
    return () => {
      delete w.__matchMove;
      delete w.__matchBusy;
      delete wb.__matchBoard;
      delete wb.__matchSync;
    };
  }, []);

  // 🎵 music: playful; the last 20 s / last 5 moves are faster
  const hurry = phase === "playing" && (mode === "moves" ? movesLeft <= 5 : timeLeft <= 20);
  useEffect(() => {
    if (phase === "playing" && musicOn && !paused && !duelDone) matchMusic.play(hurry);
    else if (phase === "over") matchMusic.stop();
    else matchMusic.pause();
  }, [phase, musicOn, paused, hurry, duelDone]);
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
    if (phase !== "playing" || paused || busy.current || duelLocked()) return;
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
  const mine = mode === "duel" ? null : lists?.[mode]?.mine;
  const myDuels = lists?.duel?.mine;
  const inDuel = mode === "duel" && phase === "playing" && !!duel;
  const oppPlayer = duel?.opponent ?? lastOpp.current;
  const myRank = me && cur ? cur.top.findIndex((r) => r.userId === me.id) : -1;
  const pct = (n: number) => `${(n / SIZE) * 100}%`;

  return (
    <div className={`blk-view mx-view ${resizing ? "resizing" : ""}`}>
      {spectating && (
        <DuelSpectator
          channelId={channelId}
          duelId={spectating}
          gameName="🍬 Шмиксер"
          renderBoard={(codes) => <MiniBoard codes={codes} />}
          onClose={() => setSpectating(null)}
        />
      )}
      <GemDefs />
      <div className="blk-side blk-left">
        <div className="blk-box blk-stats">
          <div className="blk-label">{tr("Точки", "Score")}</div>
          <div className="blk-score">{fmt(score)}</div>
          {mode !== "moves" ? (
            <div className={`mx-clock ${phase === "playing" && timeLeft <= 10 ? "urgent" : ""}`}>
              ⏱ {(() => { const t = Math.ceil(mode === "duel" && phase !== "playing" ? DUEL_SECONDS : timeLeft); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; })()}
            </div>
          ) : (
            <div className={`mx-clock ${phase === "playing" && movesLeft <= 5 ? "urgent" : ""}`}>
              👆 {movesLeft} {tr("хода", "moves")}
            </div>
          )}
          {phase === "playing" && feverOf(streak) > 1 && (
            <div className={`mx-fever f${String(feverOf(streak)).replace(".", "")}`}>
              🔥 {tr("Огнен множител", "Fever")} ×{feverOf(streak)}
            </div>
          )}
          {phase === "playing" && (
            <div className="blk-stat-row">
              <span>{tr("Силни ходове подред", "Strong moves in a row")}</span>
              <b>{streak}</b>
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
          {mode === "duel" && myDuels && (
            <div className="blk-stat-row blk-best">
              <span>{tr("Победи в дуели", "Duel wins")}</span>
              <b>
                {myDuels.best} / {myDuels.games}
              </b>
            </div>
          )}
          {phase === "playing" && (
            <div className="mx-controls">
              {inDuel ? (
                <button onClick={forfeit} disabled={duelDone} title={tr("Предаваш се — противникът печели", "Give up — the opponent wins")}>
                  🏳️ {tr("Предай се", "Give up")}
                </button>
              ) : (
                <>
                  <button onClick={() => setPaused((p) => !p)} title="P">
                    {paused ? "▶" : "⏸"} {paused ? tr("Продължи", "Resume") : tr("Пауза", "Pause")}
                  </button>
                  <button onClick={restart} title={tr("Нова игра отначало (точките се губят)", "Start over (the score is dropped)")}>
                    🔄 {tr("Отначало", "Restart")}
                  </button>
                  <button onClick={finish} title={tr("Край — точките се записват", "End — the score is saved")}>
                    ⏹ {tr("Край", "End")}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        {mode === "duel" && oppPlayer && (phase === "playing" || duelResult) && (
          <OpponentCard opp={oppPlayer} score={opp.score} board={opp.board} myScore={score} combo={opp.combo} />
        )}
        {mode === "duel" ? (
          <div className="blk-box blk-keys mx-help">
            <AttackHelp />
          </div>
        ) : (
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
          <div>
            <b>2×2</b> {tr("квадрат → светулка", "square → firefly")} ✨
          </div>
          <div>{tr("Две специални заедно = мега взрив!", "Two specials together = mega blast!")}</div>
          <div>{tr("Силни ходове подред (каскада / специално) → 🔥 ×1.5 / ×2 / ×3", "Strong moves in a row → 🔥 ×1.5 / ×2 / ×3")}</div>
          <div>{tr("2 специални в един ход = ⚡ Двоен удар; 30+ камъчета = 💥 Мега ход; дълго комбо = ⏱ + секунди", "2 specials in a move = ⚡ Double strike; 30+ gems = 💥 Mega move; long combo = ⏱ + seconds")}</div>
          <div>
            <kbd>P</kbd> {tr("пауза", "pause")}
          </div>
        </div>
        )}
      </div>

      <div className="blk-center">
        <div
          ref={boardEl}
          className={`mx-board ${shake ? "shake" : ""} ${phase === "playing" && feverOf(streak) > 1 ? `fever f${String(feverOf(streak)).replace(".", "")}` : ""}`}
          style={customW ? { width: customW, minWidth: 0 } : undefined}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          {Object.entries(tiles).map(([id, v]) => (
            <TileView
              key={id}
              cls={`mx-tile ${v.pop ? "pop" : ""} ${v.fresh ? "fresh" : ""} ${hint.includes(Number(id)) ? "hint" : ""} ${selected && selected.r === v.r && selected.c === v.c ? "selected" : ""} ${v.r < 0 ? "above" : ""} ${v.swap ? "swapping" : ""}`}
              r={v.r}
              c={v.c}
              color={v.tile.color}
              special={v.tile.special}
              ice={v.tile.ice}
            />
          ))}
          <canvas ref={(el) => void (sparks.current.canvas = el)} className="mx-sparks" />
          {fx.map((f) =>
            f.kind === "fly" ? (
              <i
                key={f.id}
                className="mx-fly"
                style={{
                  ["--x0" as string]: `${(f.c / SIZE) * 100}%`,
                  ["--y0" as string]: `${(f.r / SIZE) * 100}%`,
                  ["--x1" as string]: `${((f.tc ?? 0) / SIZE) * 100}%`,
                  ["--y1" as string]: `${((f.tr ?? 0) / SIZE) * 100}%`,
                }}
              >
                <b />
              </i>
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
          {fogUntil > 0 && phase === "playing" && <div className="mx-fog" />}
          {incoming && phase === "playing" && (
            <div key={incoming.key} className="mx-incoming" style={{ ["--warn" as string]: `${DUEL_WARN_MS}ms` }}>
              ⚠️ {ATTACK_ICON[incoming.kind]} {attackName(incoming.kind)}
              {incoming.power > 1 ? ` ×${incoming.power}` : ""} — {tr("силен ход блокира!", "a strong move blocks it!")}
              <i />
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
              <div className="blk-paused">⏱ {tr("Времето свърши!", "Time is up!")}</div>
              <div className="blk-muted">{tr("Чакаме резултата…", "Waiting for the result…")}</div>
            </div>
          )}
          {combo && combo.n >= 2 && phase === "playing" && (
            <div key={combo.key} className={`mx-combo c${Math.min(7, combo.n)}`}>
              {comboName(combo.n)} ×{combo.n}
            </div>
          )}

          {phase !== "playing" && (
            <div className="blk-overlay">
              <div className="mx-title">🍬 Шмиксер</div>
              {mode === "duel" && duelResult && (
                <div className="blk-result">
                  <div className={`mx-duel-verdict ${duelResult.winnerId === me?.id ? "win" : duelResult.winnerId ? "lose" : ""}`}>
                    {duelResult.winnerId === me?.id ? `🏆 ${tr("Победа!", "Victory!")}` : duelResult.winnerId ? tr("Загуба", "Defeat") : tr("Равенство", "Draw")}
                  </div>
                  <div className="mx-duel-score">
                    {fmt(duelResult.you)} : {fmt(duelResult.them)}
                  </div>
                  {duelResult.reason === "forfeit" && <div>{duelResult.winnerId === me?.id ? tr("противникът се предаде", "the opponent gave up") : tr("предаде се", "you gave up")}</div>}
                  {duelResult.reason === "left" && <div>{duelResult.winnerId === me?.id ? tr("противникът излезе", "the opponent left") : tr("дуелът приключи, докато те нямаше", "the duel ended while you were away")}</div>}
                  {duelResult.games > 0 && (
                    <div>
                      {tr("Победи", "Wins")}: {duelResult.wins} / {duelResult.games}
                    </div>
                  )}
                </div>
              )}
              {mode !== "duel" && result && (
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
                  👆 {tr("60 хода", "60 moves")}
                </button>
                <button className={mode === "duel" ? "on" : ""} onClick={() => setMode("duel")}>
                  ⚔️ {tr("Дуел", "Duel")}
                </button>
              </div>
              {mode === "duel" ? (
                <>
                  {duelResult && oppPlayer && (
                    <button className="blk-start" onClick={() => seek(lobby?.waiting.some((p) => p.userId === oppPlayer.userId) ? oppPlayer.userId : undefined)}>
                      🔁 {tr("Реванш", "Rematch")}
                    </button>
                  )}
                  <DuelLobby lobby={lobby} meId={me?.id} onSeek={seek} onSpectate={setSpectating} onCancel={() => getSocket()?.emit(SocketEvents.MatchDuelCancel, { channelId })} />
                </>
              ) : (
                <>
                  <button className="blk-start" onClick={start}>
                    {result ? tr("Нова игра", "New game") : tr("Играй", "Play")}
                  </button>
                  <LiveDuels lobby={lobby} meId={me?.id} onSpectate={setSpectating} />
                </>
              )}
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
              <button className="blk-quit" onClick={restart}>
                🔄 {tr("Започни отначало", "Start over")}
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
              ⏱ 4 {tr("мин", "min")}
            </button>
            <button className={tab === "moves" ? "on" : ""} onClick={() => setTab("moves")}>
              👆 60 {tr("хода", "moves")}
            </button>
            <button className={tab === "duel" ? "on" : ""} onClick={() => setTab("duel")}>
              ⚔️ {tr("Дуели", "Duels")}
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
                  <b>{tab === "duel" ? `${r.best} 🏆` : fmt(r.best)}</b>
                </li>
              ))}
            </ol>
          )}
          {myRank < 0 && cur?.mine && (
            <div className="blk-muted">
              {tab === "duel" ? `${tr("Твоите победи", "Your wins")}: ${cur.mine.best} / ${cur.mine.games}` : `${tr("Твоят рекорд", "Your best")}: ${fmt(cur.mine.best)}`}
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
