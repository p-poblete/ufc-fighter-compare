// URL state rules from docs/spec.md §3.

export const NOT_FOUND = "Fighter not found";
export const SAME_FIGHTER = "Pick a different fighter";

export interface PairState {
  a: string | null;
  b: string | null;
  warnA: string | null;
  warnB: string | null;
}

export function readPair(
  params: URLSearchParams,
  exists: (slug: string) => boolean,
  featured: { a: string; b: string },
): PairState {
  const rawA = params.get("a");
  const rawB = params.get("b");
  if (rawA === null && rawB === null) return { a: featured.a, b: featured.b, warnA: null, warnB: null };

  const state: PairState = { a: null, b: null, warnA: null, warnB: null };
  if (rawA) {
    if (exists(rawA)) state.a = rawA;
    else state.warnA = NOT_FOUND;
  }
  if (rawB) {
    if (exists(rawB)) state.b = rawB;
    else state.warnB = NOT_FOUND;
  }
  if (state.a && state.a === state.b) {
    state.b = null;
    state.warnB = SAME_FIGHTER;
  }
  return state;
}

/** Query string for a pair; empty sides are left out. */
export function pairQuery(a: string | null, b: string | null): string {
  const params = new URLSearchParams();
  if (a) params.set("a", a);
  if (b) params.set("b", b);
  const qs = params.toString();
  return qs ? `?${qs}` : "?";
}
