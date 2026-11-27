import type { SurvAchId, SurvCurseId, SurvHeroId, SurvMapId, SurvMetaKey, SurvRuneId, SurvSkinId } from "@discord-clone/shared";

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
  | "plashilo"
  | "tebeshir";
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
    base: { dmg: 16, cd: 1.8, amount: 1, area: 1, speed: 0, pierce: 2, dur: 0 },
    ups: [{ dmg: 8 }, { pierce: 1 }, { amount: 1 }, { dmg: 8 }, { cd: 0.3 }, { pierce: 1 }, { amount: 1, dmg: 10 }],
    evo: { passive: "kafe", name: "Кулата на Тесла", desc: "Още светкавици, повече скокове и мълнии от небето." },
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
    // (2026-11-27: one extra bounce from the start — after a hit it goes on to the next enemy)
    base: { dmg: 9, cd: 1.3, amount: 1, area: 1, speed: 300, pierce: 2, dur: 3 },
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
  tebeshir: {
    id: "tebeshir",
    name: "Тебешир",
    desc: "Хвърля тебешир по най-близкия враг — отскача още към двама.",
    base: { dmg: 13, cd: 1.15, amount: 1, area: 1, speed: 560, pierce: 3, dur: 2 },
    ups: [{ dmg: 5 }, { amount: 1 }, { pierce: 1 }, { cd: 0.15 }, { dmg: 7 }, { amount: 1 }, { dmg: 10, pierce: 1 }],
    evo: { passive: "sirene", name: "Тебешири в три цвята", desc: "Отскача двойно повече и всеки удар вдига облак тебеширен прах." },
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
  /** quote = what the hero shouts when the skill goes off (a speech bubble) */
  skill: { name: string; desc: string; cd: number; quote: string };
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
    skill: { name: "Стадото", desc: "Две стада овце прегазват всичко от двете страни.", cd: 20, quote: "Ей, овчици — напрееед!" },
    look: { body: "#7a4a26", trim: "#efe4c8", hat: "#1e1a18", skin: "#e9bf96" },
  },
  tseko: {
    id: "tseko",
    name: "Киро Брейка",
    title: "Брейкърът",
    weapon: "tsarvul",
    bonus: "+1 броня, +10% бързина",
    stats: { armor: 1, speed: 0.1 },
    skill: { name: "Брейк на главата", desc: "6 секунди се върти на главата по-бързо — нищо не го лови, засмуква тълпата, мели и удря на всяка секунда, накрая огромен взрив, който зашеметява.", cd: 20, quote: "Брейк на главата, бате!" },
    look: { body: "#2457c7", trim: "#ffffff", hat: "#d9262e", skin: "#d9a57c" },
  },
  nikola: {
    id: "nikola",
    name: "Никола",
    title: "Даскалът по физика",
    weapon: "tebeshir",
    bonus: "+10% размер на атаките",
    stats: { area: 0.1 },
    skill: { name: "Верижна мълния", desc: "4 секунди мълнии скачат от враг на враг — 14 вериги по 9 скока, последната е двойна и удря 18.", cd: 20, quote: "Ток и жициии — AC/DC!" },
    look: { body: "#eef0f2", trim: "#2a3550", hat: "#d8d8d8", skin: "#f1cfac" },
  },
  gitsa: {
    id: "gitsa",
    name: "Спаска",
    title: "Майсторката на баници",
    weapon: "banitsa",
    bonus: "+0.4 живот в секунда",
    stats: { regen: 0.4 },
    skill: { name: "Тава баница", desc: "Пир: лекува всички с 60%, вдига падналите, +60% щети и +30% бързина за 8 с, и три все по-широки кръга горещи баници.", cd: 20, quote: "Кой е гладен? Баница за всички!" },
    look: { body: "#2a1d2e", trim: "#f4efe4", hat: "#c62f3a", skin: "#efc6a4" },
  },
  strahil: {
    id: "strahil",
    name: "Баткан",
    title: "Големият",
    weapon: "bradva",
    bonus: "+15% щети, +15% живот",
    stats: { might: 0.15, maxHp: 0.15 },
    skill: { name: "Вихър от брадви", desc: "5 секунди се върти с две брадви: смила всичко наоколо, придърпва враговете, поема половин щети; накрая хвърля 12 брадви.", cd: 20, quote: "Spin to Win, БАТкааа!" },
    look: { body: "#1b1b1d", trim: "#f2f2f2", hat: "#d4a640", skin: "#d9a57c" },
  },
  vela: {
    id: "vela",
    name: "Вела",
    title: "Самодивата",
    weapon: "martenitsa",
    bonus: "+15% бързина, +30% събиране",
    stats: { speed: 0.15, magnet: 0.3 },
    skill: { name: "Самодивско хоро", desc: "Замразява враговете наоколо за 5 секунди — замразените поемат двойни щети.", cd: 20, quote: "Хоро, самодиви — замръзни!" },
    look: { body: "#f4f1ff", trim: "#7ad1a0", hat: "#f2d36b", skin: "#f6dcc6" },
  },
  gosho: {
    id: "gosho",
    name: "Бай Гошууу",
    title: "Кукерът",
    weapon: "gaida",
    bonus: "+2 броня, −5% бързина",
    stats: { armor: 2, speed: -0.05 },
    skill: { name: "Звънци", desc: "Три вълни звън — всяка удря, отблъсква и зашеметява наоколо.", cd: 20, quote: "Дрън-дрън! Гоните ли се, бе?!" },
    look: { body: "#1f1b19", trim: "#e9e3d6", hat: "#b3262b", skin: "#c99a6c" },
  },
  mitko: {
    id: "mitko",
    name: "Митьо Крика",
    title: "Майсторът",
    weapon: "krik",
    bonus: "оръжията с 8% по-бързо",
    stats: { cooldown: 0.08 },
    skill: { name: "Наздраве!", desc: "10 секунди +60% щети и +30% бързина за всички, +15% живот.", cd: 20, quote: "Наздраве, майстори! До дъно!" },
    look: { body: "#1d2a5a", trim: "#ffffff", hat: "#3a3a3a", skin: "#eaa98a" },
  },
  stana: {
    id: "stana",
    name: "Стана",
    title: "Знахарката",
    weapon: "chesan",
    bonus: "+0.3 живот в секунда, +10% късмет",
    stats: { regen: 0.3, luck: 0.1 },
    skill: { name: "Чумна отвара", desc: "8 секунди облак от отвара трови всичко около теб и лекува дружината; всеки отровен враг, който падне в него, се пръсва и разнася чумата нататък.", cd: 20, quote: "Баба знае билката — пий и мри!" },
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
  | "bearking"
  | "mimic"
  | "altar"
  | "velikan"
  | "gorskicar"
  | "blatnamaika"
  | "ledenvelikan";

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
  mimic: { id: "mimic", name: "Мимикът", hp: 5200, speed: 64, dmg: 28, r: 34, xp: 170, from: 999, boss: true },
  // 🎯 missions: the sanctuaries to break, and each map's final giant
  altar: { id: "altar", name: "Капище", hp: 260, speed: 0, dmg: 0, r: 30, xp: 0, from: 999 },
  velikan: { id: "velikan", name: "Великанът Балкан", hp: 16000, speed: 46, dmg: 34, r: 56, xp: 300, from: 999, boss: true, ranged: true },
  gorskicar: { id: "gorskicar", name: "Горският цар", hp: 21000, speed: 58, dmg: 36, r: 54, xp: 350, from: 999, boss: true, ranged: true },
  blatnamaika: { id: "blatnamaika", name: "Блатната майка", hp: 26000, speed: 40, dmg: 36, r: 58, xp: 400, from: 999, boss: true, ranged: true },
  ledenvelikan: { id: "ledenvelikan", name: "Леденият великан", hp: 32000, speed: 50, dmg: 40, r: 60, xp: 450, from: 999, boss: true, ranged: true },
};

export const ENEMY_IDS = Object.keys(ENEMIES) as EnemyId[];
/** the easier ones come first (shuffled among themselves), then the rest — no boss twice until all were seen */
export const BOSS_EASY: EnemyId[] = ["karak", "mora", "lamia", "kukerchief"];
export const BOSS_HARD: EnemyId[] = ["wolfking", "chuma", "zmey", "hala", "vampking", "ispolin", "samqueen", "swampking", "ghostking", "bearking", "mimic"];
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
/** ☠️ each difficulty level teaches every boss one more spell, in this order (missing ones only) */
export const DIFF_MOVES: BossMove[] = ["nova", "wall", "meteors", "spiral", "summon", "firering", "acid", "blink", "leap", "shield"];
export const DIFF_SPELL_NAMES: Record<BossMove, string> = {
  leap: "☠️ Скок на гнева",
  firering: "☠️ Пъкленият обръч",
  meteors: "☠️ Звезден дъжд",
  shield: "☠️ Каменна кожа",
  summon: "☠️ Зов на ордата",
  nova: "☠️ Взрив на мрака",
  spiral: "☠️ Черна вихрушка",
  blink: "☠️ Сянка",
  wall: "☠️ Стената",
  acid: "☠️ Отровен дъжд",
};
export const DIFF_NAMES = ["Нормално", "Трудно I", "Трудно II", "Трудно III", "Кошмар I", "Кошмар II", "Кошмар III", "Пъкъл I", "Пъкъл II", "Пъкъл III", "Пъкъл IV"];
/** what a difficulty does (shown in the menu) */
export const diffText = (d: number) =>
  d === 0
    ? "Обичайната игра (вече не е лесна)."
    : `Врагове +${30 * d}% живот, +${15 * d}% щети, +${18 * d}% повече и по-бързи, още елитни; босовете +${30 * d}% живот и знаят ${d} нови магии${d >= 3 ? ", побесняват при 70%" : ""}. Награда: ×${(1 + 0.25 * d).toFixed(2)} злато, повече и по-редки предмети.`;

/* ───────────── 🎒 gear texts ───────────── */

/** item rarity: white → blue → yellow → orange, the classic loot colours */
export const RARITY: { name: string; color: string }[] = [
  { name: "Обикновен", color: "#c8c8c8" },
  { name: "Магически", color: "#8888ff" },
  { name: "Рядък", color: "#ffff77" },
  { name: "Уникален", color: "#e0782c" },
];
/** a line under the name of a unique item, by kind */
export const ITEM_FLAVOUR: Record<string, string> = {
  weapon: "Дядо ми го е носил. И неговият дядо. Никой не го е мил.",
  helmet: "Главата си пазиш — с нея мислиш. Понякога.",
  shoulders: "Тежко е на раменете, ама поне не духа.",
  armor: "Шито на ръка, по нощите, на светлината на свещ.",
  gloves: "Който хване, не пуска.",
  pants: "Широки отгоре, тесни отдолу — за бой и за хоро.",
  boots: "Минали са през три планини и едно блато.",
  amulet: "От баба — против уроки и против таласъми.",
  ring: "Пасва на всеки пръст. Подозрително.",
};
/** the line under a rare / unique name: what kind of thing it is */
export const KIND_TEXT: Record<string, string> = {
  weapon: "Оръжие",
  helmet: "Шапка",
  shoulders: "Наплечници",
  armor: "Дреха",
  gloves: "Ръкавици",
  pants: "Гащи",
  boots: "Обувки",
  amulet: "Амулет",
  ring: "Пръстен",
};
export const ITEM_TEXT: Record<string, { name: string; icon: string }> = {
  gega: { name: "Овчарска гега", icon: "🦯" },
  hlopka: { name: "Медна хлопка", icon: "🔔" },
  maratonki: { name: "Златни маратонки", icon: "👟" },
  kasket: { name: "Брейк каскет", icon: "🧢" },
  bobina: { name: "Показалката на даскала", icon: "📏" },
  kreda: { name: "Тебешир на даскала", icon: "🖍️" },
  tava: { name: "Медна тава", icon: "🍳" },
  tochilka: { name: "Точилка", icon: "🥖" },
  dvuraka: { name: "Двуръка брадва", icon: "🪓" },
  kolan: { name: "Борчески колан", icon: "🥋" },
  venets: { name: "Самодивски венец", icon: "💐" },
  pesen: { name: "Самодивска песен", icon: "🎵" },
  kozagaida: { name: "Козя гайда", icon: "🎶" },
  maska: { name: "Кукерска маска", icon: "👹" },
  hidrokrik: { name: "Хидравличен крик", icon: "🔧" },
  klyuch: { name: "Гаечен ключ", icon: "🔩" },
  hurka: { name: "Знахарска хурка", icon: "🪄" },
  bilki: { name: "Торба билки", icon: "🌿" },
  kozhuh: { name: "Кожух", icon: "🧥" },
  elek: { name: "Шит елек", icon: "🦺" },
  poyas: { name: "Тъкан пояс", icon: "🎗️" },
  yamurluk: { name: "Ямурлук", icon: "🧶" },
  muska: { name: "Муска", icon: "🧿" },
  sinchets: { name: "Синчец", icon: "🌼" },
  monista: { name: "Мониста", icon: "🪙" },
  oko: { name: "Синьо око", icon: "👁️" },
  pero: { name: "Змейово перо", icon: "🪶" },
  kalpak: { name: "Калпак", icon: "🎩" },
  shlem: { name: "Шлем на юнак", icon: "🪖" },
  kachulka: { name: "Знахарска качулка", icon: "🧙" },
  naplechnitsi: { name: "Кожени наплечници", icon: "🛡️" },
  valcha: { name: "Вълча кожа", icon: "🐺" },
  pelerina: { name: "Самодивска пелерина", icon: "🧣" },
  kovashki: { name: "Ковашки ръкавици", icon: "🧤" },
  pleteni: { name: "Плетени ръкавици", icon: "🧶" },
  strelets: { name: "Ръкавици на стрелец", icon: "🏹" },
  poturi: { name: "Потури", icon: "👖" },
  benevretsi: { name: "Беневреци", icon: "🩳" },
  shalvari: { name: "Шалвари", icon: "🩲" },
  botushi: { name: "Ботуши на хайдутин", icon: "🥾" },
  bivolski: { name: "Цървули от бивол", icon: "👞" },
  krilati: { name: "Крилати опинци", icon: "🪽" },
  srebaren: { name: "Сребърен пръстен", icon: "💍" },
  venchalen: { name: "Венчален пръстен", icon: "💍" },
  rubin: { name: "Пръстен с рубин", icon: "♦️" },
  pechat: { name: "Печат на царя", icon: "🔱" },
  zmiya: { name: "Змийски пръстен", icon: "🐍" },
};
export const SLOT_TEXT = {
  weapon: "Оръжие",
  helmet: "Шапка / шлем",
  shoulders: "Рамене",
  armor: "Гърди",
  gloves: "Ръкавици",
  pants: "Гащи",
  boots: "Обувки",
  amulet: "Амулет",
  ring: "Пръстен",
  ring1: "Пръстен",
  ring2: "Пръстен",
} as const;
/** an empty slot shows this */
export const SLOT_ICON: Record<string, string> = { weapon: "⚔️", helmet: "🪖", shoulders: "🦺", armor: "🧥", gloves: "🧤", pants: "👖", boots: "🥾", amulet: "📿", ring1: "💍", ring2: "💍" };
export const GEAR_STAT_TEXT: Record<string, (v: number) => string> = {
  might: (v) => `+${v}% щети`,
  maxHp: (v) => `+${v}% живот`,
  armor: (v) => `+${v} броня`,
  regen: (v) => `+${v} живот/с`,
  cooldown: (v) => `+${v}% презареждане`,
  area: (v) => `+${v}% обхват`,
  speed: (v) => `+${v}% бързина`,
  magnet: (v) => `+${v}% събиране`,
  luck: (v) => `+${v}% късмет`,
  crit: (v) => `+${v}% крит`,
  xp: (v) => `+${v}% опит`,
  greed: (v) => `+${v}% злато`,
  skillDmg: (v) => `+${v}% сила на умението`,
  skillCd: (v) => `−${v}% време за умението`,
  heroWeapon: (v) => `+${v}% щети на основното оръжие`,
  amount: () => `+1 снаряд`,
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
  mimic: [["leap", "🦷 Захлопване"], ["summon", "📦 Сандъчета"]],
  velikan: [["meteors", "🪨 Скалите на Балкана"], ["leap", "⛰️ Стъпката на великана"], ["nova", "💥 Удар в земята"]],
  gorskicar: [["summon", "🐺 Горската свита"], ["wall", "🌲 Стена от дървета"], ["leap", "🦌 Скок през гората"]],
  blatnamaika: [["acid", "🫧 Тинести мехури"], ["spiral", "🌀 Водовъртеж"], ["summon", "🐸 Децата на блатото"]],
  ledenvelikan: [["firering", "❄️ Леден обръч"], ["meteors", "🧊 Ледени късове"], ["wall", "🌨️ Виелица"]],
};

/** the final giants of the missions (one per map) */
export const FINAL_BOSSES: EnemyId[] = ["velikan", "gorskicar", "blatnamaika", "ledenvelikan"];

/* ───────────── 🗺️ maps (2026-11-27) ───────────── */

export interface MapDef {
  id: SurvMapId;
  name: string;
  icon: string;
  desc: string;
  /** the giant you call after the 5 sanctuaries */
  final: EnemyId;
  /** harder maps: more health / damage */
  hpMul: number;
  dmgMul: number;
  /** monsters this map has more of (they also come earlier) */
  favour: EnemyId[];
  /** ground colours (2D picture + 3D texture) */
  ground: { base: string; dark: string; light: string; specks: string[] };
  /** 3D light: sun colour + strength, sky / ground fill */
  light: { sun: number; sunI: number; sky: number; earth: number; skyI: number; clear: number };
  /** which scenery (3D) */
  props: "meadow" | "deadwood" | "swamp" | "mountain";
}
export const MAPS: Record<SurvMapId, MapDef> = {
  polyana: {
    id: "polyana",
    name: "Поляната",
    icon: "🌾",
    desc: "Селото, гробището и есенната гора. Тук всичко започва.",
    final: "velikan",
    hpMul: 1,
    dmgMul: 1,
    favour: [],
    ground: { base: "#3b5a2c", dark: "#2f4a23", light: "#4d7038", specks: ["#e8d84a", "#e86a8a", "#ffffff", "#9a7ae8"] },
    light: { sun: 0xfff0d8, sunI: 2.4, sky: 0xc8dcff, earth: 0x4a6a34, skyI: 1.25, clear: 0x263a1d },
    props: "meadow",
  },
  gora: {
    id: "gora",
    name: "Мъртвата гора",
    icon: "🌲",
    desc: "Изсъхнали дървета, вълци и гарвани. Слънцето почти не стига дотук.",
    final: "gorskicar",
    hpMul: 1.2,
    dmgMul: 1.1,
    favour: ["wolf", "werewolf", "raven", "spider", "bear"],
    ground: { base: "#2e3326", dark: "#22261c", light: "#3c4230", specks: ["#6a5a3a", "#8a7a5a", "#4a5a3a", "#9a3a2a"] },
    light: { sun: 0xc8c0ff, sunI: 1.4, sky: 0x8a90b8, earth: 0x2a2e22, skyI: 1.0, clear: 0x1a1e16 },
    props: "deadwood",
  },
  blato: {
    id: "blato",
    name: "Блатото",
    icon: "🐸",
    desc: "Тиня, мъгла и отрова. Блатниците излизат отрано.",
    final: "blatnamaika",
    hpMul: 1.45,
    dmgMul: 1.2,
    favour: ["blatnik", "witch", "zombie", "spider"],
    ground: { base: "#3a4428", dark: "#2c3520", light: "#4c5a30", specks: ["#7aa04a", "#a8c060", "#5a7a8a", "#c0d080"] },
    light: { sun: 0xe8ffc8, sunI: 1.7, sky: 0xa8c8a0, earth: 0x3a4a28, skyI: 1.2, clear: 0x20281a },
    props: "swamp",
  },
  planina: {
    id: "planina",
    name: "Пирин",
    icon: "🏔️",
    desc: "Сняг, ледени духове и кукери. Най-трудната карта.",
    final: "ledenvelikan",
    hpMul: 1.75,
    dmgMul: 1.3,
    favour: ["skeleton", "ghost", "yuda", "kuker", "wolf"],
    ground: { base: "#c8d2dc", dark: "#aab6c4", light: "#e4ecf4", specks: ["#ffffff", "#9aa8b8", "#7a8a9a", "#dfe8ff"] },
    light: { sun: 0xf4f8ff, sunI: 2.2, sky: 0xdce8ff, earth: 0x8a96a8, skyI: 1.3, clear: 0xa8b4c2 },
    props: "mountain",
  },
};
/** 🎯 a mission: break the sanctuaries, call the giant before this many seconds (or it comes by itself) */
export const MISSION_ALTARS = 5;
export const MISSION_SECONDS = 12 * 60;

/* ───────────── ⚡ gods + their gifts (2026-11-27) ───────────── */

export type GodId = "perun" | "veles" | "mokosh" | "dazhbog";
export const GODS: Record<GodId, { name: string; icon: string; color: string; blessing: string }> = {
  perun: { name: "Перун", icon: "⚡", color: "#7ab8ff", blessing: "мълниите удрят с 50% повече и по още 2 врага" },
  veles: { name: "Велес", icon: "🐍", color: "#7ad05a", blessing: "отровата е двойно по-силна" },
  mokosh: { name: "Мокош", icon: "🌾", color: "#f2c86a", blessing: "пелената се връща двойно по-бързо, веднъж те спасява от смърт" },
  dazhbog: { name: "Дажбог", icon: "☀️", color: "#ff9a3a", blessing: "слънчевите взривове са с 50% по-големи" },
};
export const GOD_IDS = Object.keys(GODS) as GodId[];
export type GiftId =
  | "perun_strike"
  | "perun_crit"
  | "perun_dash"
  | "perun_storm"
  | "veles_poison"
  | "veles_bloom"
  | "veles_skin"
  | "veles_fang"
  | "mokosh_veil"
  | "mokosh_water"
  | "mokosh_thread"
  | "mokosh_harvest"
  | "dazh_flare"
  | "dazh_burn"
  | "dazh_wheel"
  | "dazh_dawn";
export const GIFT_MAX = 3;

/* ───────────── 🔨 temper cards (after the build is full) + combos ───────────── */

export type TemperId = "might" | "hp" | "haste" | "crit" | "area" | "speed";
export const TEMPERS: Record<TemperId, { name: string; icon: string; desc: string; per: number }> = {
  might: { name: "Закалка: Сила", icon: "💪", desc: "+5% щети", per: 0.05 },
  hp: { name: "Закалка: Живот", icon: "❤️", desc: "+6% живот", per: 0.06 },
  haste: { name: "Закалка: Бързи ръце", icon: "⚡", desc: "+3% по-бързо презареждане", per: 0.03 },
  crit: { name: "Закалка: Око", icon: "🎯", desc: "+3% критичен удар", per: 0.03 },
  area: { name: "Закалка: Размах", icon: "🌀", desc: "+5% обхват на атаките", per: 0.05 },
  speed: { name: "Закалка: Крака", icon: "🏃", desc: "+3% бързина", per: 0.03 },
};
export const TEMPER_IDS = Object.keys(TEMPERS) as TemperId[];
/** stacks → effective stacks (each one is worth a bit less): 10 → 8, 20 → 13, 40 → 20 */
export const temperEff = (n: number) => n / (1 + n / 40);

/** 🔗 two specific weapons together wake a combo: both level 4+ = I, both level 8 (or evolved) = II */
export type ComboId = "gorburya" | "chesanprase" | "svatba" | "zakuska" | "zhatva" | "haiduti" | "prolet" | "roy" | "gramkrik" | "ognenkazan";
export interface ComboDef {
  name: string;
  icon: string;
  a: WeaponId;
  b: WeaponId;
  desc: (t: number) => string;
}
export const COMBOS: Record<ComboId, ComboDef> = {
  gorburya: { name: "Горяща буря", icon: "🔥⚡", a: "tesla", b: "rakia", desc: (t) => `мълниите на Теслата с ${20 + 15 * t}% шанс подпалват земята под врага` },
  chesanprase: { name: "Прасе с чесън", icon: "🐖🧄", a: "prase", b: "chesan", desc: (t) => `прасето трови и забавя всичко, което блъсне (${10 * t} отрова/с)` },
  svatba: { name: "Сватба", icon: "🎶", a: "gaida", b: "kaval", desc: (t) => `на всеки ${t === 1 ? 8 : 5} с хоро от звук отблъсква и удря всичко наоколо` },
  zakuska: { name: "Закуска", icon: "🥧🫘", a: "banitsa", b: "kazan", desc: (t) => `баниците и бобът се пръскат по съседите (${t === 1 ? "+50%" : "+100%"} площ)` },
  zhatva: { name: "Жътва", icon: "🌾🪓", a: "sarp", b: "bradva", desc: (t) => `сърпът и брадвата посичат обикновени врагове под ${t === 1 ? 15 : 25}% живот` },
  haiduti: { name: "Хайдути", icon: "🔫👞", a: "pishtov", b: "tsarvul", desc: (t) => `куршумите и цървулите зашеметяват (${t === 1 ? "0.4" : "0.8"} с) и отблъскват силно` },
  prolet: { name: "Пролет", icon: "🌸💧", a: "martenitsa", b: "kobilitsa", desc: (t) => `на всеки ${t === 1 ? 10 : 6} с лекува ${t === 1 ? 6 : 10}% и забавя враговете наоколо` },
  roy: { name: "Рояк", icon: "🐝🎃", a: "kosher", b: "plashilo", desc: (t) => `на всеки ${t === 1 ? 4 : 2.5} с облак пчели трови враговете около теб` },
  gramkrik: { name: "Гръмовен крик", icon: "📣⚡", a: "krik", b: "tesla", desc: (t) => `ударите на Крика пускат мълнии към ${t === 1 ? 3 : 5} врага наоколо` },
  ognenkazan: { name: "Огнен казан", icon: "🫘🔥", a: "kazan", b: "rakia", desc: (t) => `бобът с ${25 + 15 * t}% шанс избухва в пламъци` },
};
export const COMBO_IDS = Object.keys(COMBOS) as ComboId[];
export function comboTier(weapons: readonly { id: WeaponId; lvl: number; evo: boolean }[] | undefined, id: ComboId): number {
  const c = COMBOS[id];
  const a = weapons?.find((w) => w.id === c.a);
  const b = weapons?.find((w) => w.id === c.b);
  if (!a || !b) return 0;
  const top = (w: { lvl: number; evo: boolean }) => w.evo || w.lvl >= 8;
  if (top(a) && top(b)) return 2;
  return a.lvl >= 4 && b.lvl >= 4 ? 1 : 0;
}
/** combos a weapon belongs to (for the card hints) */
export const combosOf = (w: WeaponId) => COMBO_IDS.filter((c) => COMBOS[c].a === w || COMBOS[c].b === w);
export const TIER_ROMAN = ["", "I", "II", "III"];
/* ───────────── 🐾 pets ───────────── */

export const PET_TEXT: Record<string, { name: string; icon: string; desc: string }> = {
  svraka: { name: "Сврака", icon: "🐦", desc: "лети и ти носи кристалите с опит" },
  kotarak: { name: "Котаракът Мърко", icon: "🐈", desc: "събира монетите и торбите злато" },
  sharo: { name: "Шаро", icon: "🐕", desc: "тича и ти носи сандъците, раниците с предмети, реликвите и хляба" },
  zmeyche: { name: "Змейче", icon: "🐉", desc: "носи всичко — кристали, злато, сандъци и предмети, и по-бързо" },
};
/** what each pet fetches (gem kinds; 10..13 = items) */
export const PET_PICKS: Record<string, number[]> = {
  svraka: [0, 1, 2],
  kotarak: [3, 8],
  sharo: [4, 6, 9, 10, 11, 12, 13],
  zmeyche: [0, 1, 2, 3, 4, 6, 8, 9, 10, 11, 12, 13],
};

/** 🔥 after level 25 the hordes grow stronger every level — and drop more items */
export const HORDE_FROM = 25;
export const hordeOver = (level: number) => Math.max(0, level - HORDE_FROM);

/* ───────────── 💎 boss relics (for this game only) ───────────── */

/** a relic is named after the boss that drops it */
export type RelicId =
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
export const RELICS: Record<RelicId, { name: string; icon: string; desc: string }> = {
  karak: { name: "Рогът на Караконджула", icon: "🔥", desc: "претъркулването завършва с огнен взрив" },
  mora: { name: "Огледалото на Мора", icon: "🪞", desc: "1 от 5 удара по теб се отразява (не те наранява)" },
  lamia: { name: "Люспа от Ламята", icon: "🐍", desc: "+3 броня, +15% живот" },
  zmey: { name: "Сърцето на Змея", icon: "❤️‍🔥", desc: "веднъж: вместо да паднеш, ставаш с половин живот и огън наоколо" },
  hala: { name: "Окото на Хала", icon: "🌪️", desc: "+20% обхват, +10% бързина" },
  chuma: { name: "Торбата на Баба Чума", icon: "☠️", desc: "всеки твой удар трови врага" },
  wolfking: { name: "Зъбът на Вълчия цар", icon: "🐺", desc: "+20% бързина; всяко 10-о убийство лекува 4%" },
  vampking: { name: "Короната на Цар Вампир", icon: "🧛", desc: "2% от щетите ти те лекуват" },
  ispolin: { name: "Юмрукът на Исполина", icon: "👊", desc: "+20% сила, +10% живот" },
  samqueen: { name: "Венецът на Самодивската царица", icon: "🌸", desc: "+12% по-бързо презареждане, +0.5 живот/с" },
  swampking: { name: "Тинята на Блатния цар", icon: "🟢", desc: "враговете около теб са забавени" },
  kukerchief: { name: "Звънецът на Кукерския вожд", icon: "🔔", desc: "на всеки 6 с звън отблъсква и удря всичко наоколо" },
  ghostking: { name: "Плащът на Таласъмския цар", icon: "👻", desc: "+1 снаряд за всички оръжия" },
  bearking: { name: "Кожата на Мечия цар", icon: "🐻", desc: "+40% живот, +2 броня" },
};
export const RELIC_IDS = Object.keys(RELICS) as RelicId[];
export const isRelic = (id: string): id is RelicId => id in RELICS;
/** chance that a boss drops its relic (a "dark" boss of a later cycle: more) */
export const RELIC_CHANCE = 0.25;
export const RELIC_CHANCE_DARK = 0.4;

export const GIFTS: Record<GiftId, { god: GodId; name: string; icon: string; desc: (lvl: number) => string }> = {
  perun_strike: { god: "perun", name: "Гръмотевица", icon: "🌩️", desc: (l) => `на всеки ${(4 - 0.7 * l).toFixed(1)} с мълния удря ${1 + l} врага (${25 + 20 * l} щети)` },
  perun_crit: { god: "perun", name: "Перунов знак", icon: "ᛉ", desc: (l) => `+${7 * l}% критичен удар; критичните удари пускат мълния към съсед` },
  perun_dash: { god: "perun", name: "Гръмовен скок", icon: "💨", desc: (l) => `претъркулването завършва с гръм (${30 + 25 * l} щети)` },
  perun_storm: { god: "perun", name: "Буреносен гняв", icon: "⛈️", desc: (l) => `като те ударят, мълнии удрят ${3 + l} врага около теб` },
  veles_poison: { god: "veles", name: "Змийска отрова", icon: "🐍", desc: (l) => `ударите тровят: ${3 + 4 * l} щети в секунда за 3 с` },
  veles_bloom: { god: "veles", name: "Отровен цвят", icon: "🌺", desc: (l) => `${8 * l}% от убитите избухват в отровен облак` },
  veles_skin: { god: "veles", name: "Змийска кожа", icon: "🦎", desc: (l) => `+${l} броня, +${10 * l}% живот` },
  veles_fang: { god: "veles", name: "Вълчи зъб", icon: "🐺", desc: (l) => `+${6 * l}% щети, +${5 * l}% бързина` },
  mokosh_veil: { god: "mokosh", name: "Пелената на Мокош", icon: "🧶", desc: (l) => `на всеки ${14 - 2 * l} с пелена поема един удар` },
  mokosh_water: { god: "mokosh", name: "Жива вода", icon: "💧", desc: (l) => `+${(0.4 * l).toFixed(1)} живот/с, всяко ново ниво лекува ${8 * l}%` },
  mokosh_thread: { god: "mokosh", name: "Нишката на съдбата", icon: "🧵", desc: (l) => `+${8 * l}% късмет, +${15 * l}% злато` },
  mokosh_harvest: { god: "mokosh", name: "Жътва", icon: "🌾", desc: (l) => `+${10 * l}% опит, +${15 * l}% събиране` },
  dazh_flare: { god: "dazhbog", name: "Слънчев изблик", icon: "🌞", desc: (l) => `на всеки ${6 - l} с огнен взрив около теб (${20 + 18 * l} щети)` },
  dazh_burn: { god: "dazhbog", name: "Изгаряне", icon: "🔥", desc: (l) => `${10 * l}% от убитите избухват в пламъци` },
  dazh_wheel: { god: "dazhbog", name: "Слънчево колело", icon: "☸️", desc: (l) => `+${8 * l}% размер на атаките, +${8 * l}% скорост на снарядите` },
  dazh_dawn: { god: "dazhbog", name: "Зора", icon: "🌅", desc: (l) => `+${7 * l}% щети, +${10 * l}% щети по босове` },
};
export const GIFT_IDS = Object.keys(GIFTS) as GiftId[];

/* ───────────── ᚱ runes (permanent, worn in slots) ───────────── */

export const RUNE_TEXT: Record<SurvRuneId, { name: string; glyph: string; desc: (lvl: number) => string }> = {
  sila: { name: "Руна на силата", glyph: "ᛏ", desc: (l) => `+${6 * l}% щети` },
  zhivot: { name: "Руна на живота", glyph: "ᛒ", desc: (l) => `+${10 * l}% живот` },
  barzina: { name: "Руна на вятъра", glyph: "ᚱ", desc: (l) => `+${4 * l}% бързина` },
  vreme: { name: "Руна на времето", glyph: "ᛃ", desc: (l) => `оръжията с ${4 * l}% по-бързо` },
  kasmet: { name: "Руна на късмета", glyph: "ᚷ", desc: (l) => `+${6 * l}% късмет` },
  magnit: { name: "Руна на привличането", glyph: "ᛟ", desc: (l) => `+${15 * l}% събиране` },
  opit: { name: "Руна на мъдростта", glyph: "ᚨ", desc: (l) => `+${5 * l}% опит` },
  zlato: { name: "Руна на златото", glyph: "ᚠ", desc: (l) => `+${10 * l}% злато` },
  perun: { name: "Перунова руна", glyph: "⚡", desc: (l) => `започваш с дар от Перун (ниво ${l})` },
  veles: { name: "Велесова руна", glyph: "🐍", desc: (l) => `започваш с дар от Велес (ниво ${l})` },
  mokosh: { name: "Руна на Мокош", glyph: "🌾", desc: (l) => `започваш с дар от Мокош (ниво ${l})` },
  dazhbog: { name: "Дажбогова руна", glyph: "☀️", desc: (l) => `започваш с дар от Дажбог (ниво ${l})` },
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
  mission1: { name: "Великаноубиец", icon: "🗿", desc: "Спечели мисия" },
  missionAll: { name: "Покорител на Шмиркленд", icon: "🏔️", desc: "Спечели мисиите на всички карти" },
};

export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
