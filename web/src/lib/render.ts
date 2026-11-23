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

const panel = (cls: string, heading: string, body: string, aside = "") =>
  `<section class="panel ${cls}"><header class="panel__head"><h2>${heading}</h2>${aside ? `<span class="panel__aside">${aside}</span>` : ""}</header>${body}</section>`;
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
      <p class="id__facts">${f.archetype ? `<span class="chip">${esc(f.archetype)}</span> ` : ""}${facts.join(" · ") || DASH}</p>
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
    "Record",
    `<p class="bignum">${recordText(f)}</p><p class="muted">Professional. In the UFC since 2010: ${u.W}-${u.L}-${u.D}${u.NC ? `, ${u.NC} NC` : ""}</p>${strip}`,
    "last 10 · newest first",
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
type Edge = { label: string; a: number | null; b: number | null; text: (x: number | null) => string; edge: boolean };

/** K2: four figures with a mark on the leader (none on fight length: longer is not better). */
export function edgeStrip(a: Fighter, b: Fighter): string {
  const rows: Edge[] = [
    { label: "Win rate", a: winRate(a), b: winRate(b), text: pctText, edge: true },
    { label: "Finish rate in the UFC", a: finishRate(a), b: finishRate(b), text: pctText, edge: true },
    { label: "Average fight", a: a.duration.avg_minutes, b: b.duration.avg_minutes, text: (x) => (x == null ? DASH : `${x.toFixed(1)} min`), edge: false },
    { label: "Betting ROI", a: a.odds.total.roi_pct, b: b.odds.total.roi_pct, text: signed, edge: true },
  ];
  const mark = '<span class="edge">Edge</span>';
  return `<section class="panel k2" aria-label="Headline figures">${rows
    .map((r) => {
      const both = r.edge && r.a != null && r.b != null;
      return `<div class="k2__row"><span class="k2__v a">${both && r.a! > r.b! ? mark : ""}${r.text(r.a)}</span><span class="k2__l">${r.label}</span><span class="k2__v b">${r.text(r.b)}${both && r.b! > r.a! ? mark : ""}</span></div>`;
    })
    .join("")}</section>`;
}

type TapeRow = { label: string; a: number | null; b: number | null; fmt: (x: number) => string; unit: string; full: number };

/** T2: mirrored tape; a bar grows on the side with the larger value and the gap is written. */
export function tape(a: Fighter, b: Fighter, today?: Date): string {
  const rows: TapeRow[] = [
    { label: "Age", a: age(a, today), b: age(b, today), fmt: (x) => `${x}`, unit: "years", full: 15 },
    { label: "Height", a: a.height_cm, b: b.height_cm, fmt: (x) => `${Math.round(x)} cm <small>${feetInches(x)}</small>`, unit: "cm", full: 20 },
    { label: "Reach", a: a.reach_cm, b: b.reach_cm, fmt: (x) => `${Math.round(x)} cm <small>${Math.round(x / 2.54)}″</small>`, unit: "cm", full: 20 },
    { label: "Weight", a: a.weight_lbs, b: b.weight_lbs, fmt: (x) => `${x} lb`, unit: "lb", full: 60 },
  ];
  const num = rows
    .map((r) => {
      const has = r.a != null && r.b != null;
      const d = has ? r.a! - r.b! : 0;
      const w = has && d ? Math.min(100, (Math.abs(d) / r.full) * 100) : 0; // full bar = a big gap for this attribute
      const gap = has && Math.abs(d) >= 0.5 ? `<span class="gap">+${Math.round(Math.abs(d) * 10) / 10} ${r.unit}</span>` : "";
      return `<div class="t2__row">
        <span class="t2__v a">${r.a == null ? DASH : r.fmt(r.a)}</span>
        <span class="t2__bar a"><i style="width:${d > 0 ? w : 0}%"></i></span>
        <span class="t2__l">${r.label}${gap}</span>
        <span class="t2__bar b"><i style="width:${d < 0 ? w : 0}%"></i></span>
        <span class="t2__v b">${r.b == null ? DASH : r.fmt(r.b)}</span>
      </div>`;
    })
    .join("");
  const text = ([
    ["Stance", a.stance, b.stance],
    ["Division", a.weight_class, b.weight_class],
  ] as const)
    .map(
      ([l, x, y]) =>
        `<div class="t2__row t2__row--text"><span class="t2__v a">${x ? esc(x) : DASH}</span><span class="t2__l">${l}</span><span class="t2__v b">${y ? esc(y) : DASH}</span></div>`,
    )
    .join("");
  return panel("t2", "Tale of the tape", num + text);
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
    "Record and methods",
    `<div class="grp"><h3>Professional record</h3>${rec.map(([l, x, y]) => mirrorRow(l, x, y, mr)).join("")}</div>
     <div class="grp"><h3>Wins by method <span>UFC since 2010</span></h3>${meth("wins_by")}</div>
     <div class="grp"><h3>Losses by method <span>UFC since 2010</span></h3>${meth("losses_by")}</div>`,
  );
}

/** P3: the 8 percentiles as bars; the client draws the radar (P1) beside them. */
export function styleBlock(a: Fighter | null, b: Fighter | null): string {
  const pop = population(a, b);
  const pa = a?.percentiles?.[pop] ?? null;
  const pb = b?.percentiles?.[pop] ?? null;
  const solo = !b;
  if (!pa && !pb) return panel("style", "Style", noData("fewer than 3 UFC fights or missing career stats"));
  const cell = (p: Record<Metric, number> | null, m: Metric, side: "a" | "b") =>
    p
      ? `<span class="mir__bar ${side}"><i style="width:${p[m]}%"></i><b>${Math.round(p[m])}</b></span>`
      : `<span class="mir__bar ${side} none"><b>${DASH}</b></span>`;
  const rows = METRICS.map(([m, l]) =>
    solo
      ? `<div class="pbar"><span class="mir__l">${l}</span>${cell(pa, m, "b")}</div>`
      : `<div class="mir">${cell(pa, m, "a")}<span class="mir__l">${l}</span>${cell(pb, m, "b")}</div>`,
  ).join("");
  return panel(
    `style${solo ? " style--solo" : ""}`,
    "Style",
    `<div class="style__grid"><div class="chart chart--radar" data-chart="radar" role="img" aria-label="Radar of the eight percentiles"></div><div class="style__bars">${rows}</div></div>
     <p class="foot">Percentiles ${popLabel(pop, a ?? b)}, 100 is best. Strikes absorbed is inverted so that higher is better there too.</p>`,
    popLabel(pop, a ?? b),
  );
}

export function chartPanels(solo = false): string {
  const buttons = [
    ["slpm", "Strikes / min"],
    ["acc", "Accuracy"],
    ["td", "Takedowns"],
    ["sub", "Sub. attempts"],
  ]
    .map(([k, l], i) => `<button type="button" data-metric="${k}" aria-pressed="${i === 0}">${l}</button>`)
    .join("");
  return (
    panel(
      "perf",
      "Performance by fight",
      `<div class="seg" role="group" aria-label="Metric">${buttons}</div><div class="chart" data-chart="perf" role="img" aria-label="Per-fight performance over time"></div>
       <p class="foot">Filled point: win. Ring: loss. Diamond: draw or no contest. UFC fights since 2010.</p>`,
    ) +
    panel(
      "roi",
      "Return per fight",
      `<div class="chart" data-chart="roi" role="img" aria-label="Net return of a 100 bet on each fight, by odds type"></div>
       <p class="foot">Net result of backing ${solo ? "the fighter" : "each fighter"} with 100 at the decimal odds. Right of the line is profit.</p>`,
    ) +
    panel("dur", "Fight length", `<div class="chart chart--short" data-chart="dur" role="img" aria-label="Distribution of fight length in minutes"></div>`, "minutes · UFC since 2010")
  );
}

export function centre(a: Fighter | null, b: Fighter | null, today?: Date): string {
  if (!a || !b) {
    return `<section class="panel waiting"><h2>Pick both corners</h2><p class="muted">The shared charts appear with a fighter in each corner. Each fighter's own column still shows their record, methods, betting and history.</p></section>`;
  }
  return edgeStrip(a, b) + tape(a, b, today) + styleBlock(a, b) + recordMirror(a, b);
}

/** Full-width row under the three columns: the fight-by-fight charts. */
export function fightCharts(a: Fighter | null, b: Fighter | null): string {
  return a && b ? chartPanels() : "";
}
