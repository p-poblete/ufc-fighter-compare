// Top bar tools on every page: quick search (Ctrl+K), recent comparisons, share, export image (compare
// page only), and view settings (units, percentile base). Also the generic [data-toggle] disclosure.
import { loadIndex, type IndexEntry } from "./data";
import { esc } from "./format";
import { prepare, search, type Searchable } from "./search";
import { loadSettings, setSetting, settings, type Base, type Units } from "./settings";

export interface ToolHooks {
  /** Compare page: put a fighter in a corner without leaving. Elsewhere the palette navigates. */
  pick?: (side: "a" | "b", slug: string) => void;
  /** Compare page: build the share image. */
  exportImage?: () => Promise<Blob | null>;
}

interface Recent {
  a: string;
  b: string;
  an: string;
  bn: string;
}
const RECENT = "fc-recent";

export function readRecent(): Recent[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT) ?? "[]");
  } catch {
    return [];
  }
}
export function pushRecent(r: Recent): void {
  const list = [r, ...readRecent().filter((x) => !(x.a === r.a && x.b === r.b))].slice(0, 8);
  try {
    localStorage.setItem(RECENT, JSON.stringify(list));
  } catch {
    /* not stored */
  }
}

export function toast(text: string): void {
  let el = document.querySelector<HTMLElement>(".toast");
  if (!el) {
    el = Object.assign(document.createElement("p"), { className: "toast", role: "status" });
    document.body.append(el);
  }
  el.textContent = text;
  el.classList.add("is-on");
  clearTimeout(Number(el.dataset.t));
  el.dataset.t = String(setTimeout(() => el!.classList.remove("is-on"), 2200));
}

/** A button that opens a small menu; closes on outside click or Escape. */
function menu(btn: HTMLElement, panel: HTMLElement, onOpen?: () => void) {
  const set = (open: boolean) => {
    panel.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    if (open) onOpen?.();
  };
  btn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    set(panel.hidden);
  });
  document.addEventListener("click", (ev) => {
    if (!panel.hidden && !panel.contains(ev.target as Node)) set(false);
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !panel.hidden) {
      set(false);
      btn.focus();
    }
  });
}

export function initTools(hooks: ToolHooks = {}): void {
  loadSettings();
  const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel);

  // Disclosures such as the radar's metric sheet.
  document.addEventListener("click", (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLElement>("[data-toggle]");
    if (!btn) return;
    const target = document.getElementById(btn.dataset.toggle!);
    if (!target) return;
    target.hidden = !target.hidden;
    btn.setAttribute("aria-expanded", String(!target.hidden));
  });

  // Share: native sheet where there is one, else copy the link.
  $("#t-share")?.addEventListener("click", async () => {
    const url = location.href;
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title: document.title, url });
        return;
      } catch {
        /* cancelled: fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    } catch {
      toast("Copy the address bar to share");
    }
  });

  // Export image.
  const exp = $("#t-export");
  if (exp) {
    if (!hooks.exportImage) exp.hidden = true;
    exp.addEventListener("click", async () => {
      const blob = await hooks.exportImage?.();
      if (!blob) return toast("Pick both fighters first");
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${document.title.split(" · ")[0].replace(/\W+/g, "-").toLowerCase()}.png` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast("Image saved");
    });
  }

  // Recent comparisons.
  const recentBtn = $("#t-recent");
  const recentMenu = $("#m-recent");
  if (recentBtn && recentMenu) {
    menu(recentBtn, recentMenu, () => {
      const list = readRecent();
      recentMenu.innerHTML = list.length
        ? `<p class="menu__title">Recent comparisons</p>${list.map((r) => `<a class="menu__item" href="/?a=${r.a}&amp;b=${r.b}"><span class="dot dot--a"></span>${esc(r.an)} <span class="muted">vs</span> <span class="dot dot--b"></span>${esc(r.bn)}</a>`).join("")}`
        : `<p class="menu__title">Recent comparisons</p><p class="menu__empty">Comparisons you open appear here.</p>`;
    });
  }

  // View settings.
  const viewBtn = $("#t-view");
  const viewMenu = $("#m-view");
  if (viewBtn && viewMenu) {
    const sync = () => {
      viewMenu.querySelectorAll<HTMLButtonElement>("[data-units]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.units === settings().units)));
      viewMenu.querySelectorAll<HTMLButtonElement>("[data-base]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.base === settings().base)));
    };
    menu(viewBtn, viewMenu, sync);
    viewMenu.addEventListener("click", (ev) => {
      const b = (ev.target as HTMLElement).closest<HTMLButtonElement>("button");
      if (b?.dataset.units) setSetting("units", b.dataset.units as Units);
      if (b?.dataset.base) setSetting("base", b.dataset.base as Base);
      sync();
    });
  }

  initPalette(hooks);
}

// ---------- Ctrl+K quick search ----------
function initPalette(hooks: ToolHooks) {
  const dlg = document.createElement("dialog");
  dlg.className = "palette";
  dlg.setAttribute("aria-label", "Quick search");
  dlg.innerHTML = `<input class="palette__input" type="search" role="combobox" aria-expanded="true" aria-controls="pal-list" aria-autocomplete="list" placeholder="Search a fighter…" autocomplete="off" spellcheck="false">
    <ul class="palette__list" id="pal-list" role="listbox"></ul>
    <p class="palette__keys">${hooks.pick ? "<kbd>Enter</kbd> red corner · <kbd>Shift</kbd>+<kbd>Enter</kbd> blue corner · " : "<kbd>Enter</kbd> compare · "}<kbd>Ctrl</kbd>+<kbd>Enter</kbd> profile · <kbd>Esc</kbd> close</p>`;
  document.body.append(dlg);
  const input = dlg.querySelector<HTMLInputElement>("input")!;
  const list = dlg.querySelector<HTMLUListElement>("ul")!;
  let items: Searchable[] | null = null;
  let results: IndexEntry[] = [];
  let active = 0;

  const draw = () => {
    results = items ? search(items, input.value, {}, 8) : [];
    active = Math.min(active, Math.max(0, results.length - 1));
    list.innerHTML = results
      .map(
        (e, i) => `<li id="pal-${i}" role="option" aria-selected="${i === active}" data-i="${i}">
          <span class="opt__name">${esc(e.name)}</span><span class="opt__meta">${[e.weight_class, e.record].filter(Boolean).map((x) => esc(x!)).join(" · ")}</span>
          <span class="palette__acts">${hooks.pick ? `<button type="button" data-go="a" class="pa pa--a">Red</button><button type="button" data-go="b" class="pa pa--b">Blue</button>` : `<button type="button" data-go="a" class="pa">Compare</button>`}<button type="button" data-go="p" class="pa">Profile</button></span>
        </li>`,
      )
      .join("");
    if (results.length) input.setAttribute("aria-activedescendant", `pal-${active}`);
  };
  const go = (i: number, where: "a" | "b" | "p") => {
    const e = results[i];
    if (!e) return;
    dlg.close();
    if (where === "p") location.href = `/fighters/${e.slug}/`;
    else if (hooks.pick) hooks.pick(where, e.slug);
    else location.href = `/?a=${e.slug}`;
  };
  const open = async () => {
    if (dlg.open) return;
    input.value = "";
    active = 0;
    dlg.showModal();
    input.focus();
    if (!items) {
      try {
        items = prepare(await loadIndex());
      } catch {
        list.innerHTML = `<li class="opt--none">Fighter list could not load.</li>`;
        return;
      }
    }
    draw();
  };

  document.querySelector("#t-search")?.addEventListener("click", open);
  document.addEventListener("keydown", (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "k") {
      ev.preventDefault();
      void open();
    }
  });
  input.addEventListener("input", () => {
    active = 0;
    draw();
  });
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      if (results.length) active = (active + (ev.key === "ArrowDown" ? 1 : -1) + results.length) % results.length;
      draw();
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      go(active, ev.ctrlKey || ev.metaKey ? "p" : ev.shiftKey ? "b" : "a");
    }
  });
  list.addEventListener("click", (ev) => {
    const t = ev.target as HTMLElement;
    const li = t.closest<HTMLElement>("[data-i]");
    if (!li) return;
    go(Number(li.dataset.i), ((t.closest<HTMLElement>("[data-go]")?.dataset.go as "a" | "b" | "p") ?? "a"));
  });
  dlg.addEventListener("click", (ev) => {
    if (ev.target === dlg) dlg.close();
  });
}
