export interface TriviaQuestion {
  /** Stable id used to avoid repeating a question. */
  key: string;
  category: string;
  question: string;
  /** The answer shown to players. */
  answer: string;
  /** Other spellings / short forms that also count as correct. */
  aliases: string[];
}

import { CITIES, COUNTRIES, ELEMENTS, EXTRA, LANDMARKS, PEAKS, RIVERS } from "./data.js";

type Raw = [category: string, question: string, answer: string, wrong: [string, string, string]];

// Built-in Bulgarian question bank. Each entry is [category, question, answer, (unused wrong answers)].
// Players type the answer freely, so ALIASES lists the other forms that should be accepted.
const RAW: Raw[] = [
  // --- България ---
  ["България", "Коя е столицата на България?", "София", ["Пловдив", "Варна", "Бургас"]],
  ["България", "Кой е най-високият връх в България?", "Мусала", ["Вихрен", "Ботев", "Чепън"]],
  ["България", "Коя е най-дългата река, която тече изцяло в България?", "Искър", ["Марица", "Струма", "Тунджа"]],
  ["България", "През коя година е Освобождението на България от османско владичество?", "1878", ["1908", "1885", "1913"]],
  ["България", "През коя година е основана Първата българска държава?", "681", ["865", "1018", "1185"]],
  ["България", "Коя е първата столица на Първото българско царство?", "Плиска", ["Преслав", "Търново", "Охрид"]],
  ["България", "Кой цар покръства българите през 865 г.?", "Борис I", ["Симеон I", "Петър I", "Иван Асен II"]],
  ["България", "Кой е авторът на романа „Под игото“?", "Иван Вазов", ["Пейо Яворов", "Христо Ботев", "Алеко Константинов"]],
  ["България", "Кой е авторът на „Железният светилник“?", "Димитър Талев", ["Димитър Димов", "Йордан Йовков", "Елин Пелин"]],
  ["България", "Кой светец е основателят на Рилския манастир?", "Свети Иван Рилски", ["Свети Климент Охридски", "Свети Наум", "Свети Георги"]],
  ["България", "Коя река е естествената северна граница на България с Румъния?", "Дунав", ["Марица", "Тиса", "Прут"]],
  ["България", "Кой празник се чества на 3 март?", "Освобождението на България", ["Съединението", "Независимостта", "Денят на Ботев"]],
  // --- География ---
  ["География", "Коя е столицата на Австралия?", "Канбера", ["Сидни", "Мелбърн", "Пърт"]],
  ["География", "Коя е столицата на Канада?", "Отава", ["Торонто", "Монреал", "Ванкувър"]],
  ["География", "Коя е столицата на Турция?", "Анкара", ["Истанбул", "Измир", "Анталия"]],
  ["География", "Коя е столицата на Япония?", "Токио", ["Киото", "Осака", "Сеул"]],
  ["География", "Коя е най-голямата държава по площ?", "Русия", ["Канада", "Китай", "САЩ"]],
  ["География", "Коя е най-малката държава в света?", "Ватикана", ["Монако", "Сан Марино", "Лихтенщайн"]],
  ["География", "Кой е най-големият океан?", "Тихият", ["Атлантическият", "Индийският", "Северният ледовит"]],
  ["География", "На кой континент се намира пустинята Сахара?", "Африка", ["Азия", "Южна Америка", "Австралия"]],
  ["География", "Кой е най-високият връх на Земята?", "Еверест", ["К2", "Монблан", "Килиманджаро"]],
  ["География", "Колко континента има на Земята (по общоприетото деление)?", "7", ["5", "6", "8"]],
  ["География", "През коя държава протича река Сена?", "Франция", ["Германия", "Италия", "Испания"]],
  // --- Наука ---
  ["Наука", "Какъв е химичният символ на златото?", "Au", ["Ag", "Gd", "Go"]],
  ["Наука", "Коя планета е най-близо до Слънцето?", "Меркурий", ["Венера", "Марс", "Земята"]],
  ["Наука", "Коя е най-голямата планета в Слънчевата система?", "Юпитер", ["Сатурн", "Нептун", "Уран"]],
  ["Наука", "Коя планета наричаме „Червената планета“?", "Марс", ["Венера", "Юпитер", "Меркурий"]],
  ["Наука", "Каква е химичната формула на водата?", "H2O", ["CO2", "O2", "NaCl"]],
  ["Наука", "Кой газ има най-голям дял в земната атмосфера?", "Азот", ["Кислород", "Въглероден диоксид", "Аргон"]],
  ["Наука", "Колко кости има тялото на възрастния човек?", "206", ["180", "250", "312"]],
  ["Наука", "Кой е най-твърдият естествен материал?", "Диамантът", ["Златото", "Кварцът", "Желязото"]],
  ["Наука", "При колко градуса по Целзий кипи водата (при нормално налягане)?", "100", ["90", "110", "120"]],
  ["Наука", "Кой орган изпомпва кръвта в човешкото тяло?", "Сърцето", ["Черният дроб", "Белите дробове", "Бъбреците"]],
  ["Наука", "Колко е 7 × 8?", "56", ["54", "48", "64"]],
  ["Наука", "Кой учен е свързван с откриването на закона за всемирното привличане?", "Исак Нютон", ["Алберт Айнщайн", "Галилео Галилей", "Никола Тесла"]],
  // --- История и култура ---
  ["История", "През коя година завършва Втората световна война?", "1945", ["1939", "1918", "1953"]],
  ["История", "През коя година пада Берлинската стена?", "1989", ["1991", "1975", "1980"]],
  ["История", "През коя година потъва „Титаник“?", "1912", ["1905", "1920", "1898"]],
  ["История", "Кой е първият човек, стъпил на Луната?", "Нийл Армстронг", ["Бъз Олдрин", "Юрий Гагарин", "Джон Глен"]],
  ["Култура", "Кой е нарисувал „Мона Лиза“?", "Леонардо да Винчи", ["Микеланджело", "Рафаело", "Пабло Пикасо"]],
  ["Култура", "Кой е авторът на „Хамлет“?", "Уилям Шекспир", ["Чарлз Дикенс", "Ернест Хемингуей", "Данте Алигиери"]],
  ["Култура", "В коя страна са възникнали древните Олимпийски игри?", "Гърция", ["Италия", "Египет", "Турция"]],
  ["Култура", "Кой е авторът на книгите за Хари Потър?", "Дж. К. Роулинг", ["Дж. Р. Р. Толкин", "Стивън Кинг", "Рик Риърдън"]],
  ["Спорт", "Колко играчи от един отбор са на терена във футболен мач?", "11", ["9", "10", "12"]],
  // --- Игри и забавление ---
  ["Игри", "Коя принцеса спасява Марио в повечето игри на Nintendo?", "Прасковка (Peach)", ["Зелда", "Дейзи", "Розалина"]],
  ["Игри", "Как се казват зелените експлодиращи същества в Minecraft?", "Крипъри", ["Зомбита", "Ендърмени", "Скелети"]],
  ["Игри", "Как се казва главният герой в серията The Legend of Zelda?", "Линк", ["Зелда", "Ганон", "Мидна"]],
  ["Игри", "Коя компания е разработчикът на Diablo?", "Blizzard Entertainment", ["Valve", "Riot Games", "Bethesda"]],
  ["Игри", "Коя компания разработва Path of Exile?", "Grinding Gear Games", ["Blizzard", "Obsidian", "CD Projekt"]],
  ["Игри", "Коя компания разработва Dota 2?", "Valve", ["Riot Games", "Epic Games", "Activision"]],
  ["Игри", "Колко играчи има във всеки отбор в Dota 2?", "5", ["4", "6", "10"]],
  ["Игри", "Кой е главният герой в поредицата „Вещерът“?", "Гералт от Ривия", ["Геральт Гвинт", "Йенефер", "Лютичето"]],
  ["Игри", "От какъв тип е покемонът Пикачу?", "Електрически", ["Огнен", "Воден", "Тревен"]],
  ["Кино", "Как се казва главният герой във филма „Матрицата“?", "Нео", ["Морфей", "Тринити", "Смит"]],
];

const ALIASES: Record<string, string[]> = {
  "Прасковка (Peach)": ["прасковка", "праскова", "peach", "принцеса праскова"],
  "Исак Нютон": ["нютон", "newton", "исак нютон", "isaac newton"],
  "Борис I": ["борис", "борис 1", "борис първи", "цар борис"],
  "Дж. К. Роулинг": ["роулинг", "rowling", "jk rowling", "дж к роулинг", "джоан роулинг"],
  "Леонардо да Винчи": ["да винчи", "леонардо", "davinci", "da vinci", "леонардо да винчи"],
  "Нийл Армстронг": ["армстронг", "нийл", "neil armstrong", "armstrong"],
  "Уилям Шекспир": ["шекспир", "shakespeare", "уилям шекспир"],
  "Иван Вазов": ["вазов", "иван вазов"],
  "Димитър Талев": ["талев", "димитър талев"],
  "Свети Иван Рилски": ["иван рилски", "рилски", "св иван рилски", "свети иван рилски"],
  "Blizzard Entertainment": ["blizzard", "близард", "близзард", "blizzard entertainment"],
  "Grinding Gear Games": ["ggg", "grinding gear", "grinding gear games"],
  "Valve": ["валв", "valve software"],
  "Гералт от Ривия": ["гералт", "geralt", "геральт", "гералт от ривия"],
  "Тихият": ["тихия", "тихи океан", "тихият океан", "тихия океан", "pacific"],
  "Диамантът": ["диамант", "диамантът", "diamond"],
  "Сърцето": ["сърце", "сърцето", "heart"],
  "Крипъри": ["крипър", "крипъри", "creeper", "creepers", "крийпър", "крийпъри"],
  "Азот": ["азот", "nitrogen", "n2"],
  "Русия": ["русия", "russia", "ссср"],
  "Африка": ["африка", "africa"],
  "Дунав": ["дунав", "danube", "река дунав"],
  "Искър": ["искър", "iskar", "река искър"],
  "Еверест": ["еверест", "everest", "връх еверест", "джомолунгма"],
  "Ватикана": ["ватикана", "ватикан", "vatican"],
  "Токио": ["токио", "tokyo"],
  "Канбера": ["канбера", "canberra"],
  "Отава": ["отава", "ottawa"],
  "Анкара": ["анкара", "ankara"],
  "Електрически": ["електрически", "електричество", "електрически тип", "electric"],
  "Нео": ["нео", "neo", "томас андерсън"],
  "Линк": ["линк", "link"],
  "Гърция": ["гърция", "древна гърция", "greece", "елада"],
  "Франция": ["франция", "france"],
  "Освобождението на България": ["освобождението", "освобождението на българия", "освобождение", "ден на освобождението"],
  "Мусала": ["мусала", "musala", "връх мусала"],
  "Плиска": ["плиска", "pliska"],
  "Au": ["au", "злато", "аурум"],
  "Юпитер": ["юпитер", "jupiter"],
  "Марс": ["марс", "mars"],
  "Меркурий": ["меркурий", "mercury"],
  "Хамлет": ["хамлет", "hamlet"],
};

const split = (v: string | undefined) => (v ? v.split(",").map((x) => x.trim()).filter(Boolean) : []);

export function buildQuestion(category: string, question: string, answer: string, aliases: string[] = [], key?: string): TriviaQuestion {
  return { key: key ?? `${category}:${question}`, category, question, answer, aliases: [...(ALIASES[answer] ?? []), ...aliases] };
}

const lines = (block: string) => block.split("\n").map((l) => l.trim()).filter(Boolean);

// ---------------------------------------------------------------- the static pool

const pool: TriviaQuestion[] = [];

for (const [c, q, a] of RAW) pool.push(buildQuestion(c, q, a));

for (const line of lines(EXTRA)) {
  const [category, question, answer, aliases] = line.split("|");
  pool.push(buildQuestion(category!, question!, answer!, split(aliases)));
}

interface Country {
  name: string;
  capital: string;
  continent: string;
  nameAliases: string[];
  capitalAliases: string[];
}
const countries: Country[] = lines(COUNTRIES).map((line) => {
  const [name, capital, continent, na, ca] = line.split("|");
  return { name: name!, capital: capital!, continent: continent ?? "", nameAliases: split(na), capitalAliases: split(ca) };
});
// A capital with the same name as its country would give the answer away in the reverse question.
const sameName = (c: Country) => c.name.toLowerCase() === c.capital.toLowerCase();
for (const c of countries) {
  pool.push(buildQuestion("География", `Коя е столицата на ${c.name}?`, c.capital, c.capitalAliases));
  if (!sameName(c)) {
    pool.push(buildQuestion("География", `${c.capital} е столица на коя държава?`, c.name, c.nameAliases));
  }
  if (c.continent) {
    pool.push(
      buildQuestion("География", `На кой континент се намира ${c.name}?`, c.continent, c.continent === "Австралия и Океания" ? ["океания", "австралия"] : []),
    );
  }
}

interface Element {
  z: number;
  symbol: string;
  name: string;
  aliases: string[];
}
const elements: Element[] = lines(ELEMENTS).map((line) => {
  const [z, symbol, name, aliases] = line.split("|");
  return { z: Number(z), symbol: symbol!, name: name!, aliases: split(aliases) };
});
for (const e of elements) {
  pool.push(buildQuestion("Химия", `Кой е химичният символ на елемента ${e.name}?`, e.symbol));
  pool.push(buildQuestion("Химия", `Кой химичен елемент има символ ${e.symbol}?`, e.name, e.aliases));
  if (e.z <= 36) pool.push(buildQuestion("Химия", `Кой е атомният номер на елемента ${e.name}?`, String(e.z)));
}

// Templated questions from "left|right|aliases" tables.
function fromTable(block: string, category: string, make: (left: string, right: string) => string) {
  for (const line of lines(block)) {
    const [left, right, aliases] = line.split("|");
    pool.push(buildQuestion(category, make(left!, right!), right!, split(aliases)));
  }
}
fromTable(CITIES, "География", (city) => `В коя държава се намира град ${city}?`);
fromTable(LANDMARKS, "География", (mark) => `В кой град се намира ${mark}?`);
fromTable(PEAKS, "География", (peak) => `В коя държава се намира връх ${peak}?`);
fromTable(RIVERS, "География", (river) => `През кой град тече река ${river}?`);

// The same question can appear in two tables; keep the first.
{
  const seenKeys = new Set<string>();
  for (let i = pool.length - 1; i >= 0; i--) {
    if (seenKeys.has(pool[i]!.key)) pool.splice(i, 1);
    else seenKeys.add(pool[i]!.key);
  }
}

// ---------------------------------------------------------------- generated on the fly

function rnd(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** A fresh arithmetic question — practically endless. */
export function randomMath(): TriviaQuestion {
  const type = rnd(0, 7);
  let q = "";
  let a = 0;
  switch (type) {
    case 0: {
      const x = rnd(120, 980);
      const y = rnd(120, 980);
      q = `${x} + ${y} = ?`;
      a = x + y;
      break;
    }
    case 1: {
      const x = rnd(300, 999);
      const y = rnd(100, x - 1);
      q = `${x} − ${y} = ?`;
      a = x - y;
      break;
    }
    case 2: {
      const x = rnd(12, 40);
      const y = rnd(3, 19);
      q = `${x} × ${y} = ?`;
      a = x * y;
      break;
    }
    case 3: {
      const y = rnd(3, 19);
      const r = rnd(4, 40);
      q = `${y * r} ÷ ${y} = ?`;
      a = r;
      break;
    }
    case 4: {
      const x = rnd(11, 35);
      q = `Колко е ${x}² (${x} на квадрат)?`;
      a = x * x;
      break;
    }
    case 5: {
      const x = rnd(6, 30);
      q = `Колко е корен квадратен от ${x * x}?`;
      a = x;
      break;
    }
    case 6: {
      const p = [10, 20, 25, 50, 75][rnd(0, 4)]!;
      const base = rnd(2, 30) * 20;
      q = `Колко е ${p}% от ${base}?`;
      a = (base * p) / 100;
      break;
    }
    default: {
      const start = rnd(2, 12);
      const step = rnd(2, 9);
      const seq = [0, 1, 2, 3].map((i) => start + step * i);
      q = `Продължи редицата: ${seq.join(", ")}, ?`;
      a = start + step * 4;
    }
  }
  return buildQuestion("Математика", q, String(a), [], `math:${q}`);
}

function scramble(word: string): string {
  const letters = [...word.toUpperCase()];
  for (let tries = 0; tries < 10; tries++) {
    for (let i = letters.length - 1; i > 0; i--) {
      const j = rnd(0, i);
      [letters[i], letters[j]] = [letters[j]!, letters[i]!];
    }
    if (letters.join("") !== word.toUpperCase()) break;
  }
  return letters.join(" ");
}

const anagramWords: Array<[string, string]> = [
  ...countries.filter((c) => !c.name.includes(" ") && c.name.length >= 5).map((c): [string, string] => ["държава", c.name]),
  ...countries.filter((c) => !c.capital.includes(" ") && c.capital.length >= 5).map((c): [string, string] => ["столица", c.capital]),
  ...elements.filter((e) => e.name.length >= 5).map((e): [string, string] => ["химичен елемент", e.name]),
];

/** A fresh anagram ("unscramble the letters"), the classic IRC trivia filler. */
export function randomAnagram(): TriviaQuestion {
  const [kind, word] = anagramWords[rnd(0, anagramWords.length - 1)]!;
  return buildQuestion("Анаграма", `Подреди буквите (${kind}): ${scramble(word)}`, word, [], `anagram:${word}`);
}

// ---------------------------------------------------------------- categories and decks

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const GENERATED = ["Математика", "Анаграма"];
export const CATEGORIES: string[] = [...new Set([...pool.map((p) => p.category), ...GENERATED])].sort((a, b) => a.localeCompare(b, "bg"));

/** Resolve a user-typed word ("геогр", "math") to a category name. */
export function resolveCategory(token: string): string | null {
  const t = token.toLowerCase();
  const aliases: Record<string, string> = { math: "Математика", maths: "Математика", "мат": "Математика", chem: "Химия", games: "Игри", geo: "География" };
  if (aliases[t]) return aliases[t]!;
  if (t.length < 3) return null;
  return CATEGORIES.find((c) => c.toLowerCase().startsWith(t)) ?? null;
}

/**
 * A shuffled deck of unseen Bulgarian questions (static pool minus `seen`), optionally limited to some
 * categories, with fresh math and anagrams mixed in. The caller records what it asks in `seen`; when the
 * deck comes back empty everything has been seen, so the caller clears `seen` and asks again.
 */
export function buildDeck(categories: string[] | null, seen: Set<string>): TriviaQuestion[] {
  const want = (c: string) => !categories || categories.includes(c);
  const fresh = pool.filter((p) => want(p.category) && !seen.has(p.key));
  const extra: TriviaQuestion[] = [];
  const n = categories ? 40 : 25;
  if (want("Математика")) for (let i = 0; i < n; i++) extra.push(randomMath());
  if (want("Анаграма")) for (let i = 0; i < n; i++) extra.push(randomAnagram());
  // Pick categories evenly instead of by size, otherwise the ~700 geography questions would
  // drown out everything else.
  const byCat = new Map<string, TriviaQuestion[]>();
  for (const q of shuffle([...fresh, ...extra])) byCat.set(q.category, [...(byCat.get(q.category) ?? []), q]);
  const deck: TriviaQuestion[] = [];
  while (byCat.size) {
    const names = [...byCat.keys()];
    const name = names[Math.floor(Math.random() * names.length)]!;
    const list = byCat.get(name)!;
    deck.push(list.pop()!);
    if (list.length === 0) byCat.delete(name);
  }
  return deck;
}

/** How many distinct questions the built-in pool holds (math and anagrams come on top of that). */
export const POOL_SIZE = pool.length;

// ---------------------------------------------------------------- English (online) sources

let opentdbToken: string | null = null;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
  return (await res.json()) as T;
}

async function fromOpenTdb(count: number): Promise<TriviaQuestion[] | null> {
  try {
    if (!opentdbToken) {
      const t = await getJson<{ token?: string }>("https://opentdb.com/api_token.php?command=request");
      opentdbToken = t.token ?? null;
    }
    const url = `https://opentdb.com/api.php?amount=${count}&type=multiple&encode=url3986${opentdbToken ? `&token=${opentdbToken}` : ""}`;
    let json = await getJson<{ response_code: number; results: { category: string; question: string; correct_answer: string }[] }>(url);
    if (json.response_code === 4 && opentdbToken) {
      // every question of this session has been served once — start over
      await getJson(`https://opentdb.com/api_token.php?command=reset&token=${opentdbToken}`);
      json = await getJson(url);
    }
    if (json.response_code !== 0 || !json.results?.length) return null;
    const dec = (s: string) => decodeURIComponent(s);
    return json.results.map((r) => buildQuestion(dec(r.category), dec(r.question), dec(r.correct_answer), [], `en:${dec(r.question)}`));
  } catch {
    return null;
  }
}

async function fromTriviaApi(count: number): Promise<TriviaQuestion[] | null> {
  try {
    const json = await getJson<{ category: string; question: { text: string }; correctAnswer: string }[]>(
      `https://the-trivia-api.com/v2/questions?limit=${count}`,
    );
    if (!Array.isArray(json) || json.length === 0) return null;
    return json.map((r) => buildQuestion(r.category.replace(/_/g, " "), r.question.text, r.correctAnswer, [], `en:${r.question.text}`));
  } catch {
    return null;
  }
}

/**
 * English questions from free online question banks (thousands of them): Open Trivia DB first (with a
 * session token so it never repeats until it runs out), The Trivia API as the fallback. Questions with
 * long answers are dropped — they're no fun to type.
 */
export async function fetchEnglish(count: number): Promise<TriviaQuestion[] | null> {
  const got = (await fromOpenTdb(Math.min(count * 2, 50))) ?? (await fromTriviaApi(Math.min(count * 2, 50)));
  const usable = got?.filter((q) => q.answer.length <= 32);
  return usable && usable.length ? usable : null;
}
