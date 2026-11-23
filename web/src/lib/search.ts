import type { Gender, IndexEntry } from "./data";

/** Lower case, no diacritics, single spaces: "JOSÉ  Aldo" -> "jose aldo". */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface Filters {
  gender?: Gender | "";
  division?: string;
}

export interface Searchable {
  entry: IndexEntry;
  key: string; // normalized name + nickname
  words: string[];
}

export function prepare(index: IndexEntry[]): Searchable[] {
  return index.map((entry) => {
    const name = normalize(entry.name);
    return {
      entry,
      key: entry.nickname ? `${name} ${normalize(entry.nickname)}` : name,
      words: name.split(" "),
    };
  });
}

/**
 * Ranks: full name starts with the query, then every query word starts a name word,
 * then the query appears anywhere (nickname included). Ties go to the most recent fight.
 */
export function search(items: Searchable[], query: string, filters: Filters = {}, limit = 8): IndexEntry[] {
  const q = normalize(query);
  const qWords = q ? q.split(" ") : [];
  const scored: { entry: IndexEntry; score: number }[] = [];
  for (const item of items) {
    const { entry } = item;
    if (filters.gender && entry.gender !== filters.gender) continue;
    if (filters.division && entry.weight_class !== filters.division) continue;
    let score: number;
    if (!q) score = 3;
    else if (item.key.startsWith(q)) score = 0;
    else if (qWords.every((w) => item.words.some((n) => n.startsWith(w)))) score = 1;
    else if (item.key.includes(q)) score = 2;
    else continue;
    scored.push({ entry, score });
  }
  scored.sort((x, y) => x.score - y.score || y.entry.last_fight.localeCompare(x.entry.last_fight));
  return scored.slice(0, limit).map((s) => s.entry);
}
