// The fighter picker shared by the home page and /groups/.
import type { IndexEntry } from "./data";
import { esc } from "./format";
import { search, type Searchable } from "./search";

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;

/** Wires one .pick block (gender and division filters, search box, suggestions) to `choose`. Shared by the home page and /groups/. */
export function setupPicker(side: string, items: Searchable[], choose: (side: string, slug: string) => void): void {
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
