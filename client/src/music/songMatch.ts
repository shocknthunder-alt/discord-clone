// Does a yogurthub search result really match what was typed? Its search is loose: "Tuturutka
// magazin" came back with another Magazin song, which then played. Now every word typed has to be
// found in the song's title/artist (Latin and Cyrillic count as the same, č = c, etc.), otherwise
// the search goes to YouTube instead.

const CYR: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", ђ: "dj", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
  ј: "j", к: "k", л: "l", љ: "lj", м: "m", н: "n", њ: "nj", о: "o", п: "p", р: "r", с: "s", т: "t",
  ћ: "c", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", џ: "dz", ш: "sh", щ: "sht", ъ: "a", ы: "y", ь: "",
  э: "e", ю: "yu", я: "ya", ї: "i", і: "i", є: "e", ґ: "g",
};

/** Lowercase Latin letters and digits only, words separated by single spaces. */
export function normalizeForMatch(text: string): string {
  const lower = text.toLowerCase();
  let out = "";
  for (const ch of lower) out += CYR[ch] ?? ch;
  return (
    out
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // č → c, é → e …
      .replace(/đ/g, "dj")
      .replace(/ß/g, "ss")
      // Different spellings of the same sounds: "zh"/"z", "ch"/"c", "sh"/"s", "dj"/"d" …
      .replace(/zh/g, "z")
      .replace(/ch/g, "c")
      .replace(/sh/g, "s")
      .replace(/dj|dz/g, "d")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
  );
}

function words(text: string): string[] {
  return normalizeForMatch(text)
    .split(" ")
    .filter((w) => w.length >= 2);
}

// Words that mark "not the original studio recording". A version is only wanted when it's typed
// ("… remix", "… live"); otherwise the plain studio track wins over remixes, live takes, mixes, covers.
// Written as normalizeForMatch() leaves them (Cyrillic already turned into Latin: "ремикс" → "remiks").
const VERSION_WORDS = new Set([
  "remix", "remixes", "rmx", "remiks", "mix", "miks", "megamix", "mashup", "bootleg", "rework", "flip", "vip", "dub",
  "live", "zivo", "concert", "koncert", "unplugged", "session", "sessions", "rehearsal", "tour",
  "acoustic", "akustik", "akusticna", "cover", "kavar", "tribute", "karaoke", "instrumental", "instrumentalna",
  "edit", "version", "ver", "demo", "extended", "club", "nightcore", "slowed", "sped", "reverb",
  "lofi", "8d", "orchestral", "symphonic", "piano", "medley", "reprise", "intro", "skit", "interlude", "fx", "backing",
]);
// Near-originals: a radio edit / extended cut is still the studio recording — a smaller step back.
const LIGHT_VERSION_WORDS = new Set(["edit", "extended"]);
// Live albums whose name says so without the word "live" ("Alive 2007").
const LIVE_ALBUM_WORDS = new Set(["alive", "mtv", "bbc", "wembley"]);
// Albums that collect songs instead of being the record they came out on (small nudge only).
const COMPILATION_WORDS = new Set([
  "hits", "best", "greatest", "collection", "anthology", "essential", "essentials", "compilation", "kolekcia", "gold", "singles",
]);
// Someone else's recording of the song, by the way its title says so (checked on the normalized title).
const NOT_THEIRS_PHRASES = ["made famous", "originally performed", "made popular", "popularized by", "popularised by", "in the style of", "as performed by", "tribute to", "karaoke version"];
// Artist names of cover / karaoke / tribute / mood-music uploads ("Masters Of Guitar", "Party Tyme Karaoke",
// "Various Artists", "Cast of …", "Acoustic Guitar & Nature").
const NOT_THE_ARTIST_WORDS = new Set([
  "karaoke", "tribute", "cover", "covers", "various", "cast", "masters", "players", "guitar", "piano", "nature",
  "acoustic", "instrumental", "orchestra", "lullaby", "kids", "party", "sound", "alike", "8bit", "hits", "gold",
]);
// Tiny words that don't identify an artist ("The", "&", "DJ").
const ARTIST_FILLER = new Set(["the", "and", "dj", "mc", "feat", "ft", "with"]);

interface Candidate {
  title: string;
  artist: string;
  album?: string;
  durationSeconds?: number;
  year?: number | null;
}

/** How well a song matches the typed words (0 = not every word found). Higher = better. */
export function matchScore(query: string, song: Candidate): number {
  const wanted = words(query);
  if (wanted.length === 0) return 0;
  const titleWords = words(song.title);
  const artistWords = words(song.artist);
  const albumWords = words(song.album ?? "");
  const all = [...titleWords, ...artistWords, ...albumWords];
  const typed = (w: string) => wanted.some((q) => q === w || (q.length >= 3 && w.startsWith(q)));
  let score = 20; // room for the penalties below without hitting 0 (= "doesn't match")
  for (const w of wanted) {
    const exact = all.includes(w);
    // A word started but not finished ("tutur"). Not the other way round: "tuturutka" ≠ "tutu".
    const partial = exact || all.some((a) => w.length >= 3 && a.startsWith(w));
    if (!partial) return 0;
    score += exact ? 2 : 1;
  }

  // WHO sings it matters most: "abba dancing queen" = ABBA's song, not "ABBA - Dancing Queen" uploaded by
  // a DJ, nor "Big Gun (as made famous by AC/DC)" by Masters Of Guitar.
  const artistKey = artistWords.filter((a) => !ARTIST_FILLER.has(a));
  const artistTyped = artistKey.filter(typed);
  if (artistKey.length && artistTyped.length === artistKey.length) score += 5;
  else if (artistTyped.length) score += 2;
  if (artistWords.some((a) => NOT_THE_ARTIST_WORDS.has(a) && !typed(a))) score -= 5;

  // Title words nobody typed ("(Live at Wembley 1986)", "feat. X") = further from what was asked for.
  score -= titleWords.filter((t) => !typed(t)).length * 0.4;
  const normTitle = titleWords.join(" ");
  if (NOT_THEIRS_PHRASES.some((p) => normTitle.includes(p))) score -= 6;
  // Remix / live / cover / … that wasn't asked for: clearly behind the studio original.
  const versionInTitle = new Set(titleWords.filter((t) => VERSION_WORDS.has(t) && !typed(t)));
  for (const v of versionInTitle) score -= LIGHT_VERSION_WORDS.has(v) ? 1.5 : 4;
  const versionInAlbum = new Set(albumWords.filter((t) => (VERSION_WORDS.has(t) || LIVE_ALBUM_WORDS.has(t)) && !LIGHT_VERSION_WORDS.has(t) && !typed(t)));
  score -= versionInAlbum.size * 2; // "Live in Sofia", "Remixes", "Karaoke Versions"
  if (albumWords.some((t) => COMPILATION_WORDS.has(t) && !typed(t))) score -= 0.5;
  // DJ mixes / hour-long sets and 30-second snippets aren't "the song".
  const d = song.durationSeconds ?? 0;
  if (d > 9 * 60 && !typed("mix")) score -= 2;
  if (d > 0 && d < 60) score -= 2;
  return Math.max(0.01, score); // still a match (every word was found), just a poor one
}

/** Scores for a whole result list, with a nudge (max +1) for the earliest release — the original came first. */
function scored<T extends Candidate>(query: string, songs: T[]) {
  const list = songs.map((s, i) => ({ s, i, sc: matchScore(query, s) }));
  const years = list.filter((x) => x.sc > 0 && x.s.year).map((x) => x.s.year!);
  const first = years.length ? Math.min(...years) : 0;
  for (const x of list) {
    if (x.sc > 0 && first && x.s.year) x.sc += Math.max(0, 1 - (x.s.year - first) * 0.1);
  }
  return list;
}

/** The best result that matches every typed word, or null (→ search YouTube). */
export function bestSongMatch<T extends Candidate>(query: string, songs: T[]): T | null {
  let best: { s: T; sc: number } | null = null;
  for (const x of scored(query, songs)) if (x.sc > 0 && (!best || x.sc > best.sc)) best = x;
  return best?.s ?? null;
}

/** All results, best match first (ties keep the server's order); ones that don't match every word go last. */
export function rankSongs<T extends Candidate>(query: string, songs: T[]): T[] {
  return scored(query, songs)
    .sort((a, b) => b.sc - a.sc || a.i - b.i)
    .map((x) => x.s);
}