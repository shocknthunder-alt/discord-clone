import type { SurvCurseId, SurvHeroId, SurvMetaKey } from "@discord-clone/shared";

// 🧟 Шмиркленд — everything the game is made of: heroes, weapons, passives, evolutions, enemies,
// bosses, map events, curses and the gold shop. Numbers here, behaviour in engine.ts.

/* ───────────── weapons ───────────── */

export type WeaponId = "tsarvul" | "prase" | "tesla" | "kobilitsa" | "gaida" | "banitsa" | "chesan" | "rakia" | "martenitsa" | "pishtov";
export type PassiveId = "salata" | "boza" | "kafe" | "galoshi" | "kiselo" | "lyutenitsa" | "brojenitsa" | "rozovo" | "detelina" | "kozhuh" | "chasovnik";

/** dmg = damage per hit · cd = seconds between uses · amount = how many · area = size ×
 *  speed = projectile speed (px/s) · pierce = enemies one hit goes through · dur = seconds it lasts */
export interface WStats {
  dmg: number;
  cd: number;
  amount: number;
  area: number;
  speed: number;
  pierce: number;
  dur: number;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  desc: string;
  base: WStats;
  /** level 2..8: what changes (cd = seconds less, area/speed = +fraction, others added) */
  ups: Partial<WStats>[];
  evo: { passive: PassiveId; name: string; desc: string };
}

export const MAX_WEAPON_LEVEL = 8;
export const MAX_WEAPONS = 6;
export const MAX_PASSIVES = 6;

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  tsarvul: {
    id: "tsarvul",
    name: "Цървул",
    desc: "Хвърля се по най-близкия враг и се връща при теб като бумеранг. Минава през всички.",
    base: { dmg: 12, cd: 1.6, amount: 1, area: 1, speed: 380, pierce: 999, dur: 1 },
    ups: [{ dmg: 5 }, { amount: 1 }, { area: 0.2 }, { dmg: 6 }, { amount: 1 }, { cd: 0.3 }, { dmg: 10 }],
    evo: { passive: "galoshi", name: "Цървулена вихрушка", desc: "Цървули летят на всички страни, по-големи и по-силни." },
  },
  prase: {
    id: "prase",
    name: "Прасе",
    desc: "Живо прасе хуква през тълпата, блъска враговете и се отразява от краищата на екрана.",
    base: { dmg: 16, cd: 3.2, amount: 1, area: 1, speed: 380, pierce: 999, dur: 2.5 },
    ups: [{ amount: 1 }, { dmg: 8 }, { dur: 0.6 }, { amount: 1 }, { dmg: 8, area: 0.2 }, { cd: 0.6 }, { amount: 1 }],
    evo: { passive: "salata", name: "Глиганът Свирепко", desc: "Огромен глиган, двойни щети, зашеметява враговете." },
  },
  tesla: {
    id: "tesla",
    name: "Тесла",
    desc: "Намотка, която пуска светкавица — прескача от враг на враг.",
    base: { dmg: 13, cd: 1.8, amount: 1, area: 1, speed: 0, pierce: 3, dur: 0 },
    ups: [{ pierce: 2 }, { dmg: 6 }, { amount: 1 }, { pierce: 2 }, { cd: 0.3 }, { dmg: 8 }, { amount: 1, pierce: 2 }],
    evo: { passive: "kafe", name: "Кулата на Тесла", desc: "Още светкавици, двойни скокове и мълнии от небето." },
  },
  kobilitsa: {
    id: "kobilitsa",
    name: "Кобилица",
    desc: "Кобилици се въртят около теб и помитат всичко наоколо.",
    base: { dmg: 10, cd: 5, amount: 1, area: 1, speed: 3.2, pierce: 999, dur: 3 },
    ups: [{ amount: 1 }, { area: 0.25 }, { dmg: 6 }, { amount: 1 }, { dur: 1 }, { speed: 0.3 }, { dmg: 8 }],
    evo: { passive: "kozhuh", name: "Хоро от кобилици", desc: "Не спират да се въртят и са двойно повече." },
  },
  gaida: {
    id: "gaida",
    name: "Гайда",
    desc: "Звукова вълна от теб навън: удря и отблъсква.",
    base: { dmg: 8, cd: 2.4, amount: 1, area: 1, speed: 0, pierce: 999, dur: 0.45 },
    ups: [{ area: 0.2 }, { dmg: 5 }, { cd: 0.3 }, { area: 0.2 }, { dmg: 6 }, { cd: 0.3 }, { dmg: 8 }],
    evo: { passive: "kiselo", name: "Каба гайда", desc: "Огромни вълни, които и забавят враговете." },
  },
  banitsa: {
    id: "banitsa",
    name: "Баница",
    desc: "Хвърля се в дъга към враг и експлодира, където падне.",
    base: { dmg: 22, cd: 2.2, amount: 1, area: 1, speed: 0, pierce: 999, dur: 0.7 },
    ups: [{ amount: 1 }, { dmg: 10 }, { area: 0.2 }, { amount: 1 }, { dmg: 10 }, { cd: 0.3 }, { amount: 1 }],
    evo: { passive: "lyutenitsa", name: "Баница с късмети", desc: "Всяка баница се пръска на късмети, които експлодират пак." },
  },
  chesan: {
    id: "chesan",
    name: "Чесън",
    desc: "Вампирите го мразят: вреди на всеки, който се доближи.",
    base: { dmg: 5, cd: 0.6, amount: 1, area: 1, speed: 0, pierce: 999, dur: 0 },
    ups: [{ area: 0.2 }, { dmg: 3 }, { cd: 0.08 }, { area: 0.2 }, { dmg: 3 }, { cd: 0.08 }, { area: 0.2 }],
    evo: { passive: "boza", name: "Венец от чесън", desc: "По-голям и те лекува, докато има врагове в него." },
  },
  rakia: {
    id: "rakia",
    name: "Ракия",
    desc: "Хвърля шише, което пламва и гори земята.",
    base: { dmg: 9, cd: 3.5, amount: 1, area: 1, speed: 0, pierce: 999, dur: 3 },
    ups: [{ amount: 1 }, { dmg: 4 }, { dur: 1 }, { area: 0.2 }, { amount: 1 }, { dmg: 5 }, { dur: 1 }],
    evo: { passive: "chasovnik", name: "Гроздова от дядо", desc: "Огромни огнени локви, горят дълго." },
  },
  martenitsa: {
    id: "martenitsa",
    name: "Мартеница",
    desc: "Пижо и Пенда сами гонят най-близките врагове.",
    base: { dmg: 9, cd: 1.3, amount: 1, area: 1, speed: 300, pierce: 1, dur: 3 },
    ups: [{ amount: 1 }, { dmg: 4 }, { amount: 1 }, { cd: 0.2 }, { dmg: 5 }, { amount: 1 }, { pierce: 1 }],
    evo: { passive: "detelina", name: "Баба Марта", desc: "Рояк мартеници, пробиват и удрят тройно при критичен удар." },
  },
  pishtov: {
    id: "pishtov",
    name: "Пищов",
    desc: "Стреля право напред, накъдето вървиш.",
    base: { dmg: 16, cd: 1, amount: 1, area: 1, speed: 700, pierce: 1, dur: 1.2 },
    ups: [{ amount: 1 }, { dmg: 6 }, { pierce: 1 }, { cd: 0.15 }, { amount: 1 }, { dmg: 8 }, { pierce: 2 }],
    evo: { passive: "brojenitsa", name: "Хайдушка пушка", desc: "Стреля на осем страни наведнъж." },
  },
};

export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

/** Stats of a weapon at a level (1..8), before the player's own stats. */
export function weaponStats(id: WeaponId, level: number): WStats {
  const d = WEAPONS[id];
  const s = { ...d.base };
  for (let i = 0; i < Math.min(level, MAX_WEAPON_LEVEL) - 1; i++) {
    const u = d.ups[i]!;
    if (u.dmg) s.dmg += u.dmg;
    if (u.cd) s.cd = Math.max(0.1, s.cd - u.cd);
    if (u.amount) s.amount += u.amount;
    if (u.area) s.area += u.area;
    if (u.speed) s.speed *= 1 + u.speed;
    if (u.pierce) s.pierce += u.pierce;
    if (u.dur) s.dur += u.dur;
  }
  return s;
}

/** What the next level brings, for the level-up cards. */
export function weaponUpText(id: WeaponId, nextLevel: number): string {
  const u = WEAPONS[id].ups[nextLevel - 2];
  if (!u) return "";
  const parts: string[] = [];
  if (u.dmg) parts.push(`+${u.dmg} щети`);
  if (u.amount) parts.push(`+${u.amount} брой`);
  if (u.area) parts.push(`+${Math.round(u.area * 100)}% размер`);
  if (u.cd) parts.push(`по-бързо с ${u.cd} с`);
  if (u.pierce) parts.push(id === "tesla" ? `+${u.pierce} скока` : `+${u.pierce} пробив`);
  if (u.dur) parts.push(`+${u.dur} с време`);
  if (u.speed) parts.push(`+${Math.round(u.speed * 100)}% скорост`);
  return parts.join(", ");
}

/* ───────────── passives ───────────── */

export interface PassiveDef {
  id: PassiveId;
  name: string;
  icon: string;
  desc: string;
  max: number;
}

export const PASSIVES: Record<PassiveId, PassiveDef> = {
  salata: { id: "salata", name: "Шопска салата", icon: "🥗", desc: "+15% живот", max: 5 },
  boza: { id: "boza", name: "Боза", icon: "🥤", desc: "+0.25 живот в секунда", max: 5 },
  kafe: { id: "kafe", name: "Кафе", icon: "☕", desc: "оръжията презареждат с 8% по-бързо", max: 5 },
  galoshi: { id: "galoshi", name: "Галоши", icon: "👢", desc: "+10% бързина", max: 5 },
  kiselo: { id: "kiselo", name: "Кисело мляко", icon: "🥛", desc: "+10% размер на атаките", max: 5 },
  lyutenitsa: { id: "lyutenitsa", name: "Лютеница", icon: "🌶️", desc: "+10% щети", max: 5 },
  brojenitsa: { id: "brojenitsa", name: "Броеница", icon: "📿", desc: "+1 снаряд на всяко оръжие", max: 2 },
  rozovo: { id: "rozovo", name: "Розово масло", icon: "🌹", desc: "+30% обхват за събиране", max: 5 },
  detelina: { id: "detelina", name: "Четирилистна детелина", icon: "🍀", desc: "+4% критичен удар, по-добри сандъци", max: 5 },
  kozhuh: { id: "kozhuh", name: "Кожух", icon: "🧥", desc: "−1 щета от всеки удар", max: 5 },
  chasovnik: { id: "chasovnik", name: "Пясъчен часовник", icon: "⏳", desc: "+10% продължителност и скорост на снарядите", max: 5 },
};

export const PASSIVE_IDS = Object.keys(PASSIVES) as PassiveId[];

/* ───────────── heroes ───────────── */

export interface HeroDef {
  id: SurvHeroId;
  name: string;
  title: string;
  weapon: WeaponId;
  bonus: string;
  /** stat bonuses (same keys as Stats in engine.ts) */
  stats: Partial<{ maxHp: number; armor: number; area: number; regen: number; might: number; speed: number; magnet: number; cooldown: number; luck: number }>;
  skill: { name: string; desc: string; cd: number };
  /** look: clothes, skin, hat colour */
  look: { body: string; trim: string; hat: string; skin: string };
}

export const HEROES: Record<SurvHeroId, HeroDef> = {
  peyo: {
    id: "peyo",
    name: "Пейо",
    title: "Овчарят",
    weapon: "prase",
    bonus: "+20% живот",
    stats: { maxHp: 0.2 },
    skill: { name: "Стадото", desc: "Стадо овце прегазва всичко пред теб.", cd: 40 },
    look: { body: "#8a5a32", trim: "#e9dcc0", hat: "#2a2522", skin: "#f0c8a0" },
  },
  tseko: {
    id: "tseko",
    name: "Цеко",
    title: "Шопът",
    weapon: "tsarvul",
    bonus: "+1 броня",
    stats: { armor: 1 },
    skill: { name: "Шопски инат", desc: "4 секунди нищо не те лови, а наоколо пари.", cd: 45 },
    look: { body: "#f2efe6", trim: "#b3262b", hat: "#1d1b1a", skin: "#e8b88e" },
  },
  nikola: {
    id: "nikola",
    name: "Никола",
    title: "Даскалът по физика",
    weapon: "tesla",
    bonus: "+10% размер на атаките",
    stats: { area: 0.1 },
    skill: { name: "Буря", desc: "20 мълнии по враговете наоколо.", cd: 35 },
    look: { body: "#3b4a6b", trim: "#d9d9d9", hat: "#d8d8d8", skin: "#f1cfac" },
  },
  gitsa: {
    id: "gitsa",
    name: "Гица",
    title: "Бабата",
    weapon: "banitsa",
    bonus: "+0.4 живот в секунда",
    stats: { regen: 0.4 },
    skill: { name: "Тава баница", desc: "Лекува всички с 40% и вдига падналите.", cd: 50 },
    look: { body: "#4b2f5e", trim: "#f0e2b6", hat: "#c62f3a", skin: "#efc6a4" },
  },
  strahil: {
    id: "strahil",
    name: "Страхил",
    title: "Хайдутинът",
    weapon: "pishtov",
    bonus: "+10% щети",
    stats: { might: 0.1 },
    skill: { name: "Залп", desc: "Три кръга куршуми на всички страни.", cd: 30 },
    look: { body: "#2f3b2a", trim: "#c22a2a", hat: "#3a2a1c", skin: "#d9a57c" },
  },
  vela: {
    id: "vela",
    name: "Вела",
    title: "Самодивата",
    weapon: "martenitsa",
    bonus: "+15% бързина, +30% събиране",
    stats: { speed: 0.15, magnet: 0.3 },
    skill: { name: "Самодивско хоро", desc: "Замразява враговете наоколо за 4 секунди.", cd: 45 },
    look: { body: "#f4f1ff", trim: "#7ad1a0", hat: "#f2d36b", skin: "#f6dcc6" },
  },
  gosho: {
    id: "gosho",
    name: "Гошо",
    title: "Кукерът",
    weapon: "gaida",
    bonus: "+2 броня, −5% бързина",
    stats: { armor: 2, speed: -0.05 },
    skill: { name: "Звънци", desc: "Отблъсква и зашеметява всички наоколо.", cd: 35 },
    look: { body: "#1f1b19", trim: "#e9e3d6", hat: "#b3262b", skin: "#c99a6c" },
  },
  mitko: {
    id: "mitko",
    name: "Митко",
    title: "Чичото с ракията",
    weapon: "rakia",
    bonus: "оръжията с 8% по-бързо",
    stats: { cooldown: 0.08 },
    skill: { name: "Наздраве!", desc: "10 секунди +50% щети и +30% бързина за всички.", cd: 50 },
    look: { body: "#6b4a2b", trim: "#d7c39a", hat: "#4a5a3a", skin: "#eaa98a" },
  },
  stana: {
    id: "stana",
    name: "Стана",
    title: "Знахарката",
    weapon: "chesan",
    bonus: "+0.3 живот в секунда, +10% късмет",
    stats: { regen: 0.3, luck: 0.1 },
    skill: { name: "Билки", desc: "Събира всички кристали и те лекува 8 секунди.", cd: 45 },
    look: { body: "#3c5a3a", trim: "#e8d9a8", hat: "#5f8a3a", skin: "#e8c2a0" },
  },
};

export const HERO_IDS = Object.keys(HEROES) as SurvHeroId[];

/* ───────────── enemies ───────────── */

export type EnemyId = "rat" | "bat" | "zombie" | "ghost" | "vampire" | "werewolf" | "witch" | "blatnik" | "kuker" | "karak" | "mora" | "lamia" | "zmey";

export interface EnemyDef {
  id: EnemyId;
  name: string;
  hp: number;
  speed: number;
  dmg: number;
  r: number;
  xp: number;
  /** minute it starts to show up (normal waves) */
  from: number;
  boss?: boolean;
  ranged?: boolean;
  /** passes through others (no pushing) */
  ghost?: boolean;
}

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  rat: { id: "rat", name: "Плъх", hp: 6, speed: 72, dmg: 5, r: 10, xp: 1, from: 0 },
  bat: { id: "bat", name: "Прилеп", hp: 5, speed: 95, dmg: 4, r: 9, xp: 1, from: 0.5 },
  zombie: { id: "zombie", name: "Мъртвец", hp: 18, speed: 45, dmg: 8, r: 13, xp: 2, from: 1.5 },
  ghost: { id: "ghost", name: "Таласъм", hp: 14, speed: 66, dmg: 7, r: 12, xp: 2, from: 3, ghost: true },
  vampire: { id: "vampire", name: "Вампир", hp: 30, speed: 60, dmg: 10, r: 13, xp: 3, from: 5 },
  werewolf: { id: "werewolf", name: "Върколак", hp: 40, speed: 104, dmg: 12, r: 14, xp: 4, from: 7 },
  witch: { id: "witch", name: "Вещица", hp: 28, speed: 55, dmg: 8, r: 12, xp: 4, from: 9, ranged: true },
  blatnik: { id: "blatnik", name: "Блатник", hp: 120, speed: 38, dmg: 16, r: 22, xp: 8, from: 11 },
  kuker: { id: "kuker", name: "Кукер", hp: 45, speed: 52, dmg: 10, r: 15, xp: 3, from: 999 },
  karak: { id: "karak", name: "Караконджул", hp: 1000, speed: 72, dmg: 20, r: 34, xp: 60, from: 999, boss: true },
  mora: { id: "mora", name: "Вещицата Мора", hp: 1600, speed: 60, dmg: 18, r: 30, xp: 80, from: 999, boss: true, ranged: true },
  lamia: { id: "lamia", name: "Ламята", hp: 2600, speed: 48, dmg: 24, r: 44, xp: 100, from: 999, boss: true, ranged: true },
  zmey: { id: "zmey", name: "Змей Горянин", hp: 3600, speed: 80, dmg: 26, r: 40, xp: 120, from: 999, boss: true, ranged: true },
};

export const ENEMY_IDS = Object.keys(ENEMIES) as EnemyId[];
export const BOSS_ORDER: EnemyId[] = ["karak", "mora", "lamia", "zmey"];
/** a boss every this many seconds */
export const BOSS_EVERY = 180;

/* ───────────── map events ───────────── */

export type MapEventId = "shrine" | "treasure" | "swarm" | "kukeri" | "hail";

export const MAP_EVENTS: Record<MapEventId, { name: string; desc: string }> = {
  shrine: { name: "Оброк", desc: "Застани в кръга при оброка за благословия!" },
  treasure: { name: "Заровено имане", desc: "Сандък в далечината — пазят го силни чудовища." },
  swarm: { name: "Ято прилепи", desc: "Прилепи прелитат през полето!" },
  kukeri: { name: "Кукерско шествие", desc: "Кукерите ви обграждат!" },
  hail: { name: "Градушка", desc: "Бягай от сенките на градушката!" },
};

export type BlessingId = "might" | "speed" | "gather" | "shield";
export const BLESSINGS: Record<BlessingId, string> = {
  might: "💪 Сила на юнаците (двойни щети)",
  speed: "🪽 Крилати цървули (+40% бързина)",
  gather: "🧲 Голямо събиране",
  shield: "🛡️ Закрила на самодивите",
};

/* ───────────── curses ───────────── */

export const CURSE_TEXT: Record<SurvCurseId, { name: string; icon: string; desc: string }> = {
  wolves: { name: "Гладни вълци", icon: "🐺", desc: "враговете са с 25% по-бързи" },
  winter: { name: "Люта зима", icon: "❄️", desc: "лекуването е с 50% по-слабо" },
  horde: { name: "Орда", icon: "👹", desc: "с 50% повече врагове" },
  evileye: { name: "Уроки", icon: "🧿", desc: "враговете имат с 50% повече живот" },
  nomagnet: { name: "Къси ръце", icon: "🤏", desc: "събираш от половин разстояние" },
  night: { name: "Тъмна нощ", icon: "🌑", desc: "виждаш само около себе си" },
  glass: { name: "Стъклен човек", icon: "🥂", desc: "половин живот" },
};

/* ───────────── the gold shop ───────────── */

export const META_TEXT: Record<SurvMetaKey, { name: string; icon: string; per: string }> = {
  might: { name: "Сила", icon: "💪", per: "+5% щети" },
  health: { name: "Здраве", icon: "❤️", per: "+10% живот" },
  armor: { name: "Броня", icon: "🛡️", per: "+1 броня" },
  regen: { name: "Възстановяване", icon: "💚", per: "+0.2 живот/с" },
  speed: { name: "Бързина", icon: "👟", per: "+5% бързина" },
  magnet: { name: "Магнит", icon: "🧲", per: "+20% събиране" },
  wisdom: { name: "Мъдрост", icon: "📖", per: "+5% опит" },
  luck: { name: "Късмет", icon: "🍀", per: "+10% късмет" },
  haste: { name: "Сръчност", icon: "⚡", per: "−3% презареждане" },
  revival: { name: "Второ раждане", icon: "🕯️", per: "веднъж ставаш след смърт" },
  reroll: { name: "Пак!", icon: "🎲", per: "+1 ново теглене на картите" },
  greed: { name: "Алчност", icon: "🪙", per: "+10% злато" },
};

export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
