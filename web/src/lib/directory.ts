// Pure logic of the fighters directory (spec 11.1 #4): filters, orders and URL state. No DOM here.
import type { DirectoryEntry } from "./data";
import { normalize } from "./search";

export type SortKey = "best" | "w" | "wp" | "last" | "name";
export const SORTS: [SortKey, string][] = [
  ["best", "Best overall"],
  ["w", "UFC wins since 2010"],
  ["wp", "UFC win % since 2010"],
  ["last", "Most recent fight"],
  ["name", "Name"],
];

export interface DirState {
  gender: string;
  division: string;
  archetype: string;
  spec: string[];
  discipline: string;
  /** Fought in the last 2 years before the most recent fight in the data. */
  active: boolean;
  /** "", "any" (any belt), or a belt kind. */
  belt: string;
  /** Minimum UFC fights since 2010 (0 = any). */
  min: number;
  sort: SortKey;
  q: string;
}

export const EMPTY: DirState = { gender: "", division: "", archetype: "", spec: [], discipline: "", active: false, belt: "", min: 0, sort: "best", q: "" };
export const BELTS: [string, string][] = [
  ["any", "Any belt"],
  ["champion", "Current champion"],
  ["interim", "Interim champion"],
  ["former", "Former champion"],
];
export const MINS = [5, 10, 15];
export const PAGE = 24;

export interface DirOptions {
  divisions: string[];
  disciplines: string[];
  archetypes: string[];
  specs: string[];
}

/** Values the filters accept, taken from the data (archetypes and specialties from the badge tables). */
export function optionsOf(entries: DirectoryEntry[], archetypes: string[], specs: string[]): DirOptions {
  const uniq = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b));
  return { divisions: uniq(entries.map((e) => e.d)), disciplines: uniq(entries.map((e) => e.di)), archetypes, specs };
}

/** Reads `?gender=&division=&archetype=&spec=a,b&discipline=&sort=&q=`. Unknown values are dropped. */
export function parseState(params: URLSearchParams, opt: DirOptions): DirState {
  const pick = (key: string, allowed: string[]) => {
    const v = params.get(key) ?? "";
    return allowed.includes(v) ? v : "";
  };
  const sort = params.get("sort") as SortKey | null;
  return {
    gender: pick("gender", ["M", "F"]),
    division: pick("division", opt.divisions),
    archetype: pick("archetype", opt.archetypes),
    spec: [...new Set((params.get("spec") ?? "").split(",").filter((k) => opt.specs.includes(k)))],
    discipline: pick("discipline", opt.disciplines),
    active: params.get("active") === "1",
    belt: pick("belt", BELTS.map(([k]) => k)),
    min: MINS.includes(Number(params.get("min"))) ? Number(params.get("min")) : 0,
    sort: SORTS.some(([k]) => k === sort) ? (sort as SortKey) : "best",
    q: (params.get("q") ?? "").slice(0, 80),
  };
}

/** Query string for the state, defaults omitted ("" when everything is default). */
export function serializeState(s: DirState): string {
  const p = new URLSearchParams();
  if (s.gender) p.set("gender", s.gender);
  if (s.division) p.set("division", s.division);
  if (s.archetype) p.set("archetype", s.archetype);
  if (s.spec.length) p.set("spec", s.spec.join(","));
  if (s.discipline) p.set("discipline", s.discipline);
  if (s.active) p.set("active", "1");
  if (s.belt) p.set("belt", s.belt);
  if (s.min) p.set("min", String(s.min));
  if (s.sort !== "best") p.set("sort", s.sort);
  if (s.q.trim()) p.set("q", s.q.trim());
  const out = p.toString();
  return out ? `?${out}` : "";
}

export const isFiltered = (s: DirState) => !!(s.gender || s.division || s.archetype || s.spec.length || s.discipline || s.active || s.belt || s.min || s.q.trim());

/** Date of the most recent fight in the data (ISO). */
const latest = (list: DirectoryEntry[]) => list.reduce((m, e) => (e.lf > m ? e.lf : m), "");
/** The date two years before `iso` (ISO strings compare as dates). */
const twoYearsBefore = (iso: string) => (iso ? `${Number(iso.slice(0, 4)) - 2}${iso.slice(4)}` : "");

export function filterEntries(list: DirectoryEntry[], s: DirState): DirectoryEntry[] {
  const q = normalize(s.q);
  const since = s.active ? twoYearsBefore(latest(list)) : "";
  return list.filter(
    (e) =>
      (!s.gender || e.g === s.gender) &&
      (!s.division || e.d === s.division) &&
      (!s.archetype || e.a === s.archetype) &&
      (!s.discipline || e.di === s.discipline) &&
      (!since || e.lf >= since) &&
      (!s.belt || (s.belt === "any" ? e.belts.length > 0 : e.belts.some((b) => b.kind === s.belt))) &&
      e.nf >= s.min &&
      s.spec.every((k) => e.sp?.includes(k)) &&
      (!q || normalize(e.n).includes(q)),
  );
}

const byName = (a: DirectoryEntry, b: DirectoryEntry) => a.n.localeCompare(b.n);
/** Descending on a possibly missing number: nulls last. */
const desc = (get: (e: DirectoryEntry) => number | string | undefined) => (a: DirectoryEntry, b: DirectoryEntry) => {
  const x = get(a), y = get(b);
  if (x == null && y == null) return 0;
  if (x == null) return 1;
  if (y == null) return -1;
  return x < y ? 1 : x > y ? -1 : 0;
};
/** best: (1) 5 or more UFC fights with an index, (2) fewer with an index, (3) no percentiles; index descending inside each, ties by name. */
const group = (e: DirectoryEntry) => (e.ix == null ? 2 : e.nf >= 5 ? 0 : 1);

export function sortEntries(list: DirectoryEntry[], sort: SortKey): DirectoryEntry[] {
  const out = [...list];
  const cmp: Record<SortKey, (a: DirectoryEntry, b: DirectoryEntry) => number> = {
    best: (a, b) => group(a) - group(b) || desc((e) => e.ix)(a, b),
    w: desc((e) => e.w),
    wp: desc((e) => e.wp),
    last: desc((e) => e.lf),
    name: byName,
  };
  return out.sort((a, b) => cmp[sort](a, b) || byName(a, b));
}

export const view = (all: DirectoryEntry[], s: DirState) => sortEntries(filterEntries(all, s), s.sort);
