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

/** How well a song matches the typed words (0 = not every word found). Higher = better. */
export function matchScore(query: string, song: { title: string; artist: string; album?: string }): number {
  const wanted = words(query);
  if (wanted.length === 0) return 0;
  const titleWords = words(song.title);
  const artistWords = words(song.artist);
  const albumWords = words(song.album ?? "");
  const all = [...titleWords, ...artistWords, ...albumWords];
  let score = 0;
  for (const w of wanted) {
    const exact = all.includes(w);
    // A word started but not finished ("tutur"). Not the other way round: "tuturutka" ≠ "tutu".
    const partial = exact || all.some((a) => w.length >= 3 && a.startsWith(w));
    if (!partial) return 0;
    score += exact ? 2 : 1;
    if (titleWords.includes(w) || titleWords.some((t) => w.length >= 3 && t.startsWith(w))) score += 1; // title words matter most
  }
  // Fewer extra words in the title = closer to what was asked for.
  score -= Math.max(0, titleWords.length - wanted.length) * 0.1;
  return score;
}

/** The best result that matches every typed word, or null (→ search YouTube). */
export function bestSongMatch<T extends { title: string; artist: string; album?: string }>(query: string, songs: T[]): T | null {
  let best: T | null = null;
  let bestScore = 0;
  for (const s of songs) {
    const sc = matchScore(query, s);
    if (sc > bestScore) {
      best = s;
      bestScore = sc;
    }
  }
  return best;
}
