// Pure HTML builders shared by the build (prerendered pages) and the client script.
import type { Fight, Fighter, Method, Metric, OddsType } from "./data";
import { DASH, ageFrom, dateLong, esc, feetInches, initials } from "./format";

export type Tone = "a" | "b" | "solo";

const CORNER: Record<Tone, string> = { a: "Red corner", b: "Blue corner", solo: "" };
export const METHODS: [Method, string][] = [
  ["KO/TKO", "KO/TKO"],
  ["SUB", "Submission"],
  ["DEC", "Decision"],
  ["OTHER", "Other"],
];
export const METRICS: [Metric, string][] = [
  ["slpm", "Strikes landed / min"],
  ["str_acc", "Striking accuracy"],
  ["sapm", "Strikes absorbed / min"],
  ["str_def", "Striking defence"],
  ["td_avg", "Takedowns / 15 min"],
  ["td_acc", "Takedown accuracy"],
  ["td_def", "Takedown defence"],
  ["sub_avg", "Submissions / 15 min"],
];
export const ODDS_TYPES: OddsType[] = ["Heavy favorite", "Favorite", "Pick'em", "Underdog", "Heavy underdog"];

// ---------- figures ----------
export function age(f: Fighter, today?: Date): number | null {
  return f.dob ? ageFrom(f.dob, today) : f.age;
}
const totalFights = (f: Fighter) => f.record.wins + f.record.losses + f.record.draws;
export const winRate = (f: Fighter) => (totalFights(f) ? (f.record.wins / totalFights(f)) * 100 : null);
export const finishRate = (f: Fighter) =>
  f.ufc_record.W ? ((f.wins_by["KO/TKO"] + f.wins_by.SUB) / f.ufc_record.W) * 100 : null;
const pctText = (x: number | null) => (x == null ? DASH : `${Math.round(x)}%`);
const signed = (x: number | null) => (x == null ? DASH : `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(Math.round(x))}%`);
export const clock = (s: number | null) => (s == null ? DASH : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
const recordText = (f: Fighter) => `${f.record.wins}-${f.record.losses}-${f.record.draws}`;

/** Percentile population: the pair's shared division when both have one, else all fighters. */
export function population(a: Fighter | null, b: Fighter | null = null): "division" | "global" {
  if (a && b) {
    return a.weight_class && a.weight_class === b.weight_class && a.percentiles?.division && b.percentiles?.division
      ? "division"
      : "global";
  }
  return (a ?? b)?.percentiles?.division ? "division" : "global";
}
export const popLabel = (pop: "division" | "global", f: Fighter | null) =>
  pop === "division" && f?.weight_class ? `vs ${f.weight_class}` : "vs all fighters";

export function title(a: Fighter | null, b: Fighter | null): string {
  if (a && b) return `${a.name} vs ${b.name}`;
  return (a ?? b)?.name ?? "Compare two UFC fighters";
}

/** A panel; an empty heading leaves the header out (the content names itself) and uses `label` for assistive tech. */
const panel = (cls: string, heading: string, body: string, aside = "", label = "") =>
  heading
    ? `<section class="panel ${cls}"><header class="panel__head"><h2>${heading}</h2>${aside ? `<span class="panel__aside">${aside}</span>` : ""}</header>${body}</section>`
    : `<section class="panel ${cls}"${label ? ` aria-label="${label}"` : ""}>${body}</section>`;
const noData = (why: string) => `<p class="nodata">No data · ${esc(why)}</p>`;

// ---------- one fighter's own column ----------
export function identity(f: Fighter | null, tone: Tone, warning: string | null = null, link = true): string {
  const warn = warning ? `<p class="warn" role="status">${esc(warning)}</p>` : "";
  const corner = CORNER[tone] ? `<p class="corner">${CORNER[tone]}</p>` : "";
  if (!f) {
    return `<section class="panel id id--empty" data-tone="${tone}">${corner}${warn}<p class="nodata">Search for the ${
      tone === "a" ? "red" : "blue"
    } corner in the bar above.</p></section>`;
  }
  const sub = [f.nickname ? `“${esc(f.nickname)}”` : null, f.weight_class ? esc(f.weight_class) : null]
    .filter(Boolean)
    .join(" · ");
  const name = link ? `<a href="/fighters/${f.slug}/">${esc(f.name)}</a>` : esc(f.name);
  const years = age(f);
  const facts = [
    years != null ? `${years} years` : null,
    f.height_cm != null ? `${Math.round(f.height_cm)} cm` : null,
    f.reach_cm != null ? `${Math.round(f.reach_cm)} cm reach` : null,
    f.stance ? esc(f.stance) : null,
  ].filter(Boolean);
  return `<section class="panel id" data-tone="${tone}">
    <div class="frame" aria-hidden="true"><span>${esc(initials(f.name))}</span></div>
    <div class="id__text">
      ${corner}
      <h2 class="id__name">${name}</h2>
      ${sub ? `<p class="id__sub">${sub}</p>` : ""}
      <p class="id__facts">${archetypeChip(f.archetype)}${facts.join(" · ") || DASH}</p>
    </div>
    ${warn}
  </section>`;
}

/** R3: big record and the last 10 UFC results, newest first. */
export function form(f: Fighter): string {
  const last = f.fights.slice(0, 10);
  const strip = last.length
    ? `<ol class="form" aria-label="Last ${last.length} UFC fights, newest first">${last
        .map((x) => `<li class="r-${x.result}" title="${esc(`${dateLong(x.date)} · ${x.result} vs ${x.opponent} · ${x.method_detail}`)}">${x.result}</li>`)
        .join("")}</ol>`
    : noData("no UFC fights since 2010");
  const u = f.ufc_record;
  return panel(
    "rec",
    "",
    `<p class="bignum">${recordText(f)}</p><p class="muted">Professional record. In the UFC since 2010: ${u.W}-${u.L}-${u.D}${u.NC ? `, ${u.NC} NC` : ""}</p>${strip}<p class="foot">Last ${last.length} UFC fights, newest first</p>`,
    "",
    "Record and form",
  );
}

/** M2: one 100% bar of wins by method, losses under it. */
export function methodMix(f: Fighter, tone: Tone): string {
  const bar = (by: Record<Method, number>, label: string) => {
    const total = METHODS.reduce((s, [k]) => s + by[k], 0);
    const stack = total
      ? `<div class="stack" data-tone="${tone}">${METHODS.map(([k, l], i) =>
          by[k] ? `<span class="t${i}" style="flex:${by[k]}" title="${l}: ${by[k]}">${by[k]}</span>` : "",
        ).join("")}</div>`
      : `<div class="stack stack--empty"></div>`;
    return `<div class="mix"><p class="mix__label">${label} <span>${total}</span></p>${stack}</div>`;
  };
  const legend = `<p class="legend">${METHODS.slice(0, 3)
    .map(([, l], i) => `<span><i class="t${i}" data-tone="${tone}"></i>${l}</span>`)
    .join("")}</p>`;
  return panel("methods", "How the fights end", bar(f.wins_by, "Wins") + bar(f.losses_by, "Losses") + legend, "UFC since 2010");
}

/** Betting: ROI by odds type with n, and wins against the market's expectation. */
export function betting(f: Fighter): string {
  const o = f.odds;
  if (o.total.no_data) return panel("bets", "Betting", noData("no odds on record"));
  const rows = ODDS_TYPES.map((t) => {
    const c = o.by_type[t];
    const cls = c.no_data ? "" : (c.roi_pct ?? 0) >= 0 ? "pos" : "neg";
    const flag = c.small_sample ? '<abbr class="small" title="Small sample: fewer than 5 fights">*</abbr>' : "";
    return `<tr><th scope="row">${t}</th><td class="num">${c.n}</td><td class="num ${cls}">${c.no_data ? DASH : signed(c.roi_pct)}${flag}</td></tr>`;
  }).join("");
  const ev = o.expected_vs_actual;
  const evLine =
    ev.expected_wins != null && ev.actual_wins != null
      ? `<p class="muted">Won ${ev.actual_wins} of ${ev.n} priced fights; the odds expected ${ev.expected_wins.toFixed(1)}.</p>`
      : "";
  const total = o.total.roi_pct ?? 0;
  return panel(
    "bets",
    "Betting",
    `<p class="bignum ${total >= 0 ? "pos" : "neg"}">${signed(o.total.roi_pct)}</p>
    <p class="muted">ROI of backing every fight with ${o.stake}. ${o.total.n} fights with odds, ${Math.round(o.total.coverage * 100)}% of their UFC fights.</p>
    <table class="mini"><thead><tr><th scope="col">Odds</th><th scope="col" class="num">n</th><th scope="col" class="num">ROI</th></tr></thead><tbody>${rows}</tbody></table>
    ${evLine}<p class="foot">* small sample, fewer than 5 fights</p>`,
  );
}

function fightRow(x: Fight, slug: string): string {
  const where = x.round ? `R${x.round} ${clock(x.round_time_s)}` : DASH;
  return `<li class="fight">
    <span class="res r-${x.result}">${x.result}</span>
    <span class="fight__main"><a href="/?a=${slug}&amp;b=${x.opponent_slug}">${esc(x.opponent)}</a><span class="muted">${esc(x.method_detail)} · ${where}</span></span>
    <span class="fight__side"><time datetime="${x.date}">${x.date.slice(0, 7)}</time><span class="muted">${x.odds ? x.odds.toFixed(2) : DASH}</span></span>
  </li>`;
}

/** History: the last fights, and every UFC fight behind a disclosure. */
export function history(f: Fighter, show = 5): string {
  if (!f.fights.length) return panel("hist", "Fight history", noData("no UFC fights since 2010"));
  const head = f.fights.slice(0, show).map((x) => fightRow(x, f.slug)).join("");
  const rest = f.fights.slice(show);
  const more = rest.length
    ? `<details class="more"><summary>All ${f.fights.length} UFC fights</summary><ol class="fights">${rest.map((x) => fightRow(x, f.slug)).join("")}</ol></details>`
    : "";
  return panel("hist", "Fight history", `<ol class="fights">${head}</ol>${more}`, "date · decimal odds");
}

export function ownColumn(f: Fighter | null, tone: Tone, warning: string | null = null): string {
  return identity(f, tone, warning) + (f ? form(f) + methodMix(f, tone) + betting(f) + history(f) : "");
}

// ---------- shared centre ----------
type Row = { label: string; a: string; b: string; ea?: boolean; eb?: boolean };

/** K2 + tape in one mirrored table: figures with an edge mark, then the physical facts with the gap written. */
export function matchup(a: Fighter, b: Fighter, today?: Date): string {
  const edge = (x: number | null, y: number | null) => ({ ea: x != null && y != null && x > y, eb: x != null && y != null && y > x });
  const gap = (x: number | null, y: number | null, unit: string) =>
    x != null && y != null && Math.abs(x - y) >= 0.5 ? `<span class="gap">${Math.round(Math.abs(x - y) * 10) / 10} ${unit} apart</span>` : "";
  const wa = winRate(a), wb = winRate(b), fa = finishRate(a), fb = finishRate(b);
  const ra = a.odds.total.roi_pct, rb = b.odds.total.roi_pct;
  const ag = age(a, today), bg = age(b, today);
  const min = (x: number | null) => (x == null ? DASH : `${x.toFixed(1)} min`);
  const cm = (x: number | null, extra: (x: number) => string) => (x == null ? DASH : `${Math.round(x)} cm <small>${extra(x)}</small>`);
  const rows: Row[] = [
    { label: "Win rate", a: pctText(wa), b: pctText(wb), ...edge(wa, wb) },
    { label: "Finish rate in the UFC", a: pctText(fa), b: pctText(fb), ...edge(fa, fb) },
    { label: "Betting ROI", a: signed(ra), b: signed(rb), ...edge(ra, rb) },
    { label: "Average fight", a: min(a.duration.avg_minutes), b: min(b.duration.avg_minutes) },
    { label: `Age${gap(ag, bg, "years")}`, a: ag == null ? DASH : `${ag}`, b: bg == null ? DASH : `${bg}` },
    { label: `Height${gap(a.height_cm, b.height_cm, "cm")}`, a: cm(a.height_cm, feetInches), b: cm(b.height_cm, feetInches) },
    { label: `Reach${gap(a.reach_cm, b.reach_cm, "cm")}`, a: cm(a.reach_cm, (x) => `${Math.round(x / 2.54)}″`), b: cm(b.reach_cm, (x) => `${Math.round(x / 2.54)}″`) },
    { label: `Weight${gap(a.weight_lbs, b.weight_lbs, "lb")}`, a: a.weight_lbs == null ? DASH : `${a.weight_lbs} lb`, b: b.weight_lbs == null ? DASH : `${b.weight_lbs} lb` },
    { label: "Stance", a: a.stance ? esc(a.stance) : DASH, b: b.stance ? esc(b.stance) : DASH },
    { label: "Division", a: a.weight_class ? esc(a.weight_class) : DASH, b: b.weight_class ? esc(b.weight_class) : DASH },
  ];
  const mark = '<span class="edge">Edge</span>';
  return panel(
    "k2",
    "",
    rows
      .map(
        (r, i) =>
          `<div class="k2__row${i === 4 ? " k2__row--split" : ""}${i >= 4 ? " k2__row--fact" : ""}"><span class="k2__v a">${r.ea ? mark : ""}${r.a}</span><span class="k2__l">${r.label}</span><span class="k2__v b">${r.b}${r.eb ? mark : ""}</span></div>`,
      )
      .join(""),
    "",
    "Figures and tale of the tape",
  );
}

const mirrorRow = (label: string, x: number, y: number, max: number) =>
  `<div class="mir"><span class="mir__bar a"><i style="width:${(x / max) * 100}%"></i><b>${x}</b></span><span class="mir__l">${label}</span><span class="mir__bar b"><i style="width:${(y / max) * 100}%"></i><b>${y}</b></span></div>`;

/** R1 + M3: record and methods, mirrored on one scale per group. */
export function recordMirror(a: Fighter, b: Fighter): string {
  const rec: [string, number, number][] = [
    ["Wins", a.record.wins, b.record.wins],
    ["Losses", a.record.losses, b.record.losses],
    ["Draws", a.record.draws, b.record.draws],
  ];
  const mr = Math.max(1, ...rec.flatMap(([, x, y]) => [x, y]));
  const meth = (key: "wins_by" | "losses_by") => {
    const rows = METHODS.filter(([k]) => k !== "OTHER" || a[key].OTHER || b[key].OTHER);
    const mx = Math.max(1, ...rows.flatMap(([k]) => [a[key][k], b[key][k]]));
    return rows.map(([k, l]) => mirrorRow(l, a[key][k], b[key][k], mx)).join("");
  };
  return panel(
    "r1",
    "",
    `<div class="grp"><h3>Professional record</h3>${rec.map(([l, x, y]) => mirrorRow(l, x, y, mr)).join("")}</div>
     <div class="grp"><h3>Wins by method <span>UFC since 2010</span></h3>${meth("wins_by")}</div>
     <div class="grp"><h3>Losses by method <span>UFC since 2010</span></h3>${meth("losses_by")}</div>`,
    "",
    "Record and methods",
  );
}

const RAW: Record<Metric, (x: number) => string> = {
  slpm: (x) => x.toFixed(2), str_acc: (x) => `${Math.round(x)}%`, sapm: (x) => x.toFixed(2), str_def: (x) => `${Math.round(x)}%`,
  td_avg: (x) => x.toFixed(2), td_acc: (x) => `${Math.round(x)}%`, td_def: (x) => `${Math.round(x)}%`, sub_avg: (x) => x.toFixed(1),
};

/** Style: the radar (P1) large in the middle, the eight metrics under it as a spec sheet (percentile and raw value). */
export function styleBlock(a: Fighter | null, b: Fighter | null): string {
  const pop = population(a, b);
  const pa = a?.percentiles?.[pop] ?? null;
  const pb = b?.percentiles?.[pop] ?? null;
  const solo = !b;
  if (!pa && !pb) return panel("style", "", noData("no style data: fewer than 3 UFC fights or missing career stats"), "", "Style");
  const val = (f: Fighter | null, p: Record<Metric, number> | null, m: Metric, cls: string) =>
    p && f?.career
      ? `<span class="spec__v ${cls}"><b>${Math.round(p[m])}</b><small>${RAW[m](f.career[m])}</small></span>`
      : `<span class="spec__v ${cls}"><b>${DASH}</b></span>`;
  const cells = METRICS.map(
    ([m, l]) =>
      `<div class="spec__cell"><p class="spec__l">${l}</p><div class="spec__vals">${val(a, pa, m, solo ? "s" : "a")}${solo ? "" : val(b, pb, m, "b")}</div></div>`,
  ).join("");
  return panel(
    `style${solo ? " style--solo" : ""}`,
    "",
    `<div class="chart chart--radar" data-chart="radar" role="img" aria-label="Radar of the eight style percentiles"></div>
     <div class="spec">${cells}</div>
     <p class="foot">Large figure: percentile ${popLabel(pop, a ?? b)}, 100 is best (strikes absorbed inverted). Small figure: career value from UFCStats.</p>`,
    "",
    "Style",
  );
}

const RANGES = [
  ["all", "All"],
  ["5y", "5 years"],
  ["3y", "3 years"],
  ["10", "Last 10"],
] as const;
const rangeControl = () =>
  `<div class="seg seg--range" role="group" aria-label="Time span">${RANGES.map(
    ([k, l], i) => `<button type="button" data-range="${k}" aria-pressed="${i === 0}">${l}</button>`,
  ).join("")}</div>`;

export function chartPanels(solo = false): string {
  const metrics = [
    ["slpm", "Strikes / min"],
    ["acc", "Accuracy"],
    ["td", "Takedowns"],
    ["sub", "Sub. attempts"],
  ]
    .map(([k, l], i) => `<button type="button" data-metric="${k}" aria-pressed="${i === 0}">${l}</button>`)
    .join("");
  const head = (title: string) => `<header class="panel__head"><h2>${title}</h2>${rangeControl()}</header>`;
  return (
    `<section class="panel perf">${head("Performance by fight")}
       <div class="seg" role="group" aria-label="Metric">${metrics}</div>
       <div class="chart" data-chart="perf" role="img" aria-label="Per-fight performance over time"></div>
       <p class="foot">Filled point: win. Ring: loss. Diamond: draw or no contest.</p></section>` +
    `<section class="panel roi">${head("Return per fight")}
       <div class="chart" data-chart="roi" role="img" aria-label="Net return of a 100 bet on each fight, by odds type"></div>
       <p class="foot roi__note">Net result of backing ${solo ? "the fighter" : "each fighter"} with 100 at the decimal odds. Right of the line is profit.</p></section>` +
    `<section class="panel dur">${head("Fight length")}
       <div class="chart chart--short" data-chart="dur" role="img" aria-label="Distribution of fight length in minutes"></div></section>`
  );
}

export function centre(a: Fighter | null, b: Fighter | null, today?: Date): string {
  if (!a || !b) {
    return `<section class="panel waiting"><h2>Pick both corners</h2><p class="muted">The shared charts appear with a fighter in each corner. Each fighter's own column still shows their record, methods, betting and history.</p></section>`;
  }
  return matchup(a, b, today) + styleBlock(a, b) + recordMirror(a, b);
}

/** Full-width row under the three columns: the fight-by-fight charts. */
export function fightCharts(a: Fighter | null, b: Fighter | null): string {
  return a && b ? chartPanels() : "";
}

/** Archetype chip, coloured by style. */
export const archetypeChip = (x: string | null) => (x ? `<span class="chip chip--${x.toLowerCase()}">${esc(x)}</span> ` : "");
