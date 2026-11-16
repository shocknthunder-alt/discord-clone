/**
 * @mentions: "@username" (usernames may contain spaces — we look for each known name), plus
 * "@everyone" / "@here" (both = everybody in the server). Shared by the server (who to notify)
 * and the client (highlighting).
 */

const WORD_CHAR = /[\p{L}\p{N}_]/u;

/** Is `@name` in `text` as a whole name (not the start of a longer one)? Case-insensitive. */
export function hasMention(text: string, name: string): boolean {
  if (!name) return false;
  const hay = text.toLowerCase();
  const needle = `@${name.toLowerCase()}`;
  let i = hay.indexOf(needle);
  while (i >= 0) {
    const before = i > 0 ? hay[i - 1] : "";
    const after = hay[i + needle.length] ?? "";
    if ((!before || !WORD_CHAR.test(before)) && (!after || !WORD_CHAR.test(after))) return true;
    i = hay.indexOf(needle, i + 1);
  }
  return false;
}

export function mentionsEveryone(text: string): boolean {
  return hasMention(text, "everyone") || hasMention(text, "here");
}

/** Does this message mention the person called `myName` (directly or via @everyone/@here)? */
export function mentionsUser(text: string, myName: string | undefined | null): boolean {
  if (!text || !text.includes("@")) return false;
  return mentionsEveryone(text) || (!!myName && hasMention(text, myName));
}
