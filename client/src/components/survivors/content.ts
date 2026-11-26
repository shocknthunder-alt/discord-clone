import type { SurvAchId, SurvCurseId, SurvHeroId, SurvMetaKey, SurvSkinId } from "@discord-clone/shared";

// 🧟 Шмиркленд — everything the game is made of: heroes, weapons, passives, evolutions, enemies,
// bosses, map events, curses and the gold shop. Numbers here, behaviour in engine.ts.

/* ───────────── weapons ───────────── */

export type WeaponId =
  | "tsarvul"
  | "prase"
  | "tesla"
  | "kobilitsa"
  | "gaida"
  | "banitsa"
  | "chesan"
  | "rakia"
  | "martenitsa"
  | "pishtov"
  | "sarp"
  | "bradva"
  | "kaval"
  | "kosher"
  | "kazan"
  | "krik"
  | "plashilo";
export type PassiveId =
  | "salata"
  | "boza"
  | "kafe"
  | "galoshi"
  | "kiselo"
  | "lyutenitsa"
  | "brojenitsa"
  | "rozovo"
  | "detelina"
  | "kozhuh"
  | "chasovnik"
  | "sirene"
  | "med"
  | "lukanka";

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
    base: { dmg: 13, cd: 0.5, amount: 1, area: 1, speed: 0, pierce: 999, dur: 0 },
    ups: [{ area: 0.2 }, { dmg: 6 }, { cd: 0.07 }, { area: 0.2 }, { dmg: 8 }, { cd: 0.07 }, { area: 0.25 }],
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
  sarp: {
    id: "sarp",
    name: "Сърп",
    desc: "Широк замах пред теб — коси всичко наблизо.",
    base: { dmg: 15, cd: 1.25, amount: 1, area: 1, speed: 0, pierce: 999, dur: 0.2 },
    ups: [{ dmg: 6 }, { area: 0.2 }, { amount: 1 }, { dmg: 8 }, { cd: 0.2 }, { area: 0.2 }, { dmg: 12 }],
    evo: { passive: "lukanka", name: "Жетварска коса", desc: "Замахът обикаля целия кръг около теб." },
  },
  bradva: {
    id: "bradva",
    name: "Брадва",
    desc: "Голяма двуръчна брадва, мятана по дъга право в тълпата. Върти се и сече всичко по пътя.",
    base: { dmg: 26, cd: 1.6, amount: 1, area: 1, speed: 520, pierce: 999, dur: 1 },
    ups: [{ dmg: 8 }, { amount: 1 }, { area: 0.2 }, { dmg: 10 }, { amount: 1 }, { area: 0.25 }, { dmg: 14 }],
    evo: { passive: "kozhuh", name: "Секирата на Крали Марко", desc: "Огромни брадви, които минават през всичко." },
  },
  kaval: {
    id: "kaval",
    name: "Кавал",
    desc: "Ноти излитат на спирала около теб.",
    base: { dmg: 6, cd: 0.32, amount: 1, area: 1, speed: 250, pierce: 1, dur: 1.6 },
    ups: [{ dmg: 2 }, { amount: 1 }, { pierce: 1 }, { dmg: 3 }, { cd: 0.06 }, { amount: 1 }, { dmg: 4, pierce: 1 }],
    evo: { passive: "sirene", name: "Вълшебният кавал", desc: "Две спирали, нотите пробиват по трима." },
  },
  kosher: {
    id: "kosher",
    name: "Кошер",
    desc: "Пчели летят около теб и жилят най-близките врагове.",
    base: { dmg: 5, cd: 0.5, amount: 2, area: 1, speed: 240, pierce: 999, dur: 0 },
    ups: [{ amount: 1 }, { dmg: 2 }, { amount: 1 }, { speed: 0.25 }, { dmg: 3 }, { amount: 2 }, { dmg: 4 }],
    evo: { passive: "rozovo", name: "Царицата майка", desc: "Двойно повече пчели, ужилените забавят." },
  },
  kazan: {
    id: "kazan",
    name: "Казан",
    desc: "Слагаш казан с боб, който сам стреля по враговете.",
    base: { dmg: 9, cd: 8, amount: 1, area: 1, speed: 420, pierce: 1, dur: 6 },
    ups: [{ dur: 1.5 }, { dmg: 4 }, { cd: 1 }, { amount: 1 }, { dmg: 5 }, { dur: 2 }, { amount: 1 }],
    evo: { passive: "med", name: "Курбан чорба", desc: "Казанът стреля тройно и лекува всички около него." },
  },
  krik: {
    id: "krik",
    name: "Крик",
    desc: "Тръшва се в земята при враговете — удря и зашеметява.",
    base: { dmg: 30, cd: 2.6, amount: 1, area: 1, speed: 0, pierce: 999, dur: 0.8 },
    ups: [{ dmg: 10 }, { area: 0.2 }, { amount: 1 }, { dmg: 12 }, { cd: 0.4 }, { area: 0.2 }, { amount: 1 }],
    evo: { passive: "kiselo", name: "Хидравличен крик", desc: "Три поредни тръшвания, по-широки." },
  },
  plashilo: {
    id: "plashilo",
    name: "Плашило",
    desc: "Слагаш плашило — враговете наоколо тръгват към него и се парят.",
    base: { dmg: 5, cd: 9, amount: 1, area: 1, speed: 0, pierce: 999, dur: 5 },
    ups: [{ dur: 1 }, { dmg: 3 }, { area: 0.25 }, { cd: 1.5 }, { amount: 1 }, { dur: 2 }, { dmg: 5 }],
    evo: { passive: "chasovnik", name: "Страшилище", desc: "Накрая избухва в огромна експлозия." },
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
  sirene: { id: "sirene", name: "Бяло сирене", icon: "🧀", desc: "+10% опит", max: 5 },
  med: { id: "med", name: "Пита мед", icon: "🍯", desc: "+25% шанс за злато от враговете", max: 5 },
  lukanka: { id: "lukanka", name: "Луканка", icon: "🥓", desc: "+15% щети по босове и елитни", max: 5 },
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
    name: "Бай Шмирко",
    title: "Овчарят",
    weapon: "prase",
    bonus: "+20% живот",
    stats: { maxHp: 0.2 },
    skill: { name: "Стадото", desc: "Две стада овце прегазват всичко от двете страни.", cd: 20 },
    look: { body: "#7a4a26", trim: "#efe4c8", hat: "#1e1a18", skin: "#e9bf96" },
  },
  tseko: {
    id: "tseko",
    name: "Киро Брейка",
    title: "Брейкърът",
    weapon: "tsarvul",
    bonus: "+1 броня, +10% бързина",
    stats: { armor: 1, speed: 0.1 },
    skill: { name: "Брейк на главата", desc: "5 секунди се върти на главата — нищо не го лови, наоколо гори, накрая взрив.", cd: 20 },
    look: { body: "#2457c7", trim: "#ffffff", hat: "#d9262e", skin: "#d9a57c" },
  },
  nikola: {
    id: "nikola",
    name: "Никола",
    title: "Даскалът по физика",
    weapon: "tesla",
    bonus: "+10% размер на атаките",
    stats: { area: 0.1 },
    skill: { name: "Буря", desc: "30 мълнии, всяка удря и всичко около себе си.", cd: 20 },
    look: { body: "#eef0f2", trim: "#2a3550", hat: "#d8d8d8", skin: "#f1cfac" },
  },
  gitsa: {
    id: "gitsa",
    name: "Спаска",
    title: "Майсторката на баници",
    weapon: "banitsa",
    bonus: "+0.4 живот в секунда",
    stats: { regen: 0.4 },
    skill: { name: "Тава баница", desc: "Лекува всички с 40%, вдига падналите и хвърля 16 горещи баници наоколо.", cd: 20 },
    look: { body: "#2a1d2e", trim: "#f4efe4", hat: "#c62f3a", skin: "#efc6a4" },
  },
  strahil: {
    id: "strahil",
    name: "Баткан",
    title: "Големият",
    weapon: "bradva",
    bonus: "+15% щети, +15% живот",
    stats: { might: 0.15, maxHp: 0.15 },
    skill: { name: "Вихър от брадви", desc: "5 секунди се върти с две брадви: смила всичко наоколо, придърпва враговете, поема половин щети; накрая хвърля 12 брадви.", cd: 20 },
    look: { body: "#1b1b1d", trim: "#f2f2f2", hat: "#d4a640", skin: "#d9a57c" },
  },
  vela: {
    id: "vela",
    name: "Вела",
    title: "Самодивата",
    weapon: "martenitsa",
    bonus: "+15% бързина, +30% събиране",
    stats: { speed: 0.15, magnet: 0.3 },
    skill: { name: "Самодивско хоро", desc: "Замразява враговете наоколо за 5 секунди — замразените поемат двойни щети.", cd: 20 },
    look: { body: "#f4f1ff", trim: "#7ad1a0", hat: "#f2d36b", skin: "#f6dcc6" },
  },
  gosho: {
    id: "gosho",
    name: "Бай Гошууу",
    title: "Кукерът",
    weapon: "gaida",
    bonus: "+2 броня, −5% бързина",
    stats: { armor: 2, speed: -0.05 },
    skill: { name: "Звънци", desc: "Три вълни звън — всяка удря, отблъсква и зашеметява наоколо.", cd: 20 },
    look: { body: "#1f1b19", trim: "#e9e3d6", hat: "#b3262b", skin: "#c99a6c" },
  },
  mitko: {
    id: "mitko",
    name: "Митьо Крика",
    title: "Майсторът",
    weapon: "krik",
    bonus: "оръжията с 8% по-бързо",
    stats: { cooldown: 0.08 },
    skill: { name: "Наздраве!", desc: "10 секунди +60% щети и +30% бързина за всички, +15% живот.", cd: 20 },
    look: { body: "#1d2a5a", trim: "#ffffff", hat: "#3a3a3a", skin: "#eaa98a" },
  },
  stana: {
    id: "stana",
    name: "Стана",
    title: "Знахарката",
    weapon: "chesan",
    bonus: "+0.3 живот в секунда, +10% късмет",
    stats: { regen: 0.3, luck: 0.1 },
    skill: { name: "Билки", desc: "Събира всички кристали, лекува 8 секунди и отровен облак от билки трови враговете около теб.", cd: 20 },
    look: { body: "#3c5a3a", trim: "#e8d9a8", hat: "#5f8a3a", skin: "#e8c2a0" },
  },
};

export const HERO_IDS = Object.keys(HEROES) as SurvHeroId[];

/* ───────────── enemies ───────────── */

export type EnemyId =
  | "rat"
  | "bat"
  | "zombie"
  | "ghost"
  | "vampire"
  | "werewolf"
  | "witch"
  | "blatnik"
  | "kuker"
  | "wolf"
  | "yuda"
  | "pot"
  | "skeleton"
  | "raven"
  | "bear"
  | "firespirit"
  | "spider"
  | "karak"
  | "mora"
  | "lamia"
  | "zmey"
  | "hala"
  | "chuma"
  | "wolfking"
  | "vampking"
  | "ispolin"
  | "samqueen"
  | "swampking"
  | "kukerchief"
  | "ghostking"
  | "bearking";

export interface EnemyDef {
  id: EnemyId;
  name: string;
  hp: number;
  speed: number;
  dmg: number;
  r: number;
  xp: number;
  /** wave it starts to show up in (normal waves; 999 = only from events / bosses) */
  from: number;
  boss?: boolean;
  ranged?: boolean;
  /** passes through others (no pushing) */
  ghost?: boolean;
}

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  rat: { id: "rat", name: "Плъх", hp: 7, speed: 80, dmg: 6, r: 10, xp: 1, from: 1 },
  bat: { id: "bat", name: "Прилеп", hp: 6, speed: 104, dmg: 5, r: 9, xp: 1, from: 1 },
  zombie: { id: "zombie", name: "Мъртвец", hp: 20, speed: 50, dmg: 9, r: 13, xp: 2, from: 2 },
  wolf: { id: "wolf", name: "Вълк", hp: 16, speed: 128, dmg: 8, r: 12, xp: 2, from: 3 },
  ghost: { id: "ghost", name: "Таласъм", hp: 16, speed: 72, dmg: 8, r: 12, xp: 2, from: 4, ghost: true },
  vampire: { id: "vampire", name: "Вампир", hp: 34, speed: 66, dmg: 11, r: 13, xp: 3, from: 6 },
  yuda: { id: "yuda", name: "Юда", hp: 26, speed: 78, dmg: 9, r: 12, xp: 3, from: 7, ranged: true, ghost: true },
  werewolf: { id: "werewolf", name: "Върколак", hp: 46, speed: 112, dmg: 13, r: 14, xp: 4, from: 8 },
  witch: { id: "witch", name: "Вещица", hp: 32, speed: 58, dmg: 9, r: 12, xp: 4, from: 9, ranged: true },
  blatnik: { id: "blatnik", name: "Блатник", hp: 140, speed: 42, dmg: 18, r: 22, xp: 8, from: 11 },
  kuker: { id: "kuker", name: "Кукер", hp: 50, speed: 56, dmg: 11, r: 15, xp: 3, from: 999 },
  pot: { id: "pot", name: "Стомна", hp: 1, speed: 0, dmg: 0, r: 12, xp: 0, from: 999 },
  skeleton: { id: "skeleton", name: "Скелет", hp: 22, speed: 62, dmg: 9, r: 12, xp: 2, from: 3 },
  raven: { id: "raven", name: "Гарван", hp: 9, speed: 140, dmg: 6, r: 10, xp: 1, from: 2, ghost: true },
  spider: { id: "spider", name: "Паяк", hp: 18, speed: 118, dmg: 8, r: 12, xp: 2, from: 5 },
  firespirit: { id: "firespirit", name: "Огнен дух", hp: 30, speed: 70, dmg: 10, r: 12, xp: 3, from: 8, ranged: true, ghost: true },
  bear: { id: "bear", name: "Мечка", hp: 180, speed: 46, dmg: 20, r: 22, xp: 9, from: 10 },
  karak: { id: "karak", name: "Караконджул", hp: 1000, speed: 72, dmg: 20, r: 34, xp: 60, from: 999, boss: true },
  mora: { id: "mora", name: "Вещицата Мора", hp: 1600, speed: 60, dmg: 18, r: 30, xp: 80, from: 999, boss: true, ranged: true },
  lamia: { id: "lamia", name: "Ламята", hp: 2600, speed: 48, dmg: 24, r: 44, xp: 100, from: 999, boss: true, ranged: true },
  zmey: { id: "zmey", name: "Змей Горянин", hp: 3600, speed: 80, dmg: 26, r: 40, xp: 120, from: 999, boss: true, ranged: true },
  hala: { id: "hala", name: "Хала", hp: 4200, speed: 70, dmg: 24, r: 42, xp: 140, from: 999, boss: true, ranged: true, ghost: true },
  chuma: { id: "chuma", name: "Баба Чума", hp: 4600, speed: 52, dmg: 22, r: 30, xp: 150, from: 999, boss: true, ranged: true },
  wolfking: { id: "wolfking", name: "Вълчият цар", hp: 5200, speed: 96, dmg: 28, r: 38, xp: 160, from: 999, boss: true },
  vampking: { id: "vampking", name: "Цар Вампир", hp: 6000, speed: 74, dmg: 30, r: 32, xp: 180, from: 999, boss: true, ranged: true },
  ispolin: { id: "ispolin", name: "Исполинът", hp: 5600, speed: 44, dmg: 34, r: 48, xp: 160, from: 999, boss: true },
  samqueen: { id: "samqueen", name: "Самодивската царица", hp: 4400, speed: 84, dmg: 22, r: 30, xp: 150, from: 999, boss: true, ranged: true, ghost: true },
  swampking: { id: "swampking", name: "Блатният цар", hp: 5000, speed: 40, dmg: 26, r: 46, xp: 160, from: 999, boss: true, ranged: true },
  kukerchief: { id: "kukerchief", name: "Кукерският вожд", hp: 4800, speed: 66, dmg: 26, r: 36, xp: 150, from: 999, boss: true },
  ghostking: { id: "ghostking", name: "Таласъмският цар", hp: 4200, speed: 76, dmg: 22, r: 34, xp: 150, from: 999, boss: true, ranged: true, ghost: true },
  bearking: { id: "bearking", name: "Мечият цар", hp: 6400, speed: 58, dmg: 32, r: 44, xp: 170, from: 999, boss: true },
};

export const ENEMY_IDS = Object.keys(ENEMIES) as EnemyId[];
/** the easier ones come first (shuffled among themselves), then the rest — no boss twice until all were seen */
export const BOSS_EASY: EnemyId[] = ["karak", "mora", "lamia", "kukerchief"];
export const BOSS_HARD: EnemyId[] = ["wolfking", "chuma", "zmey", "hala", "vampking", "ispolin", "samqueen", "swampking", "ghostking", "bearking"];
export const BOSS_ORDER: EnemyId[] = [...BOSS_EASY, ...BOSS_HARD];

/** 💀 spells the bosses cast on top of their own attacks */
export type BossMove = "leap" | "firering" | "meteors" | "shield" | "summon" | "nova" | "spiral" | "blink" | "wall" | "acid";
export const BOSS_MOVE_DESC: Record<BossMove, string> = {
  leap: "скача върху теб (червен кръг на земята)",
  firering: "обръч от огън се свива към теб — претъркаляй се през него",
  meteors: "камъни падат от небето (червени кръгове)",
  shield: "щит — поема 80% от щетите за малко",
  summon: "вика помощ около теб",
  nova: "взрив около себе си (голям червен кръг)",
  spiral: "спира и върти спирала от снаряди",
  blink: "изчезва и се появява до теб с кръг от снаряди",
  wall: "стена от снаряди с една пролука",
  acid: "отровни локви падат около теб (зелени кръгове)",
};
/** every boss has its own two spells (with its own names) */
export const BOSS_SPELLS: Partial<Record<EnemyId, [BossMove, string][]>> = {
  karak: [["leap", "⤴️ Скок от гроба"], ["summon", "⚰️ Гробищна свита"]],
  mora: [["spiral", "🌀 Кошмарна спирала"], ["blink", "💤 Сънна стъпка"]],
  lamia: [["acid", "🐍 Отровна слюнка"], ["wall", "🐉 Опашка-стена"]],
  kukerchief: [["nova", "🔔 Звънът на хлопките"], ["firering", "🔥 Кукерски огнен кръг"]],
  zmey: [["meteors", "☄️ Огнен дъжд"], ["firering", "🔥 Огнен обръч"]],
  hala: [["wall", "🌪️ Буреносен фронт"], ["spiral", "🌀 Вихрушка"]],
  chuma: [["acid", "☠️ Чумав облак"], ["summon", "🐀 Плъхове от мазето"]],
  wolfking: [["leap", "🐺 Вълчи скок"], ["nova", "🌕 Вой към луната"]],
  vampking: [["blink", "🦇 Кървава мъгла"], ["shield", "🩸 Кървав щит"]],
  ispolin: [["meteors", "🪨 Канари"], ["nova", "💥 Земетръс"]],
  samqueen: [["spiral", "💫 Самодивско хоро"], ["shield", "🌸 Венец от билки"]],
  swampking: [["wall", "🌊 Тинеста вълна"], ["shield", "🪵 Тинеста броня"]],
  ghostking: [["blink", "👻 През стените"], ["summon", "💀 Свитата на мъртвите"]],
  bearking: [["leap", "🐻 Мечи скок"], ["shield", "🧥 Дебела кожа"]],
};

/** 🌊 named wave themes: which enemies come (only those already "open" by wave); never the same twice in a row */
export const WAVE_THEMES: { name: string; mobs: EnemyId[] }[] = [
  { name: "Плъхове и прилепи", mobs: ["rat", "bat"] },
  { name: "Гробището се надига", mobs: ["zombie", "skeleton"] },
  { name: "Гарваните", mobs: ["raven", "bat", "rat"] },
  { name: "Глутницата", mobs: ["wolf", "werewolf"] },
  { name: "Нощта на мъртвите", mobs: ["zombie", "ghost", "skeleton"] },
  { name: "Паяжината", mobs: ["spider", "rat"] },
  { name: "Вампирски бал", mobs: ["vampire", "bat"] },
  { name: "Нощни сенки", mobs: ["ghost", "yuda"] },
  { name: "Сабатът", mobs: ["witch", "yuda", "raven"] },
  { name: "Огнената нощ", mobs: ["firespirit", "skeleton"] },
  { name: "Горските зверове", mobs: ["bear", "wolf"] },
  { name: "Блатото", mobs: ["blatnik", "rat", "spider"] },
  { name: "Върколашка луна", mobs: ["werewolf", "wolf", "vampire"] },
  { name: "Всички чудовища", mobs: ["skeleton", "vampire", "werewolf", "witch", "blatnik", "spider", "firespirit"] },
];

/** 🎯 a task for the wave (not on boss waves) */
export type TaskKind = "kill" | "nohit" | "gems" | "pots" | "elite" | "streak";
/** every this many waves is a boss wave (from wave 25 on two bosses at once) */
export const BOSS_WAVE_EVERY = 5;
/** seconds of fighting in a wave, and the breather after it */
export const WAVE_SECONDS = 30;
export const WAVE_BREAK = 3;

/** ⭐ elite affixes */
export type AffixId = "fast" | "armored" | "explosive" | "leader" | "tireless";
export const AFFIXES: AffixId[] = ["fast", "armored", "explosive", "leader", "tireless"];
export const AFFIX_TEXT: Record<AffixId, { name: string; color: string }> = {
  fast: { name: "Бесен", color: "#ff4a3a" },
  armored: { name: "Брониран", color: "#6ab8ff" },
  explosive: { name: "Взривоопасен", color: "#ff9a2a" },
  leader: { name: "Водач", color: "#c06bff" },
  tireless: { name: "Неуморим", color: "#5ee07a" },
};

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

/** 🎨 skins: a palette for the clothes, or a tint over the whole hero */
export const SKIN_TEXT: Record<SurvSkinId, { name: string; how?: string }> = {
  classic: { name: "Обикновен" },
  night: { name: "Хайдутин" },
  fest: { name: "Сватбар" },
  royal: { name: "Цар" },
  gold: { name: "Златен юнак", how: "Подвиг: стигни вълна 20" },
  fire: { name: "Нестинар", how: "Подвиг: серия 1000" },
  ghost: { name: "Призрак", how: "Подвиг: победи всички босове" },
};

export const ACH_TEXT: Record<SurvAchId, { name: string; icon: string; desc: string }> = {
  first: { name: "Първа кръв", icon: "🩸", desc: "Изиграй една игра" },
  wave5: { name: "Вълна 5", icon: "🌊", desc: "Стигни вълна 5" },
  wave10: { name: "Вълна 10", icon: "🌊", desc: "Стигни вълна 10" },
  wave15: { name: "Вълна 15", icon: "🌊", desc: "Стигни вълна 15" },
  wave20: { name: "Вълна 20", icon: "🏅", desc: "Стигни вълна 20 (Златен скин)" },
  wave30: { name: "Вълна 30", icon: "👑", desc: "Стигни вълна 30" },
  boss1: { name: "Ловец на чудовища", icon: "💀", desc: "Повали бос" },
  boss5kinds: { name: "Колекционер", icon: "📜", desc: "Повали 5 различни боса" },
  allBosses: { name: "Легенда на Шмиркленд", icon: "🐉", desc: "Повали всички 14 боса (Призрачен скин)" },
  kills1000: { name: "Касапин", icon: "🔪", desc: "1000 убити в една игра" },
  kills3000: { name: "Кървава баня", icon: "🩸", desc: "3000 убити в една игра" },
  streak250: { name: "В кондиция", icon: "🔥", desc: "Серия 250" },
  streak1000: { name: "Неудържим", icon: "☄️", desc: "Серия 1000 (Огнен скин)" },
  evolve1: { name: "Еволюция", icon: "🌟", desc: "Развий оръжие" },
  evolve3: { name: "Ковач на легенди", icon: "⚒️", desc: "3 еволюции в една игра" },
  coop: { name: "Дружина", icon: "🤝", desc: "Изиграй кооп игра" },
  tasks10: { name: "Изпълнителен", icon: "🎯", desc: "Изпълни 10 задачи на вълни" },
  tasks50: { name: "Ветеран на задачите", icon: "🎯", desc: "Изпълни 50 задачи на вълни" },
  cursed: { name: "Прокълнат", icon: "🧿", desc: "Стигни вълна 10 с поне 3 проклятия" },
  level50: { name: "Ниво 50", icon: "⭐", desc: "Стигни ниво 50 в една игра" },
  veteran: { name: "Ветеран", icon: "🎖️", desc: "Изиграй 25 игри" },
  allHeroes: { name: "Всички герои", icon: "🧑‍🤝‍🧑", desc: "Отключи всички 9 героя" },
};

export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
