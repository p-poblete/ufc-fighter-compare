// Client script: pickers, URL state and re-rendering of the comparison.
import { loadFighter, loadIndex, type Fighter, type IndexEntry, type Side } from "./data";
import { esc } from "./format";
import { card, finding, recordBars, tape, title } from "./render";
import { prepare, search, type Searchable } from "./search";
import { pairQuery, readPair } from "./url-state";

interface State {
  a: string | null;
  b: string | null;
  warnA: string | null;
  warnB: string | null;
}

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;

export async function boot(): Promise<void> {
  const app = $("#app");
  const featured = { a: app.dataset.featuredA!, b: app.dataset.featuredB! };
  let index: IndexEntry[];
  try {
    index = await loadIndex();
  } catch {
    $("#live").textContent = "Fighter list could not load. Reload the page to try again.";
    $("#finding").textContent = "Fighter list could not load. Reload the page to try again.";
    return;
  }
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
      if (id === renderId) $("#finding").textContent = "A fighter could not load. Check your connection and try again.";
      return;
    }
    if (id !== renderId) return; // a newer selection won
    $("#title").textContent = title(a, b);
    $("#finding").textContent = finding(a, b);
    $("#card-a").innerHTML = card(a, "a", state.warnA);
    $("#card-b").innerHTML = card(b, "b", state.warnB);
    $("#tape").innerHTML = tape(a, b);
    $("#record").innerHTML = recordBars(a, b);
    document.title = `${title(a, b)} · UFC Fighter Compare`;
  }

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
}

function setupPicker(side: Side, items: Searchable[], choose: (side: Side, slug: string) => void): void {
  const root = $(`.fighter[data-side="${side}"]`);
  const input = $<HTMLInputElement>(".combo__input", root);
  const list = $<HTMLUListElement>(".combo__list", root);
  const gender = $<HTMLSelectElement>(".filter-gender", root);
  const division = $<HTMLSelectElement>(".filter-division", root);
  let results: IndexEntry[] = [];
  let active = -1;

  const optionId = (i: number) => `opt-${side}-${i}`;

  function open(): void {
    results = search(items, input.value, { gender: gender.value as "" | "M" | "F", division: division.value });
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
          gender.value || division.value ? " with these filters" : ""
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
  for (const select of [gender, division]) {
    select.addEventListener("change", () => {
      input.focus();
      open();
    });
  }
}
