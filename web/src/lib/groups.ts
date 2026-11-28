// Pure rules of /groups/ (docs/spec.md §11.1 #3): URL parsing, percentile population, best per row.
import type { Fighter, Metric } from "./data";

export const MAX_GROUP = 4;
export const MIN_GROUP = 2;
/** Okabe-Ito picks by list position; never the corner colours (spec §11.5). */
export const GROUP_COLORS = ["#E69F00", "#56B4E9", "#00B98A", "#CC79A7"] as const;

export const NOTE_FULL = "Up to 4 fighters";
export const NOTE_FEW = "Add at least 2 fighters";
export const notFound = (slug: string) => `Fighter not found: ${slug}`;

export interface GroupUrl {
  slugs: string[];
  notes: string[];
}

/** `?f=a,b,c`: drops empties and duplicates, discards unknown slugs (with a notice), keeps the first 4 (with a notice). */
export function parseGroup(raw: string | null, exists: (slug: string) => boolean): GroupUrl {
  const notes: string[] = [];
  const seen = new Set<string>();
  const valid: string[] = [];
  for (const part of (raw ?? "").split(",")) {
    const slug = part.trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    if (exists(slug)) valid.push(slug);
    else notes.push(notFound(slug));
  }
  if (valid.length > MAX_GROUP) notes.push(NOTE_FULL);
  const slugs = valid.slice(0, MAX_GROUP);
  if (slugs.length < MIN_GROUP) notes.push(NOTE_FEW);
  return { slugs, notes };
}

/** Query string of a group; an empty list gives `?f=`. `keep` carries the chart block's tab and mode (spec §12.1 #1), when valid. */
export function groupQuery(slugs: string[], keep?: URLSearchParams): string {
  let qs = `?f=${slugs.join(",")}`;
  const chart = keep?.get("chart");
  const mode = keep?.get("mode");
  if (chart && ["performance", "returns", "length", "methods"].includes(chart)) qs += `&chart=${chart}`;
  if (mode === "points" || mode === "line") qs += `&mode=${mode}`;
  return qs;
}

export type Population = "division" | "global";
export type Pcts = Record<Metric, number>;

/**
 * Division percentiles when every fighter with data fights in the same division (and has division percentiles);
 * otherwise all fighters. Fighters without data do not take part in the decision. `forceGlobal` is the viewer setting.
 */
export function groupPopulation(fs: Fighter[], forceGlobal = false): { pop: Population; division: string | null } {
  const withData = fs.filter((f) => f.percentiles);
  const div = withData[0]?.weight_class ?? null;
  const shared = !forceGlobal && !!div && withData.every((f) => f.weight_class === div && f.percentiles!.division);
  return shared ? { pop: "division", division: div } : { pop: "global", division: null };
}

/** The percentiles a fighter brings to the chosen population, or null (No data: no polygon, no competing). */
export const groupPcts = (f: Fighter, pop: Population): Pcts | null => f.percentiles?.[pop] ?? null;

/**
 * Per row, which columns are best: highest rounded percentile (SApM is already inverted in the data); ties mark all.
 * Columns without data never compete, and a lone competitor is not "best" of anything.
 */
export function bestPerRow(cols: (Pcts | null)[], metrics: Metric[]): Record<Metric, boolean[]> {
  const out = {} as Record<Metric, boolean[]>;
  const competing = cols.filter(Boolean).length;
  for (const m of metrics) {
    const vals = cols.map((p) => (p ? Math.round(p[m]) : null));
    const top = Math.max(...vals.filter((v): v is number => v != null));
    out[m] = vals.map((v) => competing >= 2 && v != null && v === top);
  }
  return out;
}
