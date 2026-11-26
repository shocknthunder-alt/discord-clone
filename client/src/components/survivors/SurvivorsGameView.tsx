import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SURV_ACHIEVEMENTS,
  SURV_SKINS,
  survOwnsSkin,
  type SurvSkinId,
  SURV_CURSES,
  SURV_HEROES,
  SURV_MAX_PLAYERS,
  SURV_META,
  SURV_MAPS,
  SURV_RUNES,
  survMapsOpen,
  survRuneCost,
  survRuneSlots,
  type SurvMapId,
  type SurvRuneId,
  SocketEvents,
  survGoldMul,
  survMetaCost,
  type SurvCurseId,
  type SurvHeroId,
  type SurvListsDTO,
  type SurvLobbyDTO,
  type SurvMemberDTO,
  type SurvMemberEventDTO,
  type SurvOverDTO,
  type SurvRelayDTO,
  type SurvRunDTO,
  type SurvRunResultDTO,
  type SurvStartDTO,
  SURV_GEAR_SLOTS,
  SURV_INV_MAX,
  SURV_DIFF_MAX,
  survDiffOpen,
  survGearStats,
  survItemBase,
  survItemFits,
  survSalvageGold,
  type SurvGearSlot,
  type SurvItem,
} from "@discord-clone/shared";
import { http } from "../../api/http";
import { getSocket } from "../../socket/socket";
import { useAuthStore } from "../../store/authStore";
import { survMusic } from "../blocks/music";
import { DIFF_NAMES, GEAR_STAT_TEXT, ITEM_TEXT, RARITY, SLOT_ICON, SLOT_TEXT, diffText } from "./content";
import { COMBOS, COMBO_IDS, TEMPERS, TIER_ROMAN, comboTier, combosOf, type TemperId } from "./content";
import { GIFTS, GODS, MAPS, RELICS, RUNE_TEXT, MISSION_ALTARS, isRelic, type GiftId } from "./content";
import { ACH_TEXT, BOSS_MOVE_DESC, BOSS_ORDER, BOSS_SPELLS, SKIN_TEXT, BOSS_WAVE_EVERY, CURSE_TEXT, ENEMIES, HEROES, HERO_IDS, META_TEXT, PASSIVES, WAVE_SECONDS, WEAPONS, WEAPON_IDS, fmtTime, weaponUpText, type EnemyId, type PassiveId, type WeaponId } from "./content";
import { FX, World, isBossWave, offerTitle, type Fx, type Input, type MissionView, type Offer, type RView } from "./engine";
import { SNAP_HZ, decodeSnapshot, encodeSnapshot, lerpView, type GuestInput, type GuestMsg, type HostMsg, type NetPlayer, type Snapshot } from "./net";
import { Renderer } from "./render";
import type { Renderer3D } from "./render3d";

/** does this browser do WebGL2 (the 3D layer is loaded only when it is used: three.js is big) */
function canWebGL2(): boolean {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}
import { survSound } from "./sounds";
import { enemyIcon, heroIcon, heroSprite, weaponIcon } from "./sprites";
import "./survivors.css";

/** 🧟 Шмиркленд — the screen of a "survivors" channel: menu (heroes, curses, shop, top lists, co-op
 *  lobby) and the game itself (solo, co-op host / guest, or 👁 watching someone's co-op game). */

type Mode = "solo" | "host" | "guest" | "spec";

interface Session {
  mode: Mode;
  partyId?: string;
  hostId?: string;
  members: SurvMemberDTO[];
  curses: SurvCurseId[];
  hero: SurvHeroId;
  /** 🗺️ the map, 🎯 mission or endless */
  map: SurvMapId;
  mission: boolean;
  /** ☠️ difficulty */
  diff: number;
  world?: World;
  prev: Snapshot | null;
  cur: Snapshot | null;
  curAt: number;
  interval: number;
  local: { x: number; y: number; face: number; moving: boolean; dirX: number; dirY: number; dashT: number; dashCd: number; init: boolean; lastDash: number };
  specIdx: number;
  sentRound: number;
  roundAt: number;
  fxBuf: Fx[];
  snapN: number;
  lastSnap: number;
  lastInput: number;
  lastProgress: number;
  ended: boolean;
  paused: boolean;
}

interface Hud {
  task: { text: string; progress: number; target: number; state: number } | null;
  theme: string;
  t: number;
  level: number;
  xp: number;
  xpNext: number;
  kills: number;
  gold: number;
  boss: { name: string; hp: number; max: number } | null;
  me: NetPlayer | null;
  team: { uid: string; name: string; hero: SurvHeroId; hp: number; maxHp: number; dead: boolean; gone: boolean }[];
  blessing: string | null;
  waiting: string[];
  choosing: boolean;
  wave: number;
  waveT: number;
  breakT: number;
  waveLeft: number;
  waveTotal: number;
  streak: number;
  mission: MissionView | null;
}

/** what the end screen shows besides the server's answer */
interface EndInfo {
  wave: number;
  dmg: [number, number][];
  /** 🎯 the mission: null = endless */
  mission: { won: boolean; map: SurvMapId } | null;
}

interface Offers {
  offers: Offer[];
  rerolls: number;
  level: number;
}

const BASE_SPEED = 165;
/** an unfinished solo game, kept (paused) when you leave the channel */
const savedGames = new Map<string, Session>();

const load = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};

const BLESS_TEXT: Record<string, string> = { might: "💪 Двойни щети", speed: "🪽 +40% бързина", gather: "🧲 Събиране", shield: "🛡️ Закрила" };

export function SurvivorsGameView({ channelId }: { channelId: string }) {
  const me = useAuthStore((s) => s.user);
  const myId = me?.id ?? "";
  const [phase, setPhase] = useState<"menu" | "playing" | "over">(() => (savedGames.has(channelId) ? "playing" : "menu"));
  const [tab, setTab] = useState<"play" | "shop" | "runes" | "gear" | "top" | "ach">("play");
  const [diffSel, setDiffSel] = useState<Partial<Record<SurvMapId, number>>>(() => load("survDiff", {}));
  useEffect(() => localStorage.setItem("survDiff", JSON.stringify(diffSel)), [diffSel]);
  const [gearHero, setGearHero] = useState<SurvHeroId | null>(null);
  const [gearAll, setGearAll] = useState(false);
  /** the slot picked on the hero (the bag then shows what fits there) */
  const [gearSlot, setGearSlot] = useState<SurvGearSlot | null>(null);
  const [mapSel, setMapSel] = useState<SurvMapId>(() => load<SurvMapId>("survMap", "polyana"));
  const [missionSel, setMissionSel] = useState<boolean>(() => load<boolean>("survMission", true));
  useEffect(() => localStorage.setItem("survMap", JSON.stringify(mapSel)), [mapSel]);
  useEffect(() => localStorage.setItem("survMission", JSON.stringify(missionSel)), [missionSel]);
  const [skinSel, setSkinSel] = useState<Partial<Record<SurvHeroId, SurvSkinId>>>(() => load("survSkins", {}));
  useEffect(() => localStorage.setItem("survSkins", JSON.stringify(skinSel)), [skinSel]);
  const [lists, setLists] = useState<SurvListsDTO | null>(null);
  const [hero, setHero] = useState<SurvHeroId>(() => load<SurvHeroId>("survHero", "peyo"));
  const [curses, setCurses] = useState<SurvCurseId[]>(() => load<SurvCurseId[]>("survCurses", []));
  const [lobby, setLobby] = useState<SurvLobbyDTO | null>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [offers, setOffers] = useState<Offers | null>(null);
  const [chest, setChest] = useState<string[] | null>(null);
  const [banner, setBanner] = useState<{ text: string; kind: number; key: number } | null>(null);
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState<(SurvRunResultDTO & { seconds: number; kills: number; level: number; reason?: string }) | null>(null);
  const [endInfo, setEndInfo] = useState<EndInfo | null>(null);
  const [mode, setMode] = useState<Mode>("solo");
  const [music, setMusic] = useState(() => localStorage.getItem("survMusic") !== "0");
  const [musicVol, setMusicVol] = useState(() => Number(localStorage.getItem("survMusicVol") ?? 0.4));
  const [sfx, setSfx] = useState(() => Number(localStorage.getItem("survSfx") ?? 0.8));
  const [numbers, setNumbers] = useState(() => localStorage.getItem("survNumbers") !== "0");
  /** how visible our own attacks are (0..1) */
  const [fxAlpha, setFxAlpha] = useState(() => {
    const v = Number(localStorage.getItem("survFxAlpha") ?? 1);
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
  });
  /** 🖱 moving with the mouse: off / while the left button is held / always towards the cursor */
  const [mouseMove, setMouseMove] = useState<"off" | "hold" | "follow">(() => {
    const v = localStorage.getItem("survMouseMove");
    return v === "hold" || v === "follow" ? v : "off";
  });
  /** 🧊 graphics: 3D models (WebGL) or the old 2D pictures */
  const [gfx, setGfx] = useState<"3d" | "2d">(() => {
    // 2D is the default (2026-11-27, new key so everyone starts there once); 3D is one tap away (🖼️ → 🧊)
    const v = localStorage.getItem("survGfx2");
    return v === "3d" && canWebGL2() ? "3d" : "2d";
  });
  const [topTab, setTopTab] = useState<"solo" | "coop">("solo");
  const [error, setError] = useState<string | null>(null);
  const [touch] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const canvas3dRef = useRef<HTMLCanvasElement | null>(null);
  const renderer3dRef = useRef<Renderer3D | null>(null);
  const sessRef = useRef<Session | null>(savedGames.get(channelId) ?? null);
  const inputRef = useRef({ keys: new Set<string>(), joy: { x: 0, y: 0, on: false, ox: 0, oy: 0, id: -1 }, mouse: { x: 0, y: 0, in: false, down: false }, dash: 0, skill: 0 });
  const offersRef = useRef<Offers | null>(null);
  offersRef.current = offers;
  const numbersRef = useRef(numbers);
  numbersRef.current = numbers;
  const fxAlphaRef = useRef(fxAlpha);
  fxAlphaRef.current = fxAlpha;
  const mouseMoveRef = useRef(mouseMove);
  mouseMoveRef.current = mouseMove;
  const musicRef = useRef(music);
  musicRef.current = music;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => localStorage.setItem("survHero", JSON.stringify(hero)), [hero]);
  useEffect(() => localStorage.setItem("survCurses", JSON.stringify(curses)), [curses]);
  useEffect(() => {
    localStorage.setItem("survMusic", music ? "1" : "0");
    localStorage.setItem("survMusicVol", String(musicVol));
    survMusic.setVolume(musicVol);
    if (!music) survMusic.pause();
  }, [music, musicVol]);
  useEffect(() => {
    localStorage.setItem("survSfx", String(sfx));
    survSound.setVolume(sfx);
  }, [sfx]);
  useEffect(() => localStorage.setItem("survNumbers", numbers ? "1" : "0"), [numbers]);
  useEffect(() => localStorage.setItem("survFxAlpha", String(fxAlpha)), [fxAlpha]);
  useEffect(() => localStorage.setItem("survMouseMove", mouseMove), [mouseMove]);
  useEffect(() => localStorage.setItem("survGfx2", gfx), [gfx]);

  const reload = useCallback(() => {
    http
      .get<SurvListsDTO>(`/api/text-channels/${channelId}/survivors`)
      .then((r) => setLists(r.data))
      .catch(() => {});
  }, [channelId]);
  useEffect(reload, [reload]);

  const profile = lists?.profile;
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const unlocked = useMemo(() => new Set(profile?.heroes ?? ["peyo", "tseko", "nikola"]), [profile]);
  useEffect(() => {
    if (lists && !unlocked.has(hero)) setHero("peyo");
  }, [lists, unlocked, hero]);

  const myParty = lobby?.parties.find((p) => p.players.some((m) => m.userId === myId));
  const owns = (h: SurvHeroId, sk: SurvSkinId) => !!profile && survOwnsSkin(profile, h, sk);
  /** 🗺️ maps this person may play (each opens with the mission before it won) */
  const openMaps = survMapsOpen(profile?.missions);
  const mapNow: SurvMapId = openMaps.includes(mapSel) ? mapSel : "polyana";
  const runeSlots = profile ? survRuneSlots(profile.stats, profile.missions) : 2;
  /** ☠️ the highest difficulty open on this map, the one picked (a guest follows the host's) */
  const diffOpen = survDiffOpen(profile?.diffs, mapNow);
  const diffNow = myParty && myParty.hostId !== myId ? (myParty.diff ?? 0) : Math.min(diffSel[mapNow] ?? 0, diffOpen);
  /** 🎒 what my hero wears, summed */
  const myGear = (h: SurvHeroId) => survGearStats(profile?.items, profile?.gear?.[h], h);
  /** the runes I wear, with their levels */
  const myRunes = (): Partial<Record<SurvRuneId, number>> => Object.fromEntries((profile?.equipped ?? []).map((r) => [r, profile?.runes?.[r] ?? 0]));
  const skinOf = (h: SurvHeroId): SurvSkinId => {
    const sk = skinSel[h] ?? "classic";
    return owns(h, sk) ? sk : "classic";
  };

  /* ───────── banners / overlays ───────── */

  const bannerTimer = useRef<number | null>(null);
  const showBanner = useCallback((text: string, kind: number) => {
    setBanner({ text, kind, key: Date.now() });
    if (bannerTimer.current) window.clearTimeout(bannerTimer.current);
    bannerTimer.current = window.setTimeout(() => setBanner(null), 3200);
  }, []);
  const chestTimer = useRef<number | null>(null);
  const showChest = useCallback((texts: string[]) => {
    setChest(texts);
    if (chestTimer.current) window.clearTimeout(chestTimer.current);
    chestTimer.current = window.setTimeout(() => setChest(null), 3600);
  }, []);

  /** sounds + overlays from effects (host / solo: the world's, guests: the snapshot's) */
  const handleFx = useCallback(
    (list: Fx[], view: RView) => {
      const meIdx = view.players.findIndex((p) => p.uid === myId);
      for (const f of list) {
        switch (f[0]) {
          case FX.die:
            survSound.kill();
            break;
          case FX.bolt:
            survSound.zap();
            break;
          case FX.boom:
            survSound.boom(f[4] === 2);
            break;
          case FX.banner:
            showBanner(String(f[1]), f[2] as number);
            if (f[2] === 1) survSound.boss();
            else survSound.event();
            break;
          case FX.hurt:
            if (f[1] === meIdx) survSound.hurt();
            break;
          case FX.level:
            survSound.level();
            break;
          case FX.chest:
            if (f[1] === meIdx) {
              showChest(f[2] as string[]);
              survSound.chest();
            }
            break;
          case FX.pick:
            if (f[1] === meIdx) {
              const k = f[2] as number;
              if (k <= 2) survSound.gem();
              else if (k === 3 || k === 8) survSound.coin();
              else if (k === 4) survSound.food();
            }
            break;
          case FX.skill:
            survSound.skill();
            break;
          case FX.dash:
            if (f[1] === meIdx) survSound.dash();
            break;
          case FX.down:
            survSound.down();
            break;
          case FX.revive:
            survSound.revive();
            break;
          case FX.fire:
            if (f[1] === meIdx) survSound.fire(WEAPON_IDS[f[2] as number] as WeaponId);
            break;
          case FX.evolve:
            survSound.evolve();
            break;
          case FX.bossDie:
            survSound.boom(true);
            break;
          case FX.wave:
            if (f[2] !== 1) survSound.wave();
            break;
          case FX.streak:
            survSound.streak();
            break;
          case FX.task:
            showBanner(String(f[2]), f[1] === 1 ? 2 : 0);
            if (f[1] === 1) survSound.chest();
            break;
        }
      }
      rendererRef.current?.pushFx(list, view, myId, numbersRef.current);
      renderer3dRef.current?.pushFx(list, view);
    },
    [myId, showBanner, showChest],
  );

  /* ───────── starting / ending ───────── */

  const newSession = (m: Mode, extra: Partial<Session>): Session => ({
    mode: m,
    members: [],
    curses: [],
    hero,
    map: "polyana",
    mission: false,
    diff: 0,
    prev: null,
    cur: null,
    curAt: 0,
    interval: 1000 / SNAP_HZ,
    local: { x: 0, y: 0, face: 1, moving: false, dirX: 1, dirY: 0, dashT: 0, dashCd: 0, init: false, lastDash: -1 },
    specIdx: 0,
    sentRound: 0,
    roundAt: 0,
    fxBuf: [],
    snapN: 0,
    lastSnap: 0,
    lastInput: 0,
    lastProgress: 0,
    ended: false,
    paused: false,
    ...extra,
  });

  const resetUi = () => {
    setOffers(null);
    setChest(null);
    setBanner(null);
    setPaused(false);
    setResult(null);
    setEndInfo(null);
    setHud(null);
    setError(null);
    inputRef.current.keys.clear();
    (document.activeElement as HTMLElement | null)?.blur?.();
  };

  const startSolo = () => {
    resetUi();
    survMusic.stop();
    savedGames.delete(channelId);
    const world = new World([{ uid: myId, name: me?.username ?? "Аз", hero, skin: skinOf(hero), meta: profile?.upgrades ?? {}, runes: myRunes(), gear: myGear(hero), remote: false }], curses, { map: mapNow, mission: missionSel, diff: diffNow });
    sessRef.current = newSession("solo", { world, curses, hero, map: mapNow, mission: missionSel, diff: diffNow });
    setMode("solo");
    setPhase("playing");
  };

  const postRun = useCallback(
    (s: Session, snap: { t: number; kills: number; level: number; gold: number; bosses: number; wave: number; streak: number; evolutions: number; tasks: number; bossTypes: string[]; won: boolean; loot: number[] }, reason?: string) => {
      if (s.mode === "spec") {
        setResult({ ...(lists as SurvListsDTO), record: false, goldEarned: 0, newHeroes: [], seconds: Math.floor(snap.t), kills: snap.kills, level: snap.level, reason });
        return;
      }
      const run: SurvRunDTO = {
        seconds: Math.floor(snap.t),
        kills: snap.kills,
        level: snap.level,
        gold: snap.gold,
        bosses: snap.bosses,
        coop: s.mode !== "solo",
        hero: s.hero,
        curses: s.curses,
        wave: snap.wave,
        streak: snap.streak,
        evolutions: snap.evolutions,
        tasks: snap.tasks,
        bossTypes: snap.bossTypes,
        map: s.map,
        mission: s.mission,
        won: s.mission && snap.won,
        diff: s.diff,
        loot: snap.loot,
      };
      setResult({ ...(lists as SurvListsDTO), record: false, goldEarned: 0, newHeroes: [], seconds: run.seconds, kills: run.kills, level: run.level, reason });
      if (run.seconds < 5) return;
      http
        .post<SurvRunResultDTO>(`/api/text-channels/${channelId}/survivors/run`, run)
        .then((r) => {
          setLists(r.data);
          setResult({ ...r.data, seconds: run.seconds, kills: run.kills, level: run.level, reason });
        })
        .catch(() => setError("Резултатът не се записа."));
    },
    [channelId, lists],
  );

  const finish = useCallback(
    (reason?: string) => {
      const s = sessRef.current;
      if (!s || s.ended) return;
      s.ended = true;
      savedGames.delete(channelId);
      survMusic.stop();
      setOffers(null);
      const dmgOf = (d: Record<number, number> | undefined): [number, number][] =>
        Object.entries(d ?? {})
          .map(([k, v]) => [Number(k), v] as [number, number])
          .filter(([, v]) => v > 0)
          .sort((a, b) => b[1] - a[1]);
      if (s.world) {
        const w = s.world;
        if (s.mode === "host" && s.partyId) getSocket()?.emit(SocketEvents.SurvEnd, { partyId: s.partyId, seconds: Math.floor(w.t), kills: w.kills, reason: reason === "stopped" ? "stopped" : undefined });
        setEndInfo({ wave: w.wave, dmg: dmgOf(w.players.find((p) => p.uid === myId)?.dmgBy), mission: s.mission ? { won: w.won, map: s.map } : null });
        postRun(
          s,
          {
            t: w.t,
            kills: w.kills,
            level: w.level,
            gold: w.gold,
            bosses: w.bosses,
            wave: w.wave,
            streak: Math.max(w.bestStreak, w.streak),
            evolutions: w.players.find((p) => p.uid === myId)?.evos ?? 0,
            tasks: w.tasksDone,
            bossTypes: [...w.bossTypes],
            won: w.won,
            loot: w.players.find((p) => p.uid === myId)?.loot ?? [],
          },
          reason,
        );
      } else if (s.cur) {
        setEndInfo({ wave: s.cur.wave, dmg: dmgOf(s.cur.view.players.find((p) => p.uid === myId)?.dmgBy), mission: s.mission ? { won: s.cur.won, map: s.map } : null });
        const c = s.cur;
        postRun(
          s,
          {
            t: c.view.t,
            kills: c.kills,
            level: c.level,
            gold: c.gold,
            bosses: c.bosses,
            wave: c.wave,
            streak: c.bestStreak,
            evolutions: c.view.players.find((p) => p.uid === myId)?.evos ?? 0,
            tasks: c.tasksDone,
            bossTypes: c.bossTypes,
            won: c.won,
            loot: c.view.players.find((p) => p.uid === myId)?.loot ?? [],
          },
          reason,
        );
      } else {
        setResult({ ...(lists as SurvListsDTO), record: false, goldEarned: 0, newHeroes: [], seconds: 0, kills: 0, level: 1, reason });
      }
      setPhase("over");
    },
    [channelId, postRun, lists],
  );

  const quit = () => {
    const s = sessRef.current;
    if (!s) return setPhase("menu");
    if (s.mode === "spec") {
      if (s.partyId) getSocket()?.emit(SocketEvents.SurvSpectateStop, { partyId: s.partyId });
      s.ended = true;
      sessRef.current = null;
      survMusic.stop();
      setPhase("menu");
      return;
    }
    if (s.mode === "guest" && s.partyId) getSocket()?.emit(SocketEvents.SurvLeave, { partyId: s.partyId });
    finish("stopped");
  };

  /* ───────── co-op over the socket ───────── */

  const finishRef = useRef(finish);
  finishRef.current = finish;
  const handleFxRef = useRef(handleFx);
  handleFxRef.current = handleFx;

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const watch = () => socket.emit(SocketEvents.SurvWatch, { channelId });
    const onLobby = (l: SurvLobbyDTO) => {
      if (l.channelId === channelId) setLobby(l);
    };
    const onStarted = (st: SurvStartDTO) => {
      if (st.channelId !== channelId) return;
      const cur = sessRef.current;
      if (st.resume && cur && !cur.ended && cur.partyId === st.partyId) return; // reconnected, same game
      if (st.spectator) {
        resetUi();
        sessRef.current = newSession("spec", { partyId: st.partyId, hostId: st.hostId, members: st.players, curses: st.curses, map: st.map ?? "polyana", mission: !!st.mission, diff: st.diff ?? 0 });
        setMode("spec");
        setPhase("playing");
        return;
      }
      const meM = st.players.find((p) => p.userId === myId);
      if (!meM) return;
      if (st.hostId === myId) {
        if (st.resume) {
          // the host's browser reloaded: the game was in it, so it's gone
          socket.emit(SocketEvents.SurvEnd, { partyId: st.partyId, seconds: 0, kills: 0, reason: "stopped" });
          return;
        }
        resetUi();
        survMusic.stop();
        const metaOf = (uid: string) => (uid === myId ? (profileRef.current?.upgrades ?? {}) : (st.players.find((p) => p.userId === uid)?.meta ?? {}));
        const world = new World(
          st.players.map((p) => ({ uid: p.userId, name: p.username, hero: p.hero, skin: p.skin ?? "classic", meta: metaOf(p.userId), runes: p.runes ?? {}, gear: p.gear ?? {}, remote: p.userId !== myId })),
          st.curses,
          { map: st.map ?? "polyana", mission: !!st.mission, diff: st.diff ?? 0 },
        );
        sessRef.current = newSession("host", { world, partyId: st.partyId, hostId: st.hostId, members: st.players, curses: st.curses, hero: meM.hero, map: st.map ?? "polyana", mission: !!st.mission, diff: st.diff ?? 0 });
        setMode("host");
      } else {
        resetUi();
        survMusic.stop();
        sessRef.current = newSession("guest", { partyId: st.partyId, hostId: st.hostId, members: st.players, curses: st.curses, hero: meM.hero, map: st.map ?? "polyana", mission: !!st.mission, diff: st.diff ?? 0 });
        setMode("guest");
      }
      setPhase("playing");
    };
    const onState = (m: SurvRelayDTO) => {
      const s = sessRef.current;
      if (!s || s.ended || (s.mode !== "guest" && s.mode !== "spec") || m.partyId !== s.partyId) return;
      const snap = decodeSnapshot(m.d, s.cur?.view.gems ?? []);
      if (!snap) return;
      const now = performance.now();
      if (s.cur) s.interval = s.interval * 0.8 + Math.min(400, now - s.curAt) * 0.2;
      s.prev = s.cur;
      s.cur = snap;
      s.curAt = now;
      handleFxRef.current(snap.fx, snap.view);
      if (s.mode === "guest") {
        const mine = snap.view.players.find((p) => p.uid === myId);
        if (mine && (!s.local.init || mine.dead || Math.hypot(mine.x - s.local.x, mine.y - s.local.y) > 400)) {
          s.local.x = mine.x;
          s.local.y = mine.y;
          s.local.init = true;
        }
        // the cards are gone when the host says nobody waits for me any more
        if (!snap.choosing || !snap.waiting.includes(myId)) {
          if (offersRef.current) setOffers(null);
        }
      }
      if (snap.over) finishRef.current();
    };
    const onInput = (m: SurvRelayDTO) => {
      const s = sessRef.current;
      if (!s || s.mode !== "host" || !s.world || m.partyId !== s.partyId || !m.from) return;
      const d = m.d as GuestInput;
      if (!d || typeof d.x !== "number") return;
      s.world.setRemote(m.from, d.x, d.y, d.f, !!d.m, d.dx, d.dy, d.dash === 1, d.sk);
    };
    const onMsg = (m: SurvRelayDTO) => {
      const s = sessRef.current;
      if (!s || s.ended || m.partyId !== s.partyId) return;
      if (s.mode === "host" && s.world && m.from) {
        const d = m.d as GuestMsg;
        if (d?.k === "pick") s.world.pick(m.from, typeof d.i === "number" ? d.i : -1);
        if (d?.k === "reroll") {
          const o = s.world.reroll(m.from);
          const p = s.world.players.find((q) => q.uid === m.from);
          if (o && p) socket.emit(SocketEvents.SurvMsg, { partyId: s.partyId, to: m.from, d: { k: "offer", offers: o, level: s.world.level, rerolls: p.rerolls } satisfies HostMsg });
        }
      } else if (s.mode === "guest") {
        const d = m.d as HostMsg;
        if (d?.k === "offer") setOffers({ offers: d.offers, rerolls: d.rerolls, level: d.level });
      }
    };
    const onMember = (e: SurvMemberEventDTO) => {
      const s = sessRef.current;
      if (!s?.world || s.mode !== "host" || e.partyId !== s.partyId) return;
      s.world.setGone(e.userId, e.kind === "left");
      const who = s.members.find((x) => x.userId === e.userId)?.username ?? "";
      showBanner(e.kind === "left" ? `🚪 ${who} излезе` : `👋 ${who} се върна`, 0);
      if (e.kind === "back") s.sentRound = 0; // deal their cards again if a level-up is open
    };
    const onOver = (o: SurvOverDTO) => {
      const s = sessRef.current;
      if (!s || s.ended || o.partyId !== s.partyId) return;
      if (s.mode === "host") return;
      finishRef.current(o.reason === "host-left" ? "host-left" : o.reason);
    };
    socket.on(SocketEvents.SurvLobby, onLobby);
    socket.on(SocketEvents.SurvStarted, onStarted);
    socket.on(SocketEvents.SurvState, onState);
    socket.on(SocketEvents.SurvInput, onInput);
    socket.on(SocketEvents.SurvMsg, onMsg);
    socket.on(SocketEvents.SurvMember, onMember);
    socket.on(SocketEvents.SurvOver, onOver);
    socket.on("connect", watch);
    watch();
    return () => {
      // leaving the channel: a solo game is kept paused; a co-op game is left (before unwatching,
      // or the server would ignore it)
      const s = sessRef.current;
      survMusic.stop();
      if (s && !s.ended) {
        if (s.mode === "solo" && s.world && !s.world.over) {
          s.paused = true;
          savedGames.set(channelId, s);
        } else if (s.mode === "guest" && s.partyId) socket.emit(SocketEvents.SurvLeave, { partyId: s.partyId });
        else if (s.mode === "host" && s.partyId && s.world) socket.emit(SocketEvents.SurvEnd, { partyId: s.partyId, seconds: Math.floor(s.world.t), kills: s.world.kills, reason: "stopped" });
        else if (s.mode === "spec" && s.partyId) socket.emit(SocketEvents.SurvSpectateStop, { partyId: s.partyId });
      }
      socket.emit(SocketEvents.SurvUnwatch, { channelId });
      socket.off(SocketEvents.SurvLobby, onLobby);
      socket.off(SocketEvents.SurvStarted, onStarted);
      socket.off(SocketEvents.SurvState, onState);
      socket.off(SocketEvents.SurvInput, onInput);
      socket.off(SocketEvents.SurvMsg, onMsg);
      socket.off(SocketEvents.SurvMember, onMember);
      socket.off(SocketEvents.SurvOver, onOver);
      socket.off("connect", watch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, myId]);

  /* ───────── input ───────── */

  useEffect(() => {
    if (phase !== "playing") return;
    const typing = (t: EventTarget | null) =>
      t instanceof HTMLElement && !(t instanceof HTMLInputElement && t.type === "range") && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const MOVE = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
    const down = (e: KeyboardEvent) => {
      if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const inp = inputRef.current;
      const s = sessRef.current;
      let used = true;
      if (MOVE.has(e.code)) inp.keys.add(e.code);
      else if (e.code === "Space" || e.code === "ShiftLeft" || e.code === "ShiftRight") {
        if (!e.repeat) inp.dash++;
      } else if (e.code === "KeyQ" || e.code === "KeyE") {
        if (!e.repeat) inp.skill++;
      } else if (e.code === "KeyP" || e.code === "Escape") {
        if (!e.repeat && s?.mode === "solo") setPaused((p) => !p);
      } else if (offersRef.current && /^Digit[1-4]$/.test(e.code)) {
        pickRef.current(Number(e.code.slice(5)) - 1);
      } else if (s?.mode === "spec" && e.code === "Tab") {
        s.specIdx++;
      } else used = false;
      if (used) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const up = (e: KeyboardEvent) => inputRef.current.keys.delete(e.code);
    const blur = () => {
      inputRef.current.keys.clear();
      if (sessRef.current?.mode === "solo") setPaused(true);
    };
    const vis = () => document.hidden && blur();
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [phase]);

  const readMove = (): [number, number] => {
    const inp = inputRef.current;
    if (inp.joy.on) return [inp.joy.x, inp.joy.y];
    const k = inp.keys;
    const mm = mouseMoveRef.current;
    const anyKey = k.size > 0;
    if (!anyKey && mm !== "off" && inp.mouse.in && (mm === "follow" || inp.mouse.down)) {
      // towards the cursor; the hero is in the middle of the canvas
      const cv = canvasRef.current;
      if (cv) {
        const dx = inp.mouse.x - cv.clientWidth / 2;
        const dy = inp.mouse.y - (cv.clientHeight / 2 - 14);
        const l = Math.hypot(dx, dy);
        if (l < 14) return [0, 0];
        const f = Math.min(1, (l - 10) / 50);
        return [(dx / l) * f, (dy / l) * f];
      }
    }
    const x = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    const y = (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0) - (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0);
    const l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  };

  // touch: a joystick wherever the left side is touched
  const mouseAt = (e: React.PointerEvent) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    const m = inputRef.current.mouse;
    m.x = e.clientX - r.left;
    m.y = e.clientY - r.top;
    m.in = true;
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") {
      mouseAt(e);
      if (mouseMoveRef.current === "off") return;
      if (e.button === 0) inputRef.current.mouse.down = true;
      else if (e.button === 2) inputRef.current.dash++;
      return;
    }
    const r = wrapRef.current!.getBoundingClientRect();
    const j = inputRef.current.joy;
    if (j.on) return;
    j.on = true;
    j.id = e.pointerId;
    j.ox = e.clientX - r.left;
    j.oy = e.clientY - r.top;
    j.x = 0;
    j.y = 0;
    setJoyView({ x: j.ox, y: j.oy, dx: 0, dy: 0 });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") {
      mouseAt(e);
      return;
    }
    const j = inputRef.current.joy;
    if (!j.on || e.pointerId !== j.id) return;
    const r = wrapRef.current!.getBoundingClientRect();
    const dx = e.clientX - r.left - j.ox;
    const dy = e.clientY - r.top - j.oy;
    const l = Math.hypot(dx, dy);
    const k = Math.min(1, l / 50);
    j.x = l ? (dx / l) * k : 0;
    j.y = l ? (dy / l) * k : 0;
    setJoyView({ x: j.ox, y: j.oy, dx: j.x * 40, dy: j.y * 40 });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") {
      if (e.button === 0) inputRef.current.mouse.down = false;
      return;
    }
    const j = inputRef.current.joy;
    if (e.pointerId !== j.id) return;
    j.on = false;
    j.x = 0;
    j.y = 0;
    setJoyView(null);
  };
  const [joyView, setJoyView] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);

  /* ───────── level-up cards ───────── */

  const pick = (i: number) => {
    const s = sessRef.current;
    const o = offersRef.current;
    if (!s || !o) return;
    // -1 = skip (+3 gold); any other index must be one of the cards (keys 1–4 past the end do nothing)
    if (i !== -1 && (i < 0 || i >= o.offers.length)) return;
    setOffers(null);
    if (s.world) s.world.pick(myId, i);
    else if (s.partyId) getSocket()?.emit(SocketEvents.SurvMsg, { partyId: s.partyId, d: { k: "pick", i } satisfies GuestMsg });
  };
  const pickRef = useRef(pick);
  pickRef.current = pick;
  const reroll = () => {
    const s = sessRef.current;
    if (!s) return;
    if (s.world) {
      const o = s.world.reroll(myId);
      const p = s.world.players.find((q) => q.uid === myId);
      if (o && p) setOffers({ offers: o, rerolls: p.rerolls, level: s.world.level });
    } else if (s.partyId) getSocket()?.emit(SocketEvents.SurvMsg, { partyId: s.partyId, d: { k: "reroll" } satisfies GuestMsg });
  };

  /* ───────── the loop ───────── */

  useEffect(() => {
    if (phase !== "playing") return;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const r = new Renderer(canvas);
    rendererRef.current = r;
    const c3 = canvas3dRef.current;
    let r3: Renderer3D | null = null;
    let gone = false;
    if (gfx === "3d" && c3) {
      import("./render3d")
        .then((m) => {
          if (gone) return;
          r3 = new m.Renderer3D(c3);
          r3.resize(wrap.clientWidth, wrap.clientHeight);
          renderer3dRef.current = r3;
          if (import.meta.env.DEV) (window as unknown as { __surv3d?: unknown }).__surv3d = r3;
        })
        .catch(() => {});
    }
    const fit = () => {
      r.resize(wrap.clientWidth, wrap.clientHeight);
      r3?.resize(wrap.clientWidth, wrap.clientHeight);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);

    const s0 = sessRef.current;
    if (s0?.paused) {
      s0.paused = false;
      setPaused(true);
    }

    let raf = 0;
    let last = performance.now();
    let lastHud = 0;
    const inputs = new Map<string, Input>();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = sessRef.current;
      if (!s || s.ended) return;
      const [mx, my] = readMove();
      const inp = inputRef.current;
      let view: RView | null = null;
      let camX = 0;
      let camY = 0;
      let hudSrc: Omit<Hud, "me" | "team"> & { players: NetPlayer[] } | null = null;

      if (s.world) {
        const w = s.world;
        const stop = s.mode === "solo" && (pausedRef.current || !!offersRef.current);
        if (!stop) {
          inputs.set(myId, { mx, my, dash: inp.dash, skill: inp.skill });
          w.step(dt, inputs);
        }
        // deal level-up cards
        if (w.choosing && s.sentRound !== w.round) {
          s.sentRound = w.round;
          s.roundAt = now;
          const mineOffers = w.offers.get(myId);
          const p = w.players.find((q) => q.uid === myId);
          if (mineOffers && p && !w.picked.has(myId)) setOffers({ offers: mineOffers, rerolls: p.rerolls, level: w.level });
          if (s.mode === "host") {
            for (const q of w.players) {
              if (!q.remote || q.gone || w.picked.has(q.uid)) continue;
              getSocket()?.emit(SocketEvents.SurvMsg, { partyId: s.partyId, to: q.uid, d: { k: "offer", offers: w.offers.get(q.uid) ?? [], level: w.level, rerolls: q.rerolls } satisfies HostMsg });
            }
          }
        }
        // co-op: nobody waits forever for a slow picker
        if (w.choosing && s.mode === "host" && now - s.roundAt > 15000) {
          for (const q of w.players) if (!w.picked.has(q.uid)) w.pick(q.uid, 0);
          if (offersRef.current) setOffers(null);
        }
        const fx = w.drainFx();
        handleFxRef.current(fx, w);
        if (s.mode === "host") {
          s.fxBuf.push(...fx);
          if (now - s.lastSnap >= 1000 / SNAP_HZ) {
            s.lastSnap = now;
            s.snapN++;
            const d = encodeSnapshot(w, s.fxBuf, s.snapN % 3 === 1);
            s.fxBuf = [];
            getSocket()?.emit(SocketEvents.SurvState, { partyId: s.partyId, d });
          }
          if (now - s.lastProgress > 5000) {
            s.lastProgress = now;
            getSocket()?.emit(SocketEvents.SurvProgress, { partyId: s.partyId, seconds: Math.floor(w.t), kills: w.kills });
          }
        }
        view = w;
        const mine = w.players.find((p) => p.uid === myId) ?? w.players[0]!;
        camX = mine.x;
        camY = mine.y;
        hudSrc = {
          t: w.t,
          level: w.level,
          xp: w.xp,
          xpNext: w.xpNext,
          kills: w.kills,
          gold: w.gold,
          boss: w.boss && !w.boss.dead ? { name: ENEMIES[w.boss.type].name, hp: w.boss.hp, max: w.boss.maxHp } : null,
          blessing: w.blessing?.id ?? null,
          waiting: w.choosing ? w.players.filter((p) => !p.gone && !w.picked.has(p.uid)).map((p) => p.name) : [],
          choosing: w.choosing,
          wave: w.wave,
          waveT: w.waveT,
          breakT: w.breakT,
          waveLeft: w.waveLeft,
          waveTotal: w.waveTotal,
          streak: w.streak,
          task: w.task ? { text: w.task.text, progress: Math.floor(w.task.progress), target: w.task.target, state: w.task.state } : null,
          theme: w.theme,
          mission: w.missionView,
          players: w.players.map((p) => ({ ...p, speed: p.st.speed, skillMax: HEROES[p.hero].skill.cd, weapons: p.weapons })) as unknown as NetPlayer[],
        };
        if (w.over && !s.ended) finishRef.current();
      } else if (s.cur) {
        const k = (now - s.curAt) / Math.max(30, s.interval);
        view = lerpView(s.prev, s.cur, k);
        if (s.mode === "guest") {
          const mine = s.cur.view.players.find((p) => p.uid === myId);
          const L = s.local;
          if (mine && !mine.dead && L.init) {
            L.dashCd = Math.max(0, L.dashCd - dt);
            if (L.lastDash < 0) L.lastDash = inp.dash;
            if (inp.dash > L.lastDash) {
              L.lastDash = inp.dash;
              if (L.dashCd <= 0) {
                L.dashT = 0.18;
                L.dashCd = 2.2;
                survSound.dash();
              }
            }
            const moving = Math.hypot(mx, my) > 0.05;
            L.moving = moving;
            if (moving) {
              L.dirX = mx;
              L.dirY = my;
              if (Math.abs(mx) > 0.1) L.face = mx < 0 ? -1 : 1;
            }
            if (L.dashT > 0) {
              L.dashT -= dt;
              L.x += L.dirX * 900 * dt;
              L.y += L.dirY * 900 * dt;
            } else {
              const sp = BASE_SPEED * (mine.speed || 1);
              L.x += mx * sp * dt;
              L.y += my * sp * dt;
            }
          }
          if (now - s.lastInput > 50 && s.partyId) {
            s.lastInput = now;
            const gi: GuestInput = { x: Math.round(L.x * 10) / 10, y: Math.round(L.y * 10) / 10, f: L.face, m: L.moving ? 1 : 0, dx: Math.round(L.dirX * 100) / 100, dy: Math.round(L.dirY * 100) / 100, dash: L.dashT > 0 ? 1 : 0, sk: inp.skill };
            getSocket()?.emit(SocketEvents.SurvInput, { partyId: s.partyId, d: gi });
          }
          view = { ...view, players: view.players.map((p) => (p.uid === myId && !p.dead ? { ...p, x: L.x, y: L.y, face: L.face, moving: L.moving, dashT: L.dashT } : p)) };
          camX = L.x;
          camY = L.y;
        } else {
          const alive = view.players.filter((p) => !(p as { gone?: boolean }).gone);
          const p = alive[s.specIdx % Math.max(1, alive.length)];
          camX = p?.x ?? 0;
          camY = p?.y ?? 0;
        }
        const c = s.cur;
        hudSrc = {
          t: c.view.t,
          level: c.level,
          xp: c.xp,
          xpNext: c.xpNext,
          kills: c.kills,
          gold: c.gold,
          boss: c.boss ? { name: ENEMIES[c.boss.type as EnemyId]?.name ?? "", hp: c.boss.hp, max: c.boss.max } : null,
          blessing: c.blessing,
          waiting: c.waiting.map((u) => c.view.players.find((p) => p.uid === u)?.name ?? ""),
          choosing: c.choosing,
          wave: c.wave,
          waveT: c.waveT,
          breakT: c.breakT,
          waveLeft: c.waveLeft,
          waveTotal: c.waveTotal,
          streak: c.streak,
          task: c.task,
          theme: c.theme,
          mission: c.mission,
          players: c.view.players,
        };
      }

      if (view) {
        const g3 = r3 as Renderer3D | null;
        const three = !!g3 && g3.ready && !g3.failed;
        const night = s.curses.includes("night");
        const me = s.mode === "spec" ? null : myId;
        r.draw(view, { me, night, numbers: numbersRef.current, fxAlpha: fxAlphaRef.current, camX, camY, three, map: s.map }, dt);
        if (three) g3!.render(view, { me, camX: camX + r.shakeX, camY: camY + r.shakeY, zoom: r.zNow, night, map: s.map }, dt);
      }

      // music follows the boss
      if (musicRef.current && !pausedRef.current) survMusic.play(!!hudSrc?.boss);
      else survMusic.pause();

      if (hudSrc && now - lastHud > 100) {
        lastHud = now;
        const players = hudSrc.players;
        const mine = players.find((p) => p.uid === myId) ?? null;
        setHud({
          ...hudSrc,
          me: mine ? { ...mine, skillMax: HEROES[mine.hero].skill.cd } : null,
          team: players.map((p) => ({ uid: p.uid, name: p.name, hero: p.hero, hp: p.hp, maxHp: p.maxHp, dead: p.dead, gone: !!(p as { gone?: boolean }).gone })),
        });
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      survMusic.pause();
      gone = true;
      r3?.dispose();
      if (renderer3dRef.current === r3) renderer3dRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, myId, gfx]);

  // dev-only hooks for the e2e tests
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as Record<string, unknown>;
    w.__surv = () => {
      const s = sessRef.current;
      const world = s?.world;
      const v = world ?? s?.cur?.view;
      return {
        mode: s?.mode ?? null,
        t: v?.t ?? 0,
        enemies: v?.enemies.length ?? 0,
        level: world?.level ?? s?.cur?.level ?? 0,
        choosing: world?.choosing ?? s?.cur?.choosing ?? false,
        players: (v?.players ?? []).map((p) => ({ uid: p.uid, x: p.x, y: p.y, dead: p.dead })),
        local: s?.local ?? null,
      };
    };
    w.__survWorld = () => sessRef.current?.world ?? null;
    w.__survHeroSprite = heroSprite;
    w.__survXp = (n: number) => {
      const world = sessRef.current?.world;
      if (world) world.xp += n;
    };
  }, []);

  /* ───────── menu actions ───────── */

  const toggleCurse = (id: SurvCurseId) => {
    const next = curses.includes(id) ? curses.filter((c) => c !== id) : [...curses, id];
    setCurses(next);
    if (myParty && myParty.hostId === myId && myParty.state === "lobby") getSocket()?.emit(SocketEvents.SurvSetup, { partyId: myParty.id, curses: next });
  };
  const chooseHero = (id: SurvHeroId) => {
    if (!unlocked.has(id)) return;
    setHero(id);
    if (myParty && myParty.state === "lobby") getSocket()?.emit(SocketEvents.SurvSetup, { partyId: myParty.id, hero: id, skin: skinOf(id) });
  };
  const buy = (key: string) =>
    http
      .post<SurvListsDTO>(`/api/text-channels/${channelId}/survivors/buy`, { key })
      .then((r) => setLists(r.data))
      .catch(() => setError("Не стига златото."));
  const refund = () => {
    if (!window.confirm("Да върна ли всички подобрения срещу златото им?")) return;
    http
      .post<SurvListsDTO>(`/api/text-channels/${channelId}/survivors/refund`, {})
      .then((r) => setLists(r.data))
      .catch(() => {});
  };
  const buyHero = (id: SurvHeroId) =>
    http
      .post<SurvListsDTO>(`/api/text-channels/${channelId}/survivors/hero`, { hero: id })
      .then((r) => setLists(r.data))
      .catch(() => setError("Не стига златото."));

  const createParty = () => getSocket()?.emit(SocketEvents.SurvCreate, { channelId, hero, curses, meta: profile?.upgrades ?? {}, skin: skinOf(hero), map: mapNow, mission: missionSel, diff: diffNow });
  const chooseMap = (m: SurvMapId, mission: boolean) => {
    setMapSel(m);
    setMissionSel(mission);
    if (myParty && myParty.hostId === myId && myParty.state === "lobby") getSocket()?.emit(SocketEvents.SurvSetup, { partyId: myParty.id, map: m, mission, diff: Math.min(diffSel[m] ?? 0, survDiffOpen(profile?.diffs, m)) });
  };
  const chooseDiff = (d: number) => {
    setDiffSel((m) => ({ ...m, [mapNow]: d }));
    if (myParty && myParty.hostId === myId && myParty.state === "lobby") getSocket()?.emit(SocketEvents.SurvSetup, { partyId: myParty.id, diff: d });
  };
  const equip = (h: SurvHeroId, slot: SurvGearSlot, item: string | null) =>
    http
      .post<SurvListsDTO>(`/api/text-channels/${channelId}/survivors/equip`, { hero: h, slot, item })
      .then((r) => setLists(r.data))
      .catch(() => setError("Не става."));
  const salvage = (it: SurvItem) => {
    if (it.r >= 2 && !window.confirm(`Да разглобя ${ITEM_TEXT[it.b]?.name ?? "предмета"} (${RARITY[it.r]!.name}) за ${survSalvageGold(it)} злато?`)) return;
    http
      .post<SurvListsDTO>(`/api/text-channels/${channelId}/survivors/salvage`, { items: [it.id] })
      .then((r) => setLists(r.data))
      .catch(() => setError("Не става."));
  };
  const itemView = (it: SurvItem, extra?: React.ReactNode) => {
    const b = survItemBase(it.b);
    const t = ITEM_TEXT[it.b] ?? { name: it.b, icon: "❔" };
    return (
      <div key={it.id} className={`sv-item r${it.r}`} style={{ ["--rc" as string]: RARITY[it.r]!.color }}>
        <span className="sv-item-icon">{t.icon}</span>
        <div className="sv-item-body">
          <b>{t.name}</b>
          <small>
            {RARITY[it.r]!.name} · {SLOT_TEXT[b?.slot ?? "armor"]}
            {b?.hero ? ` · само за ${HEROES[b.hero].name}` : ""}
            {it.d ? ` · ☠️${it.d}` : ""}
          </small>
          <ul>
            {it.s.map(([k, v], i) => (
              <li key={i}>{GEAR_STAT_TEXT[k]?.(v) ?? k}</li>
            ))}
          </ul>
        </div>
        {extra}
      </div>
    );
  };
  const buyRune = (id: SurvRuneId) =>
    http
      .post<SurvListsDTO>(`/api/text-channels/${channelId}/survivors/rune`, { rune: id })
      .then((r) => setLists(r.data))
      .catch(() => setError("Не стига златото."));
  const wearRunes = (equipped: SurvRuneId[]) =>
    http
      .post<SurvListsDTO>(`/api/text-channels/${channelId}/survivors/runes`, { equipped })
      .then((r) => setLists(r.data))
      .catch(() => setError("Няма свободно място за руна."));
  const joinParty = (partyId: string) => getSocket()?.emit(SocketEvents.SurvJoin, { partyId, hero, meta: profile?.upgrades ?? {}, skin: skinOf(hero) });
  const pickSkin = (sk: SurvSkinId) => {
    setSkinSel((m) => ({ ...m, [hero]: sk }));
    if (myParty && myParty.state === "lobby") getSocket()?.emit(SocketEvents.SurvSetup, { partyId: myParty.id, hero, skin: sk });
  };
  const buySkin = (sk: SurvSkinId) =>
    http
      .post<SurvListsDTO>(`/api/text-channels/${channelId}/survivors/skin`, { hero, skin: sk })
      .then((r) => {
        setLists(r.data);
        setSkinSel((m) => ({ ...m, [hero]: sk }));
      })
      .catch(() => setError("Не стига златото."));
  const leaveParty = () => myParty && getSocket()?.emit(SocketEvents.SurvLeave, { partyId: myParty.id });
  const startParty = () => myParty && getSocket()?.emit(SocketEvents.SurvStart, { partyId: myParty.id });
  const spectate = (partyId: string) => getSocket()?.emit(SocketEvents.SurvSpectate, { partyId });

  const goldMul = survGoldMul(curses, profile?.upgrades.greed ?? 0);

  /* ───────── render ───────── */

  const heroCard = (id: SurvHeroId) => {
    const h = HEROES[id];
    const info = SURV_HEROES.find((x) => x.id === id)!;
    const open = unlocked.has(id);
    let lockText = "";
    if (!open) {
      const u = info.unlock;
      if (u.kind === "gold") lockText = `🪙 ${u.cost}`;
      else if (u.kind === "stat") {
        lockText =
          u.stat === "bestSeconds" ? `Оцелей ${fmtTime(u.value)}` : u.stat === "bosses" ? "Повали бос" : u.stat === "bestLevel" ? `Стигни ниво ${u.value}` : u.stat === "kills" ? `${u.value} убити общо` : "";
      }
    }
    return (
      <button key={id} className={`sv-hero ${hero === id ? "on" : ""} ${open ? "" : "locked"}`} onClick={() => (open ? chooseHero(id) : info.unlock.kind === "gold" ? buyHero(id) : undefined)} title={open ? `${h.title} ${h.name}` : lockText}>
        <img src={heroIcon(id, open ? skinOf(id) : "classic")} alt="" />
        <span className="sv-hero-name">{h.name}</span>
        {!open && <span className="sv-hero-lock">🔒 {lockText}</span>}
      </button>
    );
  };

  const sel = HEROES[hero];

  const menu = (
    <div className="sv-menu">
      <div className="sv-title">
        <h2>
          <span className="sv-emoji">🧟</span> <span className="sv-name">Шмиркленд</span>
        </h2>
        <span className="sv-sub">Оцелей колкото можеш срещу таласъми, вампири и змейове. Ордите идват на вълни, всяка по-силна — а на всяка {BOSS_WAVE_EVERY}-а вълна идва бос.</span>
        <span className="sv-gold">🪙 {profile?.gold ?? 0}</span>
      </div>
      <div className="sv-tabs">
        <button className={tab === "play" ? "on" : ""} onClick={() => setTab("play")}>
          ⚔️ Игра
        </button>
        <button className={tab === "shop" ? "on" : ""} onClick={() => setTab("shop")}>
          🛒 Магазин
        </button>
        <button className={tab === "runes" ? "on" : ""} onClick={() => setTab("runes")}>
          ᚱ Руни
        </button>
        <button className={tab === "gear" ? "on" : ""} onClick={() => setTab("gear")}>
          🎒 Снаряжение {profile?.items?.length ? `(${profile.items.length})` : ""}
        </button>
        <button className={tab === "top" ? "on" : ""} onClick={() => setTab("top")}>
          🏆 Класация
        </button>
        <button className={tab === "ach" ? "on" : ""} onClick={() => setTab("ach")}>
          🏅 Подвизи {profile ? `${profile.achievements.length}/${SURV_ACHIEVEMENTS.length}` : ""}
        </button>
      </div>
      {error && (
        <div className="sv-error" onClick={() => setError(null)}>
          {error}
        </div>
      )}

      {tab === "play" && (
        <div className="sv-play">
          <section className="sv-col">
            <h3>Герой</h3>
            <div className="sv-heroes">{HERO_IDS.map(heroCard)}</div>
            <div className="sv-hero-info">
              <img src={heroIcon(hero, skinOf(hero))} alt="" />
              <div>
                <b>
                  {sel.title} {sel.name}
                </b>
                <div>
                  <img className="sv-wicon" src={weaponIcon(sel.weapon)} alt="" /> {WEAPONS[sel.weapon].name} — {WEAPONS[sel.weapon].desc}
                </div>
                <div>✨ {sel.bonus}</div>
                <div>
                  🎯 <b>{sel.skill.name}</b> (Q/E, {sel.skill.cd} с): {sel.skill.desc}
                </div>
              </div>
            </div>
            <h3>🎨 Скинове</h3>
            <div className="sv-skins">
              {SURV_SKINS.map((k) => {
                const have = owns(hero, k.id);
                const on = skinOf(hero) === k.id;
                return (
                  <button
                    key={k.id}
                    className={`sv-skin ${on ? "on" : ""} ${have ? "" : "locked"}`}
                    disabled={!have && !k.cost}
                    title={!have && k.ach ? SKIN_TEXT[k.id].how : SKIN_TEXT[k.id].name}
                    onClick={() => (have ? pickSkin(k.id) : k.cost ? buySkin(k.id) : undefined)}
                  >
                    <img src={heroIcon(hero, k.id)} alt="" />
                    <span>{SKIN_TEXT[k.id].name}</span>
                    {!have && <small>{k.cost ? `🪙 ${k.cost}` : "🔒 подвиг"}</small>}
                  </button>
                );
              })}
            </div>
          </section>
          <section className="sv-col">
            <h3>🗺️ Карта</h3>
            <div className="sv-maps">
              {SURV_MAPS.map((m) => {
                const open = openMaps.includes(m.id);
                const d = MAPS[m.id];
                const wins = profile?.missions?.[m.id] ?? 0;
                return (
                  <button
                    key={m.id}
                    className={`sv-map ${mapNow === m.id ? "on" : ""} ${open ? "" : "locked"}`}
                    disabled={!open || (!!myParty && myParty.hostId !== myId)}
                    onClick={() => chooseMap(m.id, missionSel)}
                    title={open ? d.desc : "Спечели мисията на предишната карта"}
                    style={{ ["--map-c" as string]: d.ground.base }}
                  >
                    <span className="sv-map-icon">{d.icon}</span>
                    <b>{d.name}</b>
                    <small>{open ? (wins ? `🏆 ×${wins}` : d.desc) : "🔒 спечели предишната мисия"}</small>
                  </button>
                );
              })}
            </div>
            <div className="sv-modes">
              <button className={missionSel ? "on" : ""} onClick={() => chooseMap(mapNow, true)} disabled={!!myParty && myParty.hostId !== myId}>
                🎯 Мисия
                <small>
                  Разбий {MISSION_ALTARS} капища (всяко дава дар от боговете), призови {ENEMIES[MAPS[mapNow].final].name} и го повали — до {12} мин. Награда 🪙 {SURV_MAPS.find((m) => m.id === mapNow)?.winGold}
                  (×2 първия път)
                </small>
              </button>
              <button className={!missionSel ? "on" : ""} onClick={() => chooseMap(mapNow, false)} disabled={!!myParty && myParty.hostId !== myId}>
                ♾️ Безкрайно
                <small>Вълна след вълна, докато паднеш.</small>
              </button>
            </div>
            <h3>
              ☠️ Трудност <span className="sv-dim">(всяка спечелена мисия отваря следващата на тази карта)</span>
            </h3>
            <div className="sv-diffs">
              {Array.from({ length: SURV_DIFF_MAX + 1 }, (_, d) => (
                <button
                  key={d}
                  className={`sv-diff ${diffNow === d ? "on" : ""} ${d > diffOpen ? "locked" : ""}`}
                  disabled={d > diffOpen || (!!myParty && myParty.hostId !== myId)}
                  onClick={() => chooseDiff(d)}
                  title={d > diffOpen ? "Спечели мисията на предишната трудност" : diffText(d)}
                >
                  {d === 0 ? "😊" : d > diffOpen ? "🔒" : d}
                </button>
              ))}
            </div>
            <div className={`sv-diff-info d${Math.min(3, Math.ceil(diffNow / 3))}`}>
              <b>{DIFF_NAMES[diffNow]}</b> — {diffText(diffNow)}
            </div>
            <h3>
              Проклятия <span className="sv-dim">(по-трудно, повече злато: ×{goldMul.toFixed(2)})</span>
            </h3>
            <div className="sv-curses">
              {SURV_CURSES.map((c) => (
                <button key={c.id} className={`sv-curse ${curses.includes(c.id) ? "on" : ""}`} onClick={() => toggleCurse(c.id)} disabled={!!myParty && myParty.hostId !== myId}>
                  <span>{CURSE_TEXT[c.id].icon}</span>
                  <b>{CURSE_TEXT[c.id].name}</b>
                  <small>
                    {CURSE_TEXT[c.id].desc} · +{c.gold}%
                  </small>
                </button>
              ))}
            </div>
            <button className="sv-big" onClick={startSolo} disabled={!!myParty}>
              ▶ Играй сам
            </button>
            {savedGames.has(channelId) && <div className="sv-dim">Имаш недовършена игра — влез пак в канала.</div>}
            <div className="sv-help">
              <b>Как се играе:</b> WASD / стрелки — движение (на телефон: плъзни с пръст). Оръжията стрелят сами. <b>Space</b> — претъркулване (за миг нищо не те лови). <b>Q / E</b> — умението на героя (на всеки 20 с). На всяка вълна има 🎯 задача с награда. <b>P</b> — пауза. При ново ниво
              избираш подобрение (1–4). Оръжие на ниво 8 + неговият предмет = 🌟 еволюция от сандък на бос.
            </div>
          </section>
          <section className="sv-col">
            <h3>🤝 Кооп (до {SURV_MAX_PLAYERS})</h3>
            {myParty ? (
              <div className="sv-party mine">
                <div className="sv-party-head">
                  {myParty.hostId === myId ? "Твоята дружина" : `Дружината на ${myParty.players.find((p) => p.userId === myParty.hostId)?.username}`}
                  <span className="sv-party-map">
                    {MAPS[myParty.map ?? "polyana"].icon} {MAPS[myParty.map ?? "polyana"].name} · {myParty.mission ? "🎯 мисия" : "♾️"}
                  </span>
                  {myParty.curses.length > 0 && <span className="sv-party-curses">{myParty.curses.map((c) => CURSE_TEXT[c].icon).join("")}</span>}
                </div>
                {myParty.players.map((p) => (
                  <div key={p.userId} className="sv-party-member">
                    <img src={heroIcon(p.hero)} alt="" /> {p.username} <span className="sv-dim">— {HEROES[p.hero].title} {HEROES[p.hero].name}</span> {p.userId === myParty.hostId && "👑"}
                  </div>
                ))}
                <div className="sv-row">
                  {myParty.hostId === myId && (
                    <button className="sv-big" onClick={startParty}>
                      ▶ Започни ({myParty.players.length})
                    </button>
                  )}
                  <button onClick={leaveParty}>Напусни</button>
                </div>
                {myParty.hostId !== myId && <div className="sv-dim">Чакаме домакина да започне…</div>}
              </div>
            ) : (
              <button className="sv-big alt" onClick={createParty}>
                🤝 Създай кооп игра
              </button>
            )}
            {lobby?.parties
              .filter((p) => p.id !== myParty?.id)
              .map((p) => (
                <div key={p.id} className="sv-party">
                  <div className="sv-party-head">
                    {p.players.map((m) => (
                      <img key={m.userId} src={heroIcon(m.hero)} alt="" title={m.username} />
                    ))}
                    <span>{p.players.map((m) => m.username).join(", ")}</span>
                    {p.curses.length > 0 && <span className="sv-party-curses">{p.curses.map((c) => CURSE_TEXT[c].icon).join("")}</span>}
                  </div>
                  {p.state === "lobby" ? (
                    <button onClick={() => joinParty(p.id)} disabled={p.players.length >= SURV_MAX_PLAYERS}>
                      {p.players.length >= SURV_MAX_PLAYERS ? "Пълна" : "Влез"}
                    </button>
                  ) : (
                    <button onClick={() => spectate(p.id)}>
                      👁 Гледай · {fmtTime(p.seconds ?? 0)} · 💀{p.kills ?? 0} {p.spectators ? `· 👁${p.spectators}` : ""}
                    </button>
                  )}
                </div>
              ))}
            {!lobby?.parties.length && !myParty && <div className="sv-dim">Няма отворени дружини. Създай една и кажи на приятелите!</div>}
            <div className="sv-dim">Опитът е общ — при ново ниво всеки си избира свое подобрение. Падналите се съживяват, като застанеш до тях.</div>
          </section>
        </div>
      )}

      {tab === "shop" && (
        <div className="sv-shop">
          {SURV_META.map((m) => {
            const lvl = profile?.upgrades[m.key] ?? 0;
            const max = lvl >= m.max;
            const cost = survMetaCost(m, lvl);
            return (
              <div key={m.key} className="sv-meta">
                <span className="sv-meta-icon">{META_TEXT[m.key].icon}</span>
                <b>{META_TEXT[m.key].name}</b>
                <small>{META_TEXT[m.key].per}</small>
                <div className="sv-pips">
                  {Array.from({ length: m.max }, (_, i) => (
                    <i key={i} className={i < lvl ? "on" : ""} />
                  ))}
                </div>
                <button onClick={() => buy(m.key)} disabled={max || (profile?.gold ?? 0) < cost}>
                  {max ? "Макс." : `🪙 ${cost}`}
                </button>
              </div>
            );
          })}
          <button className="sv-refund" onClick={refund}>
            ↩ Върни всичко (пълна сума)
          </button>
        </div>
      )}

      {tab === "runes" && profile && (
        <div className="sv-runes">
          <div className="sv-runes-head">
            ᚱ Руните се носят във всяка игра. Места: <b>{(profile.equipped ?? []).length}/{runeSlots}</b>
            <span className="sv-dim"> (+1 място след 3 повалени боса, +1 след първата спечелена мисия)</span>
          </div>
          <div className="sv-rune-list">
            {SURV_RUNES.map((r) => {
              const lvl = profile.runes?.[r.id] ?? 0;
              const on = (profile.equipped ?? []).includes(r.id);
              const cost = survRuneCost(r.id, lvl);
              const t = RUNE_TEXT[r.id];
              return (
                <div key={r.id} className={`sv-rune ${on ? "on" : ""} ${lvl ? "" : "none"}`}>
                  <span className="sv-rune-glyph">{t.glyph}</span>
                  <b>{t.name}</b>
                  <small>{t.desc(Math.max(1, lvl))}</small>
                  <div className="sv-pips">
                    {Array.from({ length: r.max }, (_, i) => (
                      <i key={i} className={i < lvl ? "on" : ""} />
                    ))}
                  </div>
                  <div className="sv-row">
                    <button onClick={() => buyRune(r.id)} disabled={lvl >= r.max || profile.gold < cost}>
                      {lvl >= r.max ? "Макс." : `${lvl ? "⬆" : "Купи"} 🪙 ${cost}`}
                    </button>
                    {lvl > 0 && (
                      <button
                        className={on ? "on" : ""}
                        disabled={!on && (profile.equipped ?? []).length >= runeSlots}
                        onClick={() => wearRunes(on ? (profile.equipped ?? []).filter((x) => x !== r.id) : [...(profile.equipped ?? []), r.id])}
                      >
                        {on ? "✅ Носиш я" : "Сложи"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <h3>⚡ Боговете</h3>
          <div className="sv-gods">
            {(Object.keys(GODS) as (keyof typeof GODS)[]).map((g) => (
              <div key={g} className="sv-god" style={{ ["--god" as string]: GODS[g].color }}>
                <b>
                  {GODS[g].icon} {GODS[g].name}
                </b>
                <small>3 негови дара = благословия: {GODS[g].blessing}.</small>
                <div className="sv-god-gifts">
                  {(Object.keys(GIFTS) as GiftId[])
                    .filter((id) => GIFTS[id].god === g)
                    .map((id) => (
                      <span key={id} title={GIFTS[id].desc(1)}>
                        {GIFTS[id].icon} {GIFTS[id].name}
                      </span>
                    ))}
                </div>
              </div>
            ))}
          </div>
          <div className="sv-dim">Даровете идват от картите при ново ниво (всяко 5-о ниво са само дарове) и от всяко разбито капище в мисиите.</div>
        </div>
      )}

      {tab === "ach" && (
        <div className="sv-achs">
          <div className="sv-ach-list">
            {SURV_ACHIEVEMENTS.map((a) => {
              const got = profile?.achievements.includes(a.id);
              return (
                <div key={a.id} className={`sv-ach ${got ? "got" : ""}`}>
                  <span className="sv-ach-icon">{ACH_TEXT[a.id].icon}</span>
                  <div>
                    <b>{ACH_TEXT[a.id].name}</b>
                    <small>{ACH_TEXT[a.id].desc}</small>
                  </div>
                  <em>{got ? "✅" : `🪙 ${a.gold}`}</em>
                </div>
              );
            })}
          </div>
          <h3>
            📜 Повалени босове: {profile?.bossTypes.length ?? 0}/{BOSS_ORDER.length}
          </h3>
          <div className="sv-bestiary">
            {BOSS_ORDER.map((id) => {
              const got = profile?.bossTypes.includes(id);
              return (
                <div key={id} className={`sv-beast ${got ? "" : "unseen"}`} title={got ? "повален" : "още не е повален"}>
                  <img src={enemyIcon(id)} alt="" />
                  <span>{got ? ENEMIES[id].name : "???"}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "gear" && profile && (() => {
        const gh = gearHero ?? hero;
        const worn = profile.gear?.[gh] ?? {};
        const wornIds = new Set(Object.values(profile.gear ?? {}).flatMap((g) => Object.values(g ?? {})));
        const total = survGearStats(profile.items, worn, gh);
        const items = [...(profile.items ?? [])]
          .filter((it) => (gearSlot ? survItemFits(it, gh, gearSlot) : gearAll || SURV_GEAR_SLOTS.some((sl) => survItemFits(it, gh, sl))))
          .sort((a, b) => b.r - a.r || b.d - a.d);
        /** where an item goes: the picked slot, else its own (a ring: the free finger first) */
        const target = (it: SurvItem): SurvGearSlot | undefined => {
          if (gearSlot && survItemFits(it, gh, gearSlot)) return gearSlot;
          const fits = SURV_GEAR_SLOTS.filter((sl) => survItemFits(it, gh, sl));
          return fits.find((sl) => !worn[sl]) ?? fits[0];
        };
        const slotBox = (slot: SurvGearSlot) => {
          const it = profile.items?.find((i) => i.id === worn[slot]);
          const t = it ? (ITEM_TEXT[it.b] ?? { name: it.b, icon: "❔" }) : null;
          return (
            <button
              key={slot}
              className={`sv-doll-slot s-${slot} ${gearSlot === slot ? "on" : ""} ${it ? `r${it.r}` : "empty"}`}
              style={it ? { ["--rc" as string]: RARITY[it.r]!.color } : undefined}
              onClick={() => setGearSlot(gearSlot === slot ? null : slot)}
              title={it ? `${t!.name} (${RARITY[it.r]!.name})\n${it.s.map(([k, v]) => GEAR_STAT_TEXT[k]?.(v) ?? k).join("\n")}` : `${SLOT_TEXT[slot]} — празно`}
            >
              <span className="sv-doll-icon">{t ? t.icon : SLOT_ICON[slot]}</span>
              <small>{t ? t.name : SLOT_TEXT[slot]}</small>
            </button>
          );
        };
        const picked = gearSlot ? profile.items?.find((i) => i.id === worn[gearSlot]) : undefined;
        return (
          <div className="sv-gear">
            <div className="sv-gear-heroes">
              {HERO_IDS.map((h) => (
                <button key={h} className={gh === h ? "on" : ""} onClick={() => setGearHero(h)} title={HEROES[h].name}>
                  <img src={heroIcon(h, skinOf(h))} alt="" />
                </button>
              ))}
            </div>
            <h3>
              🎒 {HEROES[gh].name} носи <span className="sv-dim">(предметите падат от босове и елитни, по-редки на по-висока трудност)</span>
            </h3>
            <div className="sv-doll">
              <div className="sv-doll-col">{(["helmet", "shoulders", "armor", "gloves", "weapon"] as SurvGearSlot[]).map(slotBox)}</div>
              <div className="sv-doll-hero">
                <img src={heroIcon(gh, skinOf(gh))} alt="" />
                <b>{HEROES[gh].name}</b>
                <small className="sv-dim">{SURV_GEAR_SLOTS.filter((sl) => worn[sl]).length}/{SURV_GEAR_SLOTS.length} слота</small>
              </div>
              <div className="sv-doll-col">{(["amulet", "ring1", "ring2", "pants", "boots"] as SurvGearSlot[]).map(slotBox)}</div>
            </div>
            {gearSlot && (
              <div className="sv-gear-picked">
                <b>{SLOT_TEXT[gearSlot]}:</b>{" "}
                {picked ? itemView(picked, <button onClick={() => equip(gh, gearSlot, null)}>Свали</button>) : <span className="sv-dim">празно — избери от торбата отдолу</span>}
                <button className="sv-dim" onClick={() => setGearSlot(null)}>
                  ✕ всички
                </button>
              </div>
            )}
            {Object.keys(total).length > 0 && (
              <div className="sv-gear-total">
                Общо:{" "}
                {Object.entries(total)
                  .map(([k, v]) => GEAR_STAT_TEXT[k]?.(Math.round(v * 100) / 100) ?? k)
                  .join(" · ")}
              </div>
            )}
            <h3>
              Торба ({profile.items?.length ?? 0}/{SURV_INV_MAX}){gearSlot ? ` · само ${SLOT_TEXT[gearSlot]}` : ""}{" "}
              <label className="sv-dim">
                <input type="checkbox" checked={gearAll} onChange={(e) => setGearAll(e.target.checked)} /> покажи и чуждите
              </label>
            </h3>
            {!items.length && <div className="sv-dim">Празно. Повали бос и вземи раницата 🎒, която пуска.</div>}
            <div className="sv-inv">
              {items.map((it) => {
                const slot = target(it);
                const on = Object.values(worn).includes(it.id);
                return itemView(
                  it,
                  <div className="sv-item-btns">
                    {slot && !on && <button onClick={() => equip(gh, slot, it.id)}>Сложи{slot.startsWith("ring") ? ` (${slot === "ring1" ? "ляв" : "десен"})` : ""}</button>}
                    {on && <em>носи го</em>}
                    {!wornIds.has(it.id) && (
                      <button className="sv-dim" onClick={() => salvage(it)} title="Разглоби за злато">
                        🔨 {survSalvageGold(it)}
                      </button>
                    )}
                  </div>,
                );
              })}
            </div>
          </div>
        );
      })()}
      {tab === "top" && (
        <div className="sv-top">
          <div className="sv-tabs small">
            <button className={topTab === "solo" ? "on" : ""} onClick={() => setTopTab("solo")}>
              Сам
            </button>
            <button className={topTab === "coop" ? "on" : ""} onClick={() => setTopTab("coop")}>
              Кооп
            </button>
          </div>
          <ol>
            {(lists?.[topTab].top ?? []).map((r, i) => (
              <li key={r.userId} className={r.userId === myId ? "me" : ""}>
                <span className="sv-rank">{["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`}</span>
                <span className="sv-top-name">{r.username}</span>
                <span>⏱ {fmtTime(r.best)}</span>
                <span className="sv-dim">💀 {r.kills}</span>
              </li>
            ))}
            {!lists?.[topTab].top.length && <li className="sv-dim">Още никой не е играл.</li>}
          </ol>
          {profile && (
            <div className="sv-stats">
              <div>
                Най-дълго: <b>{fmtTime(profile.stats.bestSeconds)}</b>
              </div>
              <div>
                Най-далечна вълна: <b>{profile.stats.bestWave ?? 0}</b>
              </div>
              <div>
                Най-високо ниво: <b>{profile.stats.bestLevel}</b>
              </div>
              <div>
                Убити общо: <b>{profile.stats.kills}</b>
              </div>
              <div>
                Повалени босове: <b>{profile.stats.bosses}</b>
              </div>
              <div>
                Игри: <b>{profile.stats.games}</b> ({profile.stats.coopGames} кооп)
              </div>
            </div>
          )}
          <h3>Бестиарий</h3>
          <div className="sv-bestiary">
            {(Object.keys(ENEMIES) as EnemyId[]).map((id) => (
              <div
                key={id}
                className="sv-beast"
                title={
                  ENEMIES[id].boss
                    ? `бос — магии:\n${(BOSS_SPELLS[id] ?? []).map(([m, n]) => `${n}: ${BOSS_MOVE_DESC[m]}`).join("\n")}${isRelic(id) ? `\n💎 може да изпусне: ${RELICS[id].name} — ${RELICS[id].desc}` : ""}`
                    : `от ${ENEMIES[id].from < 100 ? `${ENEMIES[id].from} мин` : "събитие"}`
                }
              >
                <img src={enemyIcon(id)} alt="" />
                <span>{ENEMIES[id].name}</span>
                {ENEMIES[id].boss && <small className="sv-spells">{(BOSS_SPELLS[id] ?? []).map(([, n]) => n).join(" · ")}</small>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const me_ = hud?.me;
  const game = (
    <div
      ref={wrapRef}
      className={`sv-game ${mouseMove !== "off" ? "mouse-move" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={(e) => {
        if (e.pointerType !== "mouse") return;
        inputRef.current.mouse.in = false;
        inputRef.current.mouse.down = false;
      }}
      onContextMenu={(e) => mouseMove !== "off" && e.preventDefault()}
    >
      {gfx === "3d" && <canvas ref={canvas3dRef} className="sv-canvas3d" key="c3d" />}
      <canvas ref={canvasRef} className="sv-canvas" />
      {hud && (
        <>
          <div className="sv-xp">
            <div style={{ width: `${Math.min(100, (hud.xp / Math.max(1, hud.xpNext)) * 100)}%` }} />
            <span>Ниво {hud.level}</span>
          </div>
          <div className="sv-hud-top">
            <div className="sv-loadout">
              <div className="sv-weapons">
                {me_?.weapons.map((w) => (
                  <div key={w.id} className={`sv-slot ${w.evo ? "evo" : ""}`} title={w.evo ? WEAPONS[w.id].evo.name : `${WEAPONS[w.id].name} ${w.lvl}`}>
                    <img src={weaponIcon(w.id)} alt="" />
                    <span>{w.evo ? "🌟" : w.lvl}</span>
                  </div>
                ))}
              </div>
              <div className="sv-weapons">
                {me_ &&
                  (Object.entries(me_.passives) as [PassiveId, number][]).map(([id, l]) => (
                    <div key={id} className="sv-slot small" title={`${PASSIVES[id].name} ${l}`}>
                      <i>{PASSIVES[id].icon}</i>
                      <span>{l}</span>
                    </div>
                  ))}
              </div>
              {me_ && Object.keys(me_.gifts ?? {}).length > 0 && (
                <div className="sv-weapons">
                  {(Object.entries(me_.gifts ?? {}) as [GiftId, number][]).map(([id, l]) => (
                    <div key={id} className="sv-slot small gift" title={`${GODS[GIFTS[id].god].name}: ${GIFTS[id].name} ${l} — ${GIFTS[id].desc(l)}`} style={{ ["--god" as string]: GODS[GIFTS[id].god].color }}>
                      <i>{GIFTS[id].icon}</i>
                      <span>{l}</span>
                    </div>
                  ))}
                </div>
              )}
              {me_ && (COMBO_IDS.some((c) => comboTier(me_.weapons, c) > 0) || Object.keys(me_.tempers ?? {}).length > 0) && (
                <div className="sv-weapons">
                  {COMBO_IDS.filter((c) => comboTier(me_.weapons, c) > 0).map((c) => {
                    const t = comboTier(me_.weapons, c);
                    return (
                      <div key={c} className="sv-slot small combo" title={`🔗 ${COMBOS[c].name} ${TIER_ROMAN[t]} — ${COMBOS[c].desc(t)}`}>
                        <i>{COMBOS[c].icon}</i>
                        <span>{TIER_ROMAN[t]}</span>
                      </div>
                    );
                  })}
                  {(Object.entries(me_.tempers ?? {}) as [TemperId, number][]).map(([id, n]) => (
                    <div key={id} className="sv-slot small temper" title={`${TEMPERS[id].name} ×${n}`}>
                      <i>{TEMPERS[id].icon}</i>
                      <span>{n}</span>
                    </div>
                  ))}
                </div>
              )}
              {me_ && (me_.relics?.length ?? 0) > 0 && (
                <div className="sv-weapons">
                  {me_.relics.map((id) => (
                    <div key={id} className="sv-slot small relic" title={`💎 ${RELICS[id].name} — ${RELICS[id].desc}`}>
                      <i>{RELICS[id].icon}</i>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="sv-clock">
              {hud.breakT > 0 ? (
                <b className="sv-wave next">
                  {isBossWave(hud.wave + 1) ? "💀" : "⚔️"} Вълна {hud.wave + 1} след {Math.ceil(hud.breakT)}…
                </b>
              ) : (
                <b className={`sv-wave ${isBossWave(hud.wave) ? "boss" : ""}`}>
                  {isBossWave(hud.wave) ? "💀" : "⚔️"} Вълна {hud.wave}
                </b>
              )}
              {hud.breakT <= 0 && !isBossWave(hud.wave) && (
                <div className="sv-wave-bar">
                  <div style={{ width: `${Math.max(0, 100 - (hud.waveT / WAVE_SECONDS) * 100)}%` }} />
                </div>
              )}
              {hud.theme && hud.breakT <= 0 && <span className="sv-theme">{hud.theme}</span>}
              <span>
                ⏱ {fmtTime(hud.t)} · 💀 {hud.kills} · 🪙 {hud.gold}
              </span>
              {hud.mission && (
                <div className={`sv-mission ph${hud.mission.phase}`}>
                  {hud.mission.phase === 0 && (
                    <>
                      🗿 Капища {hud.mission.total - hud.mission.left}/{hud.mission.total} · ⏳ {fmtTime(hud.mission.tLeft)}
                    </>
                  )}
                  {hud.mission.phase === 1 && <>🌀 Застанете в портала, за да призовете великана! · ⏳ {fmtTime(hud.mission.tLeft)}</>}
                  {hud.mission.phase === 2 && <>⚔️ Повалете великана!</>}
                  {hud.mission.phase === 3 && <>🏆 Победа!</>}
                </div>
              )}
              {hud.task && (
                <div className={`sv-task ${hud.task.state > 0 ? "done" : hud.task.state < 0 ? "failed" : ""}`}>
                  <span>
                    🎯 {hud.task.text} {hud.task.state === 0 && `(${hud.task.progress}/${hud.task.target})`}
                    {hud.task.state > 0 && " ✅"}
                    {hud.task.state < 0 && " ❌"}
                  </span>
                  {hud.task.state === 0 && (
                    <div>
                      <div style={{ width: `${Math.min(100, (hud.task.progress / hud.task.target) * 100)}%` }} />
                    </div>
                  )}
                </div>
              )}
              {hud.streak >= 10 && (
                <span className={`sv-streak ${hud.streak >= 100 ? "hot" : ""}`} key={Math.floor(hud.streak / 25)}>
                  🔥 Серия ×{hud.streak}
                </span>
              )}
              {hud.blessing && <span className="sv-bless">{BLESS_TEXT[hud.blessing]}</span>}
            </div>
            <div className="sv-buttons" onPointerDown={(e) => e.stopPropagation()}>
              <label className="sv-fxa" title="Колко се виждат моите атаки (за да личат атаките на враговете)">
                <span>{fxAlpha < 0.05 ? "🙈" : "✨"}</span>
                <input type="range" min={0} max={1} step={0.05} value={fxAlpha} onChange={(e) => setFxAlpha(Number(e.target.value))} onPointerUp={(e) => e.currentTarget.blur()} />
              </label>
              <button
                onClick={() => setGfx((g) => (g === "3d" ? "2d" : canWebGL2() ? "3d" : "2d"))}
                title={gfx === "3d" ? "Графика: 3D модели (цъкни за старата 2D, ако забива)" : "Графика: 2D (цъкни за 3D модели)"}
              >
                {gfx === "3d" ? "🧊" : "🖼️"}
              </button>
              {!touch && (
                <button
                  onClick={() => setMouseMove((m) => (m === "off" ? "hold" : m === "hold" ? "follow" : "off"))}
                  title={
                    mouseMove === "off"
                      ? "Движение с мишката: изключено (цъкни за „задържан ляв бутон“)"
                      : mouseMove === "hold"
                        ? "Движение с мишката: докато държиш левия бутон, десен = претъркулване (цъкни за „следва курсора“)"
                        : "Движение с мишката: героят следва курсора, десен = претъркулване (цъкни за изключено)"
                  }
                  className={mouseMove === "off" ? "off" : ""}
                >
                  🖱{mouseMove === "hold" ? "✊" : mouseMove === "follow" ? "➜" : ""}
                </button>
              )}
              {mode === "solo" && (
                <button onClick={() => setPaused(true)} title="Пауза (P)">
                  ⏸
                </button>
              )}
              <button onClick={() => setMusic((m) => !m)} title="Музика" className={music ? "" : "off"}>
                🎵
              </button>
              <button onClick={() => setNumbers((n) => !n)} title="Числа на щетите" className={numbers ? "" : "off"}>
                🔢
              </button>
              <button onClick={quit} title={mode === "spec" ? "Спри да гледаш" : "Край на играта"}>
                ✖
              </button>
            </div>
          </div>
          {hud.boss && (
            <div className="sv-boss">
              <span>💀 {hud.boss.name}</span>
              <div>
                <div style={{ width: `${Math.max(0, (hud.boss.hp / hud.boss.max) * 100)}%` }} />
              </div>
            </div>
          )}
          {hud.team.length > 1 && (
            <div className="sv-team">
              {hud.team.map((p) => (
                <div key={p.uid} className={`sv-mate ${p.dead ? "dead" : ""} ${p.gone ? "gone" : ""}`}>
                  <img src={heroIcon(p.hero)} alt="" />
                  <span>{p.name}</span>
                  <div className="sv-mate-hp">
                    <div style={{ width: `${p.dead ? 0 : (p.hp / p.maxHp) * 100}%` }} />
                  </div>
                  {p.dead && <i>🪦</i>}
                </div>
              ))}
            </div>
          )}
          {me_ && mode !== "spec" && (
            <div className="sv-abilities">
              <button className="sv-ability" onClick={() => inputRef.current.dash++} onPointerDown={(e) => e.stopPropagation()} title="Претъркулване (Space)">
                <span>💨</span>
                {me_.dashCd > 0 && <i style={{ height: `${(me_.dashCd / 2.2) * 100}%` }} />}
              </button>
              <button className={`sv-ability big ${me_.skillCd <= 0 ? "ready" : ""}`} onClick={() => inputRef.current.skill++} onPointerDown={(e) => e.stopPropagation()} title={`${HEROES[me_.hero].skill.name} (Q/E)`}>
                <span>✨</span>
                <small>{HEROES[me_.hero].skill.name}</small>
                {me_.skillCd <= 0 && <em className="sv-key">Q</em>}
                {me_.skillCd > 0 && (
                  <>
                    <i style={{ height: `${(me_.skillCd / me_.skillMax) * 100}%` }} />
                    <b>{Math.ceil(me_.skillCd)}</b>
                  </>
                )}
              </button>
            </div>
          )}
          {mode === "spec" && <div className="sv-spec">👁 Гледаш · Tab — следващия играч</div>}
          {me_?.dead && hud.team.length > 1 && <div className="sv-down">🪦 Падна! Някой от дружината трябва да застане до теб.</div>}
        </>
      )}
      {!hud && mode !== "solo" && <div className="sv-wait">Свързване с дружината…</div>}
      {joyView && (
        <div className="sv-joy" style={{ left: joyView.x - 50, top: joyView.y - 50 }}>
          <div style={{ transform: `translate(${joyView.dx}px, ${joyView.dy}px)` }} />
        </div>
      )}
      {banner && (
        <div key={banner.key} className={`sv-banner k${banner.kind}`}>
          {banner.text}
        </div>
      )}
      {chest && (
        <div className="sv-chest">
          <div className="sv-chest-title">📦 Сандък!</div>
          {chest.map((t, i) => (
            <div key={i} style={{ animationDelay: `${i * 0.25}s` }}>
              {t}
            </div>
          ))}
        </div>
      )}
      {offers && (
        <div className="sv-offers" onPointerDown={(e) => e.stopPropagation()}>
          <div className="sv-offers-title">⭐ Ниво {offers.level}! Избери:</div>
          <div className="sv-cards">
            {offers.offers.map((o, i) => (
              <button key={i} className={`sv-card ${o.kind === "gift" ? "gift" : ""}`} onClick={() => pick(i)} style={o.kind === "gift" ? { ["--god" as string]: GODS[GIFTS[o.id].god].color } : undefined}>
                <span className="sv-card-key">{i + 1}</span>
                {o.kind === "gift" ? (
                  <>
                    <span className="sv-card-god">
                      {GODS[GIFTS[o.id].god].icon} Дар от {GODS[GIFTS[o.id].god].name}
                    </span>
                    <span className="sv-card-emoji">{GIFTS[o.id].icon}</span>
                    <b>{GIFTS[o.id].name}</b>
                    <span className={`sv-card-lvl ${o.lvl === 1 ? "new" : ""}`}>{o.lvl === 1 ? "Ново!" : `Ниво ${o.lvl}`}</span>
                    <small>{GIFTS[o.id].desc(o.lvl)}</small>
                  </>
                ) : o.kind === "weapon" ? (
                  <img src={weaponIcon(o.id)} alt="" />
                ) : (
                  <span className="sv-card-emoji">{o.kind === "passive" ? PASSIVES[o.id].icon : o.kind === "temper" ? TEMPERS[o.id].icon : o.kind === "gold" ? "🪙" : "🍞"}</span>
                )}
                {o.kind !== "gift" && (
                  <>
                    <b>{o.kind === "weapon" ? WEAPONS[o.id].name : o.kind === "passive" ? PASSIVES[o.id].name : o.kind === "temper" ? TEMPERS[o.id].name : offerTitle(o)}</b>
                    <span className={`sv-card-lvl ${(o.kind === "weapon" || o.kind === "passive") && o.lvl === 1 ? "new" : ""}`}>
                      {o.kind === "weapon" || o.kind === "passive" ? (o.lvl === 1 ? "Ново!" : `Ниво ${o.lvl}`) : o.kind === "temper" ? `×${o.n}` : ""}
                    </span>
                    <small>
                      {o.kind === "weapon"
                        ? o.lvl === 1
                          ? WEAPONS[o.id].desc
                          : weaponUpText(o.id, o.lvl)
                        : o.kind === "passive"
                          ? PASSIVES[o.id].desc
                          : o.kind === "temper"
                            ? `${TEMPERS[o.id].desc} (безкрайно, всяка следваща малко по-слаба)`
                            : o.kind === "gold"
                            ? "Нищо ново не остана — вземи злато."
                            : "Възстановява половината живот."}
                    </small>
                  </>
                )}
                {o.kind === "weapon" && <em className="sv-evo-hint">🌟 + {PASSIVES[WEAPONS[o.id].evo.passive].icon} {PASSIVES[WEAPONS[o.id].evo.passive].name}</em>}
                {o.kind === "weapon" &&
                  combosOf(o.id).map((c) => {
                    const other = COMBOS[c].a === o.id ? COMBOS[c].b : COMBOS[c].a;
                    const has = me_?.weapons.some((w) => w.id === other);
                    return (
                      <em key={c} className={`sv-combo-hint ${has ? "on" : ""}`} title={COMBOS[c].desc(1)}>
                        🔗 + {WEAPONS[other].name} → {COMBOS[c].name}
                      </em>
                    );
                  })}
                {o.kind === "passive" && <em className="sv-evo-hint">{evoFor(o.id)}</em>}
              </button>
            ))}
          </div>
          <div className="sv-row center">
            <button onClick={reroll} disabled={offers.rerolls <= 0}>
              🎲 Пак ({offers.rerolls})
            </button>
            <button onClick={() => pick(-1)}>Пропусни (+3 🪙)</button>
          </div>
        </div>
      )}
      {!offers && hud?.choosing && mode !== "solo" && hud.waiting.length > 0 && <div className="sv-wait">🃏 Избира карти: {hud.waiting.join(", ")}</div>}
      {paused && mode === "solo" && (
        <div className="sv-pause" onPointerDown={(e) => e.stopPropagation()}>
          <h3>⏸ Пауза</h3>
          <label>
            🎵 Музика <input type="range" min={0} max={1} step={0.05} value={musicVol} onChange={(e) => setMusicVol(Number(e.target.value))} />
          </label>
          <label>
            🔊 Звуци <input type="range" min={0} max={1} step={0.05} value={sfx} onChange={(e) => setSfx(Number(e.target.value))} />
          </label>
          <div className="sv-row center">
            <button className="sv-big" onClick={() => setPaused(false)}>
              ▶ Продължи
            </button>
            <button onClick={quit}>✖ Край</button>
          </div>
        </div>
      )}
    </div>
  );

  const over = result && (
    <div className="sv-over">
      <h2>
        {endInfo?.mission?.won
          ? `🏆 Мисията е изпълнена — ${MAPS[endInfo.mission.map].name} е свободна!`
          : result.reason === "host-left"
            ? "Домакинът излезе"
            : result.reason === "stopped"
              ? "Край на играта"
              : "🪦 Паднахте!"}
      </h2>
      <div className="sv-over-stats">
        {endInfo && (
          <div>
            <span>Вълна</span>
            <b>{endInfo.wave}</b>
          </div>
        )}
        <div>
          <span>Оцеля</span>
          <b>{fmtTime(result.seconds)}</b>
        </div>
        <div>
          <span>Ниво</span>
          <b>{result.level}</b>
        </div>
        <div>
          <span>Убити</span>
          <b>{result.kills}</b>
        </div>
        {mode !== "spec" && (
          <div>
            <span>Злато</span>
            <b>🪙 +{result.goldEarned}</b>
          </div>
        )}
      </div>
      {result.record && <div className="sv-record">🏆 Нов рекорд!</div>}
      {endInfo && endInfo.dmg.length > 0 && (
        <div className="sv-dmg">
          <div className="sv-dmg-title">Щети по оръжие</div>
          {endInfo.dmg.map(([wi, v]) => {
            const id = WEAPON_IDS[wi];
            const total = endInfo.dmg.reduce((a, [, x]) => a + x, 0) || 1;
            return (
              <div key={wi} className="sv-dmg-row">
                {id ? <img src={weaponIcon(id)} alt="" /> : <i>{wi === -3 ? "⚡" : wi === -4 ? "💎" : wi === -5 ? "🔗" : "✨"}</i>}
                <span>{id ? WEAPONS[id].name : wi === -3 ? "Дарове от боговете" : wi === -4 ? "Реликви" : wi === -5 ? "Съчетания" : "Умение и други"}</span>
                <div className="sv-dmg-bar">
                  <div style={{ width: `${(v / endInfo.dmg[0]![1]) * 100}%` }} />
                </div>
                <b>{Math.round(v).toLocaleString("bg-BG")}</b>
                <small>{Math.round((v / total) * 100)}%</small>
              </div>
            );
          })}
        </div>
      )}
      {result.newAchievements?.map((a) => (
        <div key={a} className="sv-unlock ach">
          <span>{ACH_TEXT[a].icon}</span> Подвиг: {ACH_TEXT[a].name}! <em>+{SURV_ACHIEVEMENTS.find((x) => x.id === a)?.gold} 🪙</em>
        </div>
      ))}
      {result.newDiff ? (
        <div className="sv-unlock ach">
          <span>☠️</span> Отключи трудност {DIFF_NAMES[result.newDiff]} на тази карта!
        </div>
      ) : null}
      {result.newItems && result.newItems.length > 0 && (
        <div className="sv-loot">
          <div className="sv-dmg-title">🎒 Донесе {result.newItems.length} предмета (Снаряжение)</div>
          <div className="sv-inv">{result.newItems.map((it) => itemView(it))}</div>
          {result.salvaged ? <small className="sv-dim">Торбата е пълна: най-слабите са разглобени за {result.salvaged} 🪙</small> : null}
        </div>
      )}
      {result.newHeroes?.map((h) => (
        <div key={h} className="sv-unlock">
          <img src={heroIcon(h)} alt="" /> Отключи {HEROES[h].title} {HEROES[h].name}!
        </div>
      ))}
      {error && <div className="sv-error">{error}</div>}
      <div className="sv-row center">
        {mode === "solo" && (
          <button className="sv-big" onClick={startSolo}>
            🔄 Пак
          </button>
        )}
        <button
          onClick={() => {
            sessRef.current = null;
            setResult(null);
            setPhase("menu");
            reload();
          }}
        >
          Към менюто
        </button>
      </div>
    </div>
  );

  return <div className="sv-view">{phase === "menu" ? menu : phase === "playing" ? game : over}</div>;
}

function evoFor(p: PassiveId): string {
  const ws = WEAPON_IDS.filter((id) => WEAPONS[id].evo.passive === p);
  return ws.length ? `🌟 за ${ws.map((w) => WEAPONS[w].name).join(", ")}` : "";
}
