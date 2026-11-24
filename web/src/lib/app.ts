// Client script: pickers, URL state and re-rendering of the comparison.
import { loadFighter, loadIndex, type Fighter, type IndexEntry, type Side } from "./data";
import { esc } from "./format";
import { centre, fightCharts, ownColumn, title } from "./render";
import { prepare, search, type Searchable } from "./search";
import { pairQuery, readPair } from "./url-state";
import { setupFightDialog } from "./dialog";
import { exportCard } from "./card";
import { initTools, pushRecent } from "./tools";

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

  /** Three columns: the tape grows so the radar block starts level with the records. */
  function alignRadar(): void {
    const mu = document.querySelector<HTMLElement>('#centre [data-module="duel.matchup"]');
    const st = document.querySelector<HTMLElement>('#centre [data-module="duel.style"]');
    const rec = document.querySelector<HTMLElement>('#col-a [data-module="corner.record"], #col-b [data-module="corner.record"]');
    if (!mu) return;
    mu.style.minHeight = "";
    mu.style.removeProperty("--mu-pad");
    if (!st || !rec || matchMedia("(max-width: 1180px)").matches) return;
    const delta = rec.getBoundingClientRect().top - st.getBoundingClientRect().top;
    if (delta > 0) mu.style.minHeight = `${mu.getBoundingClientRect().height + delta}px`;
    else if (delta < 0) {
      // Tape taller than the portrait (narrow columns): tighten its rows, then fill any rounding left over.
      const rows = mu.querySelectorAll(".mu__row").length;
      mu.style.setProperty("--mu-pad", `${Math.max(2, 9 + delta / (2 * rows))}px`);
      const rest = rec.getBoundingClientRect().top - st.getBoundingClientRect().top;
      if (rest > 0) mu.style.minHeight = `${mu.getBoundingClientRect().height + rest}px`;
    }
  }

  initTools({
    pick: (side, slug) => choose(side, slug),
    exportImage: async () => (current[0] && current[1] ? exportCard(current[0], current[1], $("#centre")) : null),
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

  for (const side of ["a", "b"] as Side[]) setupPicker(side, items, choose);

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

function setupPicker(side: Side, items: Searchable[], choose: (side: Side, slug: string) => void): void {
  const root = $(`.pick[data-side="${side}"]`);
  const input = $<HTMLInputElement>(".combo__input", root);
  const list = $<HTMLUListElement>(".combo__list", root);
  const ddValue = (k: string) => root.querySelector<HTMLElement>(`[data-dd="${k}"]`)!.dataset.value ?? "";
  let results: IndexEntry[] = [];
  let active = -1;

  const optionId = (i: number) => `opt-${side}-${i}`;

  function open(): void {
    results = search(items, input.value, { gender: ddValue("gender") as "" | "M" | "F", division: ddValue("division") });
    active = results.length ? 0 : -1;
    list.innerHTML = results.length
      ? results
          .map(
            (e, i) =>
              `<li id="${optionId(i)}" role="option" aria-selected="${i === active}" data-slug="${e.slug}">
                <span class="opt__name">${esc(e.name)}</span>
                <span class="opt__meta">${[e.weight_class, e.record].filter(Boolean).map((x) => esc(x!)).join(" · ")}</span>
              </li>`,
          )
          .join("")
      : `<li class="opt--none" role="presentation">No fighter matches “${esc(input.value)}”${
          ddValue("gender") || ddValue("division") ? " with these filters" : ""
        }</li>`;
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    sync();
  }

  function close(): void {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }

  function sync(): void {
    list.querySelectorAll<HTMLLIElement>("[role=option]").forEach((li, i) => {
      li.setAttribute("aria-selected", String(i === active));
      if (i === active) li.scrollIntoView({ block: "nearest" });
    });
    if (active >= 0) input.setAttribute("aria-activedescendant", optionId(active));
    else input.removeAttribute("aria-activedescendant");
  }

  function pick(i: number): void {
    const entry = results[i];
    if (!entry) return;
    input.value = "";
    close();
    choose(side, entry.slug);
  }

  input.addEventListener("input", open);
  input.addEventListener("click", () => (list.hidden ? open() : undefined));
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      if (list.hidden) return open();
      if (!results.length) return;
      active = (active + (ev.key === "ArrowDown" ? 1 : -1) + results.length) % results.length;
      sync();
    } else if (ev.key === "Enter") {
      if (!list.hidden && active >= 0) {
        ev.preventDefault();
        pick(active);
      }
    } else if (ev.key === "Escape") {
      if (!list.hidden) {
        ev.preventDefault();
        close();
      }
    }
  });
  input.addEventListener("blur", () => {
    // Let a click on an option land first.
    setTimeout(close, 120);
  });
  list.addEventListener("mousedown", (ev) => ev.preventDefault());
  list.addEventListener("click", (ev) => {
    const li = (ev.target as HTMLElement).closest<HTMLLIElement>("[role=option]");
    if (li) pick(Number(li.id.split("-").pop()));
  });
  // The filters narrow the suggestions; the magnifier lists the fighters that match them.
  root.querySelectorAll<HTMLElement>(".dd").forEach((dd) => {
    const btn = dd.querySelector<HTMLButtonElement>(".dd__btn")!;
    const menu = dd.querySelector<HTMLElement>(".dd__menu")!;
    const set = (openIt: boolean) => {
      menu.hidden = !openIt;
      btn.setAttribute("aria-expanded", String(openIt));
      if (openIt) menu.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
    };
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      set(menu.hidden);
    });
    menu.addEventListener("click", (ev) => {
      const opt = (ev.target as HTMLElement).closest<HTMLElement>("[data-v]");
      if (!opt) return;
      dd.dataset.value = opt.dataset.v ?? "";
      menu.querySelectorAll("[data-v]").forEach((o) => o.setAttribute("aria-selected", String(o === opt)));
      btn.querySelector("span")!.textContent = opt.textContent;
      set(false);
      input.focus();
      open();
    });
    menu.addEventListener("keydown", (ev) => {
      const opts = [...menu.querySelectorAll<HTMLElement>("[data-v]")];
      const i = opts.indexOf(document.activeElement as HTMLElement);
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        ev.preventDefault();
        opts[(i + (ev.key === "ArrowDown" ? 1 : -1) + opts.length) % opts.length]?.focus();
      } else if (ev.key === "Escape") {
        set(false);
        btn.focus();
      }
    });
    document.addEventListener("click", (ev) => {
      if (!menu.hidden && !dd.contains(ev.target as Node)) set(false);
    });
  });
  root.querySelector(".pick__go")!.addEventListener("click", () => {
    input.focus();
    open();
  });
}
