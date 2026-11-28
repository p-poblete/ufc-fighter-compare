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

export interface Photo {
  url: string;
  width: number;
  height: number;
  author: string | null;
  license: string;
  license_url: string | null;
  page: string;
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
  specialties: string[];
  discipline: string | null;
  /** One belt per division: current champion, interim champion or former champion (data/raw/champions.csv plus title bouts won). */
  belts: Belt[];
  /** Wikimedia Commons thumbnail with its credit; null for about three in four fighters (monogram). */
  photo: Photo | null;
  /** Null when the source has no professional record: use careerRecord() in render.ts. */
  record: { wins: number | null; losses: number | null; draws: number | null };
  ufc_record: { W: number; L: number; D: number; NC: number };
  ufc_fights: number;
  last_fight: string;
  career: Record<Metric, number> | null;
  percentiles: { division: Record<Metric, number> | null; global: Record<Metric, number> | null; inverted: string[] } | null;
  wins_by: Record<Method, number>;
  losses_by: Record<Method, number>;
  odds: Odds;
  duration: Duration;
  fights: Fight[];
  /** Up to 5 closest styles in the same gender and division, nearest first (pipeline/export.py similar_fighters).
   *  Names travel with the slug so the profile needs no index.json. Absent: no division percentile (shows "No data"); []: no candidates. */
  similar?: { slug: string; name: string }[];
}

/** One entry of directory.json (pipeline/export.py build_directory); null fields are omitted. Same order as index.json. */
export interface DirectoryEntry {
  s: string; // slug
  n: string; // name
  k?: string; // nickname
  g?: Gender;
  d?: string; // division
  r: string; // record "W-L-D", as index.json
  a?: string; // archetype
  sp?: string[]; // specialties
  di?: string; // discipline
  p?: { u: string; w: number; h: number; a: string; l: string; lu: string; pg: string }; // photo with Commons credit
  belts: Belt[];
  sl?: number; // SLpM
  td?: number; // TDAvg
  fr?: number; // finish % of UFC wins
  ix?: number; // composite index (mean of the 8 percentiles, 1 decimal)
  nf: number; // UFC fights
  lf: string; // last fight, ISO date
  rf: [result: "W" | "L" | "D" | "NC", date: string, opponent: string, method: string][]; // last 5 UFC fights, newest first
  w: number; // UFC wins since 2010
  wp?: number; // UFC win % since 2010 (wins / (W+L+D))
}

export interface Belt {
  division: string;
  kind: "champion" | "interim" | "former";
}

export type Metric = "slpm" | "str_acc" | "sapm" | "str_def" | "td_avg" | "td_acc" | "td_def" | "sub_avg";
export type Method = "KO/TKO" | "SUB" | "DEC" | "OTHER";
export type OddsType = "Heavy favorite" | "Favorite" | "Pick'em" | "Underdog" | "Heavy underdog";

export interface RoiCell {
  n: number;
  profit: number | null;
  roi_pct: number | null;
  small_sample: boolean;
  no_data: boolean;
}

export interface Odds {
  stake: number;
  total: RoiCell & { coverage: number };
  by_type: Record<OddsType, RoiCell>;
  expected_vs_actual: { n: number; expected_wins: number | null; actual_wins: number | null };
}

export interface Duration {
  n: number;
  avg_minutes: number | null;
  bins: { from: number; to: number; count: number }[];
  decision_pct: number | null;
}

/** The 16 per-fight statistic columns of fights.parquet, null where the source has none. */
export interface FightStats {
  kd: number | null;
  kd_against: number | null;
  sig_landed: number | null;
  sig_attempted: number | null;
  sig_absorbed: number | null;
  str_landed: number | null;
  str_attempted: number | null;
  str_absorbed: number | null;
  td: number | null;
  td_attempted: number | null;
  taken_down: number | null;
  sub_att: number | null;
  clinch: number | null;
  clinch_taken: number | null;
  ground: number | null;
  ground_taken: number | null;
}

export interface Fight {
  date: string;
  opponent: string;
  opponent_slug: string;
  result: "W" | "L" | "D" | "NC";
  method: Method;
  method_detail: string;
  round: number | null;
  round_time_s: number | null;
  fight_time_s: number | null;
  weight_class: string | null;
  odds: number | null;
  opp_odds: number | null;
  implied_prob_fair: number | null;
  title: boolean;
  stats: FightStats | null;
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

/** Fighters directory (only /fighters/ loads it; index.json is unchanged). */
export async function loadDirectory(): Promise<DirectoryEntry[]> {
  const res = await fetch(`${base}/directory.json`);
  if (!res.ok) throw new Error(`directory.json: HTTP ${res.status}`);
  return res.json();
}
