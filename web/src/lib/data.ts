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
  career: Record<Metric, number> | null;
  percentiles: { division: Record<Metric, number> | null; global: Record<Metric, number> | null; inverted: string[] } | null;
  wins_by: Record<Method, number>;
  losses_by: Record<Method, number>;
  odds: Odds;
  duration: Duration;
  fights: Fight[];
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
  stats: { kd: number; sig_landed: number; sig_attempted: number; td: number; td_attempted: number; sub_att: number } | null;
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
