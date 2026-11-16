import { tr } from "../i18n";

/** Forum topic text "# Title\nrest" → { title, rest } (markdown symbols stripped from the title). */
export function splitTopic(content: string): { title: string; rest: string } {
  const [first = "", ...more] = content.split("\n");
  const title = first.replace(/^#{1,3}\s+/, "").replace(/[*_~`|]/g, "").trim();
  return { title: title || tr("(без заглавие)", "(untitled)"), rest: more.join("\n").trim() };
}
