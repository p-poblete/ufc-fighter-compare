// Client script: pickers, URL state and re-rendering of the comparison.
import { loadFighter, loadIndex, type Fighter, type IndexEntry, type Side } from "./data";
import { centre, fightCharts, ownColumn, title } from "./render";
import { prepare } from "./search";
import { setupPicker } from "./picker";
import { groupQuery } from "./groups";
import { pairQuery, readPair } from "./url-state";
import { setupFightDialog } from "./dialog";
import { initTools, pushRecent } from "./tools";
import { initFlip } from "./flip";
import { fitBadges } from "./fit";

interface State {
  a: string | null;
  b: string | null;
  warnA: string | null;
  warnB: string | null;
}

const RED = "rgb(229 72 77)";
const BLUE = "rgb(62 140 240)";
const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;

export async function boot(): Promise<void> {
  const app = $("#app");
  const featured = { a: app.dataset.featuredA!, b: app.dataset.featuredB! };
  let index: IndexEntry[];
  try {
    index = await loadIndex();
  } catch {
    $("#live").textContent = "Fighter list could not load. Reload the page to try again.";
    return;
  }
  setupFightDialog();
  initFlip();
  let current: [Fighter | null, Fighter | null] = [null, null];
  const bySlug = new Map(index.map((e) => [e.slug, e]));
  const items = prepare(index);

  let state: State = readPair(new URLSearchParams(location.search), (s) => bySlug.has(s), featured);
  let renderId = 0;

  async function render(): Promise<void> {
    const id = ++renderId;
    let a: Fighter | null = null;
    let b: Fighter | null = null;
    try {
      [a, b] = await Promise.all([state.a ? loadFighter(state.a) : null, state.b ? loadFighter(state.b) : null]);
    } catch {
      if (id === renderId) $("#live").textContent = "A fighter could not load. Check your connection and try again.";
      return;
    }
    if (id !== renderId) return; // a newer selection won
    const charts = await import("./charts");
    if (id !== renderId) return;
    const mid = $("#centre");
    const row = $("#fights");
    charts.disposeCharts(mid);
    charts.disposeCharts(row);
    $("#title").textContent = title(a, b);
    $("#col-a").innerHTML = ownColumn(a, "a", state.warnA, b);
    $("#col-b").innerHTML = ownColumn(b, "b", state.warnB, a);
    mid.innerHTML = centre(a, b);
    row.innerHTML = fightCharts(a, b);
    if (a && b) {
      charts.drawCharts(mid, [{ f: a, color: RED }, { f: b, color: BLUE }]);
      charts.drawCharts(row, [{ f: a, color: RED }, { f: b, color: BLUE }]);
    }
    document.title = `${title(a, b)} · UFC Fighter Compare`;
    current = [a, b];
    if (a && b) pushRecent({ a: a.slug, b: b.slug, an: a.name, bn: b.name });
    mirror();
  }

  /** Corner modules mirror each other: each pair takes the taller one's height (content decides, no fixed sizes). */
  function mirror(): void {
    const mods = (side: Side) => [...$(`#col-${side}`).querySelectorAll<HTMLElement>(":scope > [data-module]")];
    const A = mods("a"), B = mods("b");
    [...A, ...B].forEach((m) => (m.style.minHeight = ""));
    fitBadges();
    alignRadar();
    if (matchMedia("(max-width: 760px)").matches) return; // stacked on phones: nothing to mirror
    A.forEach((m, i) => {
      const n = B[i];
      if (!n || n.dataset.module !== m.dataset.module || m.dataset.module === "corner.history") return;
      const h = Math.max(m.offsetHeight, n.offsetHeight);
      m.style.minHeight = n.style.minHeight = `${h}px`;
    });
  }
  addEventListener("resize", mirror);
  document.fonts?.ready.then(mirror);

  /** Three columns: the radar (top) grows so the tape starts level with the records; the tape fills down to the histories. */
  function alignRadar(): void {
    const top = document.querySelector<HTMLElement>('#centre [data-module="duel.style"]');
    const tape = document.querySelector<HTMLElement>('#centre [data-module="duel.matchup"]');
    const rec = document.querySelector<HTMLElement>('#col-a [data-module="corner.record"], #col-b [data-module="corner.record"]');
    const ids = [...document.querySelectorAll<HTMLElement>('#col-a [data-module="corner.identity"], #col-b [data-module="corner.identity"]')];
    for (const e of [top, tape, ...ids]) if (e) e.style.minHeight = "";
    for (const e of ids) { e.style.width = ""; e.style.height = ""; }
    const sb = top?.querySelector<HTMLElement>(".style__body");
    if (sb) { sb.style.minHeight = ""; sb.style.height = ""; }
    const square = (e: HTMLElement, side0: number) => {
      const side = Math.min(side0, e.parentElement?.clientWidth ?? side0); // never wider than its column, so it stays a square
      e.style.width = `${Math.ceil(side)}px`; e.style.height = `${Math.ceil(side)}px`; };
    if (!top || !tape || !rec || matchMedia("(max-width: 1180px)").matches) return;
    // Portraits never get shorter than their own overlays (belts, photo credit) plus the text block at the foot.
    const need = Math.max(0, ...ids.map((id) => {
      const text = id.querySelector<HTMLElement>(".id__text");
      if (!text) return 0;
      const top0 = id.getBoundingClientRect().top;
      const over = Math.max(0, ...[...id.querySelectorAll<HTMLElement>(".belts, .credit, .warn")].map((o) => o.getBoundingClientRect().bottom - top0));
      return over + 4 + text.offsetHeight;
    }));
    for (const e of ids) if (e.getBoundingClientRect().height < need) square(e, need);
    const gap = () => rec.getBoundingClientRect().top - tape.getBoundingClientRect().top;
    const firstView = matchMedia("(min-height: 900px)").matches; // portraits keep their --side there
    if (gap() < 0) {
      if (firstView) {
        // Portrait capped by its column: the radar block gives the difference back (it never drops below 280px, the CSS floor).
        const body = top.querySelector<HTMLElement>(".style__body");
        if (body) {
          const h = body.getBoundingClientRect().height;
          body.style.minHeight = body.style.height = `${Math.max(280, h + gap())}px`;
        }
        // Radar at its 280px floor and the tape still below the records: the records sit under the portrait, so the
        // portraits (always square) take the difference; the history list below absorbs it.
        const g = gap();
        if (g < -0.5) for (const e of ids) square(e, e.getBoundingClientRect().height - g);
      } else {
        // Radar taller than the portrait area: the portraits take the difference so both sides stay level.
        for (const e of ids) square(e, e.getBoundingClientRect().height - gap());
      }
    }
    const delta = gap();
    if (delta > 0.5) top.style.minHeight = `${top.getBoundingClientRect().height + delta}px`;
  }

  // Content changes (new pair, corner, photo, fonts) re-align; runs converge, the counter only guards against ping-pong.
  // When the cap is hit, one last deferred pass settles whatever the burst left (never a loop: it is a single timeout).
  let runs = 0, runsAt = 0, queued = false, settle = 0;
  const realign = new ResizeObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const now = performance.now();
      if (now - runsAt > 300) runs = 0;
      runsAt = now;
      if (++runs <= 4) mirror();
      else {
        clearTimeout(settle);
        settle = window.setTimeout(() => { runs = 0; runsAt = performance.now(); mirror(); }, 350);
      }
    });
  });
  for (const id of ["#col-a", "#col-b", "#centre"]) realign.observe($(id));

  /** "Add to group" and the palette's "Compare as group": /groups/ with the valid sides (?f=a,b, ?f=a or ?f=). */
  const groupUrl = () => `/groups/${groupQuery([state.a, state.b].filter((s): s is string => !!s))}`;
  initTools({
    pick: (side, slug) => choose(side, slug),
    group: groupUrl,
  });
  document.addEventListener("settings:change", () => void render());

  function commit(next: State, push = true): void {
    state = next;
    if (push) {
      const url = `${location.pathname}${pairQuery(state.a, state.b)}`;
      history.pushState(null, "", url);
    }
    void render();
  }

  function choose(side: Side, slug: string): void {
    const other = side === "a" ? state.b : state.a;
    const next: State = { ...state, [side]: slug, warnA: null, warnB: null };
    if (slug === other) {
      // Picking the other corner's fighter empties that corner (spec: a == b leaves B empty).
      next[side === "a" ? "b" : "a"] = null;
      next[side === "a" ? "warnB" : "warnA"] = "Pick a different fighter";
    }
    commit(next);
    $("#live").textContent = `${bySlug.get(slug)?.name} in the ${side === "a" ? "red" : "blue"} corner.`;
  }

  for (const side of ["a", "b"] as Side[]) setupPicker(side, items, (s, slug) => choose(s as Side, slug));

  $("#add-group").addEventListener("click", () => {
    location.href = groupUrl();
  });
  $("#swap").addEventListener("click", () => {
    commit({ a: state.b, b: state.a, warnA: state.warnB, warnB: state.warnA });
    $("#live").textContent = "Corners swapped.";
  });

  addEventListener("popstate", () => {
    state = readPair(new URLSearchParams(location.search), (s) => bySlug.has(s), featured);
    void render();
  });

  void render();
  void document.fonts.ready.then(mirror); // display type changes the heights once it loads
}
