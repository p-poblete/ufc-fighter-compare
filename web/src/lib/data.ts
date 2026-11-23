// Shapes of the JSON files written by pipeline/export.py.

export type Gender = "M" | "F";

export interface IndexEntry {
  slug: string;
  name: string;
  nickname: string | null;
  weight_class: string | null;
  gender: Gender | null;
  record: string; // "W-L-D"
  last_fight: string; // ISO date
}

export interface Fighter {
  slug: string;
  name: string;
  nickname: string | null;
  dob: string | null;
  age: number | null;
  height_cm: number | null;
  reach_cm: number | null;
  weight_lbs: number | null;
  stance: string | null;
  weight_class: string | null;
  gender: Gender | null;
  archetype: string | null;
  record: { wins: number; losses: number; draws: number };
  ufc_record: { W: number; L: number; D: number; NC: number };
  ufc_fights: number;
  last_fight: string;
}

export interface Meta {
  data_through: string;
  fights: number;
  fighters: number;
  sources: { name: string; url: string; license: string; provides: string }[];
}

export type Side = "a" | "b";

const base = "/data";

export async function loadIndex(): Promise<IndexEntry[]> {
  const res = await fetch(`${base}/index.json`);
  if (!res.ok) throw new Error(`index.json: HTTP ${res.status}`);
  return res.json();
}

const cache = new Map<string, Promise<Fighter>>();

export function loadFighter(slug: string): Promise<Fighter> {
  let p = cache.get(slug);
  if (!p) {
    p = fetch(`${base}/fighters/${slug}.json`).then((res) => {
      if (!res.ok) throw new Error(`${slug}.json: HTTP ${res.status}`);
      return res.json();
    });
    p.catch(() => cache.delete(slug));
    cache.set(slug, p);
  }
  return p;
}
