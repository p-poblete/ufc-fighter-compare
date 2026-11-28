// Client script of /groups/: list in the URL (?f=), picker, legend, radar and table (docs/spec.md §11.1 #3).
import { loadFighter, loadIndex, type Fighter, type IndexEntry } from "./data";
import { drawGroupRadar } from "./charts";
import { esc, DASH } from "./format";
import { GROUP_COLORS, MAX_GROUP, MIN_GROUP, NOTE_FULL, NOTE_FEW, bestPerRow, groupPcts, groupPopulation, groupQuery, parseGroup } from "./groups";
import { setupPicker } from "./picker";
import { METRICS, RAW, recordText } from "./render";
import { prepare } from "./search";
import { initTools } from "./tools";
import { settings } from "./settings";

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const NO_DATA = "fewer than 3 UFC fights or missing career stats";

export async function boot(): Promise<void> {
  initTools({ group: () => null });
  let index: IndexEntry[];
  try {
    index = await loadIndex();
  } catch {
    $("#g-notes").innerHTML = `<li class="warn">Fighter list could not load. Reload the page to try again.</li>`;
    return;
  }
  const bySlug = new Map(index.map((e) => [e.slug, e]));
  const parse = () => parseGroup(new URLSearchParams(location.search).get("f"), (s) => bySlug.has(s));
  let state = parse();
  // Clean URL: the shown list is the canonical one (duplicates, unknown and extra slugs dropped); the notices stay on screen.
  if (location.search !== groupQuery(state.slugs)) history.replaceState(null, "", `${location.pathname}${groupQuery(state.slugs)}`);
  let transient: string[] = [];
  let renderId = 0;

  async function render(): Promise<void> {
    const id = ++renderId;
    let fs: Fighter[];
    try {
      fs = await Promise.all(state.slugs.map((s) => loadFighter(s)));
    } catch {
      if (id === renderId) $("#g-notes").innerHTML = `<li class="warn">A fighter could not load. Check your connection and try again.</li>`;
      return;
    }
    if (id !== renderId) return;
    const full = fs.length >= MAX_GROUP;
    const notes = [...state.notes, ...transient];
    if (full && !notes.includes(NOTE_FULL)) notes.push(NOTE_FULL);
    if (fs.length < MIN_GROUP && !notes.includes(NOTE_FEW)) notes.push(NOTE_FEW);
    $("#g-notes").innerHTML = notes.map((n) => `<li class="warn">${esc(n)}</li>`).join("");
    const pick = $(".pick");
    pick.classList.toggle("is-off", full);
    pick.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input, button").forEach((el) => (el.disabled = full));

    const { pop, division } = groupPopulation(fs, settings().base === "global");
    const pcts = fs.map((f) => groupPcts(f, pop));
    const color = (i: number) => GROUP_COLORS[i];
    const ready = fs.length >= MIN_GROUP;

    // Legend
    $("#g-pop").textContent = !fs.length ? "" : division ? `Percentiles vs ${division}` : "Percentiles vs all fighters";
    $("#g-legend").innerHTML = fs
      .map(
        (f, i) => `<li class="grp__item" style="--gc:${color(i)}">
          <span class="grp__dot" aria-hidden="true"></span>
          <div class="grp__who"><b>${esc(f.name)}</b>
            <span class="muted">${esc(f.weight_class ?? "No division")} · ${esc(recordText(f))}</span>
            ${pcts[i] ? "" : `<span class="nodata">No data · ${NO_DATA}</span>`}</div>
          <button type="button" class="grp__rm" data-slug="${f.slug}" aria-label="Remove ${esc(f.name)} from the group"><span aria-hidden="true">×</span></button>
        </li>`,
      )
      .join("");

    // Radar: one polygon per fighter with data; empty web below 2 fighters
    const radar = $("#g-radar");
    drawGroupRadar(
      radar,
      ready ? fs.flatMap((f, i) => (pcts[i] ? [{ name: f.name, color: color(i), values: METRICS.map(([m]) => pcts[i]![m]) }] : [])) : [],
    );
    radar.setAttribute("aria-label", ready ? `Radar of the eight style percentiles for ${fs.map((f) => f.name).join(", ")}` : "Empty radar: add at least 2 fighters");

    // Table
    const panel = $("#g-table-panel");
    panel.hidden = !ready;
    if (ready) {
      const best = bestPerRow(pcts, METRICS.map(([m]) => m));
      const head = fs.map((f, i) => `<th scope="col" style="--gc:${color(i)}"><span class="grp__dot" aria-hidden="true"></span>${esc(f.name)}</th>`).join("");
      const rows = METRICS.map(([m, label]) => {
        const cells = fs
          .map((f, i) => {
            const p = pcts[i];
            if (!p) return `<td class="nodata" style="--gc:${color(i)}">No data</td>`;
            const top = best[m][i];
            const v = f.career ? RAW[m](f.career[m]) : DASH;
            return `<td style="--gc:${color(i)}"${top ? ' class="is-best"' : ""}>
              <span class="grp__val">${top ? '<i class="grp__pt" aria-hidden="true"></i>' : ""}${v}${top ? '<span class="sr"> (best in row)</span>' : ""}</span>
              <span class="grp__pct">P${Math.round(p[m])}</span>
              <span class="grp__bar" aria-hidden="true"><i style="width:${Math.round(p[m])}%"></i></span></td>`;
          })
          .join("");
        return `<tr><th scope="row">${label}</th>${cells}</tr>`;
      }).join("");
      $("#g-table").innerHTML = `<caption class="sr">Style metrics for ${fs.length} fighters: real value and percentile</caption><thead><tr><th scope="col"><span class="sr">Metric</span></th>${head}</tr></thead><tbody>${rows}</tbody>`;
    }
    document.title = fs.length ? `${fs.map((f) => f.name).join(" · ")} · UFC Fighter Compare` : "Groups · UFC Fighter Compare";
  }

  function commit(slugs: string[], note: string[] = []): Promise<void> {
    state = { slugs, notes: [] };
    transient = note;
    history.pushState(null, "", `${location.pathname}${groupQuery(slugs)}`);
    return render();
  }

  setupPicker("g", prepare(index), (_side, slug) => {
    const name = bySlug.get(slug)?.name ?? slug;
    if (state.slugs.includes(slug)) {
      transient = [`${name} is already in the group`];
      void render();
    } else if (state.slugs.length >= MAX_GROUP) {
      transient = [NOTE_FULL];
      void render();
    } else {
      void commit([...state.slugs, slug]);
      $("#live").textContent = `${name} added to the group.`;
    }
  });

  $("#g-legend").addEventListener("click", (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>(".grp__rm");
    if (!btn) return;
    const name = bySlug.get(btn.dataset.slug!)?.name ?? "Fighter";
    $("#live").textContent = `${name} removed from the group.`;
    // Focus after the render: with 4 fighters the input is still disabled until render re-enables it.
    void commit(state.slugs.filter((s) => s !== btn.dataset.slug)).then(() =>
      document.querySelector<HTMLInputElement>(".pick .combo__input")?.focus(),
    );
  });

  addEventListener("popstate", () => {
    state = parse();
    transient = [];
    void render();
  });
  document.addEventListener("settings:change", () => void render());
  void render();
}
