// Pure HTML builders shared by the build (prerendered pages) and the client script.
// Every block is a module (docs/spec.md §3.2) with a data-module name and one question to answer.
import type { Fight, Fighter, Method, Metric, OddsType } from "./data";
import { DASH, ageFrom, dateLong, esc, feetInches, initials, lastName } from "./format";

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
const RESULT: Record<Fight["result"], string> = { W: "Win", L: "Loss", D: "Draw", NC: "No contest" };

// ---------- figures ----------
export function age(f: Fighter, today?: Date): number | null {
  return f.dob ? ageFrom(f.dob, today) : f.age;
}
const totalFights = (f: Fighter) => f.record.wins + f.record.losses + f.record.draws;
export const winRate = (f: Fighter) => (totalFights(f) ? (f.record.wins / totalFights(f)) * 100 : null);
export const finishRate = (f: Fighter) =>
  f.ufc_record.W ? ((f.wins_by["KO/TKO"] + f.wins_by.SUB) / f.ufc_record.W) * 100 : null;
export const pctText = (x: number | null) => (x == null ? DASH : `${Math.round(x)}%`);
export const signed = (x: number | null) => (x == null ? DASH : `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(Math.round(x))}%`);
export const clock = (s: number | null) => (s == null ? DASH : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);

/** Current streak from the newest UFC fight: "W3", "L1"; draws and no contests end it. */
export function streak(f: Fighter): string | null {
  const first = f.fights[0]?.result;
  if (first !== "W" && first !== "L") return null;
  let n = 0;
  for (const x of f.fights) {
    if (x.result !== first) break;
    n++;
  }
  return `${first}${n}`;
}

/** Percentile population: the pair's shared division when both have one, else all fighters. */
export function population(a: Fighter | null, b: Fighter | null = null): "division" | "global" {
  if (a && b) {
    return a.weight_class && a.weight_class === b.weight_class && a.percentiles?.division && b.percentiles?.division ? "division" : "global";
  }
  return (a ?? b)?.percentiles?.division ? "division" : "global";
}
export const popLabel = (pop: "division" | "global", f: Fighter | null) =>
  pop === "division" && f?.weight_class ? `vs ${f.weight_class}` : "vs all fighters";

export function title(a: Fighter | null, b: Fighter | null): string {
  if (a && b) return `${a.name} vs ${b.name}`;
  return (a ?? b)?.name ?? "Compare two UFC fighters";
}

/** A module. An empty heading leaves the header out and names the block for assistive tech instead. */
function mod(name: string, heading: string, body: string, opts: { aside?: string; label?: string; cls?: string; tone?: Tone } = {}): string {
  const attrs = `class="panel ${opts.cls ?? ""}" data-module="${name}"${opts.tone ? ` data-tone="${opts.tone}"` : ""}`;
  if (!heading) return `<section ${attrs} aria-label="${opts.label ?? name}">${body}</section>`;
  return `<section ${attrs}><header class="panel__head"><h2>${heading}</h2>${opts.aside ?? ""}</header>${body}</section>`;
}
const noData = (why: string) => `<p class="nodata">No data · ${esc(why)}</p>`;
const aside = (t: string) => `<span class="panel__aside">${t}</span>`;
export const archetypeChip = (x: string | null) => (x ? `<span class="chip chip--${x.toLowerCase()}">${esc(x)}</span>` : "");

// ---------- corner.* (one fighter, against their edge) ----------
/** corner.identity. Physical facts only when no duel.matchup shows them (profile, or one corner empty). */
export function identity(f: Fighter | null, tone: Tone, warning: string | null = null, withFacts = false): string {
  const warn = warning ? `<p class="warn" role="status">${esc(warning)}</p>` : "";
  const corner = CORNER[tone] ? `<p class="corner">${CORNER[tone]}</p>` : "";
  if (!f) {
    return mod("corner.identity", "", `${corner}${warn}<p class="nodata">Search for the ${tone === "a" ? "red" : "blue"} corner in the bar above.</p>`, {
      cls: "id id--empty",
      tone,
      label: CORNER[tone] || "Fighter",
    });
  }
  const sub = [f.nickname ? `“${esc(f.nickname)}”` : null, f.weight_class ? esc(f.weight_class) : null].filter(Boolean).join(" · ");
  const name = tone === "solo" ? esc(f.name) : `<a href="/fighters/${f.slug}/">${esc(f.name)}</a>`;
  const years = age(f);
  const facts = withFacts
    ? [
        years != null ? `${years} years` : null,
        f.height_cm != null ? `${Math.round(f.height_cm)} cm` : null,
        f.reach_cm != null ? `${Math.round(f.reach_cm)} cm reach` : null,
        f.weight_lbs != null ? `${f.weight_lbs} lb` : null,
        f.stance ? esc(f.stance) : null,
      ].filter(Boolean)
    : [];
  return mod(
    "corner.identity",
    "",
    `<div class="frame" aria-hidden="true"><span>${esc(initials(f.name))}</span></div>
     <div class="id__text">
       ${corner}
       <h2 class="id__name">${name}</h2>
       ${sub ? `<p class="id__sub">${sub}</p>` : ""}
       ${archetypeChip(f.archetype)}
       ${facts.length ? `<p class="id__facts">${facts.join(" · ")}</p>` : ""}
     </div>${warn}`,
    { cls: "id", tone, label: f.name },
  );
}

/** corner.record: professional and UFC record, current streak, last 10 results. */
export function record(f: Fighter, tone: Tone): string {
  const last = f.fights.slice(0, 10);
  const u = f.ufc_record;
  const st = streak(f);
  const strip = last.length
    ? `<ol class="form" aria-label="Last ${last.length} UFC results, newest first">${last
        .map((x) => `<li class="r-${x.result}" title="${esc(`${dateLong(x.date)} · ${RESULT[x.result]} vs ${x.opponent}`)}">${x.result}</li>`)
        .join("")}</ol>`
    : noData("no UFC fights since 2010");
  return mod(
    "corner.record",
    "",
    `<div class="rec__top">
       <p class="display">${f.record.wins}-${f.record.losses}-${f.record.draws}</p>
       ${st ? `<p class="streak"><b class="metal metal--${st[0]}">${st}</b><span>${st[0] === "W" ? "win" : "losing"} streak</span></p>` : ""}
     </div>
     <p class="muted">Professional record · UFC since 2010 ${u.W}-${u.L}-${u.D}${u.NC ? ` (${u.NC} NC)` : ""}</p>
     ${strip}`,
    { cls: "rec", tone, label: "Record and form" },
  );
}

/** corner.finishes (M2): how the wins and the losses ended. */
export function finishes(f: Fighter, tone: Tone): string {
  const bar = (by: Record<Method, number>, label: string) => {
    const total = METHODS.reduce((s, [k]) => s + by[k], 0);
    const stack = total
      ? `<div class="stack">${METHODS.map(([k, l], i) => (by[k] ? `<span class="m${i}" style="flex:${by[k]}" title="${l}: ${by[k]}">${by[k]}</span>` : "")).join("")}</div>`
      : `<div class="stack stack--empty"></div>`;
    return `<div class="mix"><p class="mix__label">${label} <span>${total}</span></p>${stack}</div>`;
  };
  const legend = `<p class="legend">${METHODS.slice(0, 3).map(([, l], i) => `<span><i class="m${i}"></i>${l}</span>`).join("")}<span class="legend__note">UFC since 2010</span></p>`;
  return mod("corner.finishes", "", bar(f.wins_by, "Wins") + bar(f.losses_by, "Losses") + legend, { tone, label: "How the fights end" });
}

/** corner.history: every UFC fight; the whole row opens fight.dialog. */
export function history(f: Fighter, show = 6, tone: Tone = "solo"): string {
  if (!f.fights.length) return mod("corner.history", "Fight history", noData("no UFC fights since 2010"));
  const row = (x: Fight, i: number) => `<li><button type="button" class="fight" data-fight="${i}" data-slug="${f.slug}" data-tone="${tone}" aria-haspopup="dialog">
      <span class="res r-${x.result}" aria-label="${RESULT[x.result]}">${x.result}</span>
      <span class="fight__main"><b>${esc(x.opponent)}</b><span>${esc(x.method_detail)}${x.round ? ` · R${x.round} ${clock(x.round_time_s)}` : ""}</span></span>
      <time class="fight__date" datetime="${x.date}">${x.date.slice(0, 4)}</time>
    </button></li>`;
  const head = f.fights.slice(0, show).map(row).join("");
  const rest = f.fights.slice(show);
  const more = rest.length
    ? `<details class="more"><summary>All ${f.fights.length} UFC fights</summary><ol class="fights">${rest.map((x, i) => row(x, i + show)).join("")}</ol></details>`
    : "";
  return mod("corner.history", "Fight history", `<ol class="fights">${head}</ol>${more}`, { aside: aside("open a fight for details") });
}

export function ownColumn(f: Fighter | null, tone: Tone, warning: string | null = null, other: Fighter | null = null): string {
  // Mirrored columns: both histories show as many rows as the shorter one (max 6); the rest folds away.
  const rows = other ? Math.max(1, Math.min(6, f?.fights.length ?? 0, other.fights.length)) : 6;
  return identity(f, tone, warning, !other) + (f ? record(f, tone) + finishes(f, tone) + history(f, rows, tone) : "");
}

// ---------- duel.* (both fighters, centre) ----------
type Row = { label: string; a: string; b: string; ea?: boolean; eb?: boolean };

/** duel.matchup: who arrives better (gold dot on the leader), then the tape with up/down arrows and the gap written. */
export function matchup(a: Fighter, b: Fighter, today?: Date): string {
  const dot = '<i class="edge-dot" role="img" aria-label="Edge" title="Edge"></i>';
  const up = '<svg class="arrow arrow--up" viewBox="0 0 12 12" role="img" aria-label="higher"><path d="M6 2l4.5 7h-9z"/></svg>';
  const down = '<svg class="arrow arrow--down" viewBox="0 0 12 12" role="img" aria-label="lower"><path d="M6 10L1.5 3h9z"/></svg>';
  const gap = (x: number | null, y: number | null, unit: string) =>
    x != null && y != null && Math.abs(x - y) >= 0.5 ? `<small>${Math.round(Math.abs(x - y) * 10) / 10} ${unit} apart</small>` : "";
  const line = (label: string, va: string, vb: string, ma = "", mb = "") =>
    `<div class="mu__row"><span class="mu__v a">${ma}${va}</span><span class="mu__l">${label}</span><span class="mu__v b">${vb}${mb}</span></div>`;
  const edgeRow = (label: string, x: number | null, y: number | null) =>
    line(label, pctText(x), pctText(y), x != null && y != null && x > y ? dot : "", x != null && y != null && y > x ? dot : "");
  const tapeRow = (label: string, x: number | null, y: number | null, fmt: (v: number) => string, unit: string) => {
    const both = x != null && y != null && Math.abs(x - y) >= 0.5;
    return line(`${label}${gap(x, y, unit)}`, x == null ? DASH : fmt(x), y == null ? DASH : fmt(y), both ? (x! > y! ? up : down) : "", both ? (y! > x! ? up : down) : "");
  };
  const cm = (extra: (v: number) => string) => (v: number) => `${Math.round(v)} cm <small>${extra(v)}</small>`;
  const body =
    edgeRow("Win rate", winRate(a), winRate(b)) +
    edgeRow("Finish rate in the UFC", finishRate(a), finishRate(b)) +
    tapeRow("Age", age(a, today), age(b, today), (v) => `${v}`, "years") +
    tapeRow("Height", a.height_cm, b.height_cm, cm(feetInches), "cm") +
    tapeRow("Reach", a.reach_cm, b.reach_cm, cm((v) => `${Math.round(v / 2.54)}″`), "cm") +
    tapeRow("Weight", a.weight_lbs, b.weight_lbs, (v) => `${v} lb`, "lb") +
    line("Stance", a.stance ? esc(a.stance) : DASH, b.stance ? esc(b.stance) : DASH);
  return mod("duel.matchup", "", body, { cls: "mu", label: "Figures and tale of the tape" });
}

const RAW: Record<Metric, (x: number) => string> = {
  slpm: (x) => x.toFixed(2), str_acc: (x) => `${Math.round(x)}%`, sapm: (x) => x.toFixed(2), str_def: (x) => `${Math.round(x)}%`,
  td_avg: (x) => x.toFixed(2), td_acc: (x) => `${Math.round(x)}%`, td_def: (x) => `${Math.round(x)}%`, sub_avg: (x) => x.toFixed(1),
};

/** duel.style: the radar large with a layer control, the eight metrics under it as a spec sheet. */
export function style(a: Fighter | null, b: Fighter | null): string {
  const pop = population(a, b);
  const pa = a?.percentiles?.[pop] ?? null;
  const pb = b?.percentiles?.[pop] ?? null;
  const solo = !b;
  if (!pa && !pb) return mod("duel.style", "Style", noData("fewer than 3 UFC fights or missing career stats"));
  const val = (f: Fighter | null, p: Record<Metric, number> | null, m: Metric, cls: string) =>
    p && f?.career
      ? `<span class="spec__v ${cls}"><b>${Math.round(p[m])}</b><small>${RAW[m](f.career[m])}</small></span>`
      : `<span class="spec__v ${cls}"><b>${DASH}</b></span>`;
  const cells = METRICS.map(
    ([m, l]) => `<div class="spec__cell"><p class="spec__l">${l}</p><div class="spec__vals">${val(a, pa, m, solo ? "s" : "a")}${solo ? "" : val(b, pb, m, "b")}</div></div>`,
  ).join("");
  const layers =
    !solo && a && b
      ? `<div class="seg" role="group" aria-label="Radar layer"><button type="button" data-layer="both" aria-pressed="true">Both</button><button type="button" data-layer="a" aria-pressed="false">${esc(lastName(a.name))}</button><button type="button" data-layer="b" aria-pressed="false">${esc(lastName(b.name))}</button></div>`
      : "";
  return mod(
    "duel.style",
    "Style",
    `<div class="chart chart--radar" data-chart="radar" role="img" aria-label="Radar of the eight style percentiles"></div>
     <div class="spec">${cells}</div>
     <p class="desc">Large figure: percentile ${popLabel(pop, a ?? b)}, 100 is best (strikes absorbed inverted). Small figure: career value. Point at the radar or a metric to compare it.</p>`,
    { cls: solo ? "style style--solo" : "style", aside: `${layers}${aside(popLabel(pop, a ?? b))}` },
  );
}

export function centre(a: Fighter | null, b: Fighter | null, today?: Date): string {
  if (!a || !b) {
    return mod("duel.waiting", "Pick both corners", `<p class="muted">The comparison appears with a fighter in each corner.</p>`, { cls: "waiting" });
  }
  return matchup(a, b, today) + style(a, b);
}

// ---------- fights.* (full rows, with a time span) ----------
const RANGES = [
  ["all", "All"],
  ["5y", "5 years"],
  ["3y", "3 years"],
  ["10", "Last 10"],
] as const;
const rangeControl = () =>
  `<div class="seg" role="group" aria-label="Time span">${RANGES.map(([k, l], i) => `<button type="button" data-range="${k}" aria-pressed="${i === 0}">${l}</button>`).join("")}</div>`;

export function fightRows(solo = false): string {
  const metrics = [
    ["slpm", "Strikes / min"],
    ["acc", "Accuracy"],
    ["td", "Takedowns"],
    ["sub", "Sub. attempts"],
  ]
    .map(([k, l], i) => `<button type="button" data-metric="${k}" aria-pressed="${i === 0}">${l}</button>`)
    .join("");
  return (
    mod(
      "fights.performance",
      "Performance by fight",
      `<div class="seg" role="group" aria-label="Metric">${metrics}</div>
       <div class="chart chart--wide" data-chart="perf" role="img" aria-label="Per-fight performance over time"></div>
       <p class="desc">Each point is a fight: filled = win, ring = loss, diamond = draw or no contest. Dashed lines: each fighter's average in the span. Click a point, or point at a fight in the history, to see it.</p>`,
      { cls: "row", aside: rangeControl() },
    ) +
    mod(
      "fights.returns",
      "Betting returns",
      `<div class="ret">
         <div class="chart chart--wide" data-chart="roi" role="img" aria-label="Net return of a 100 bet on each fight, by odds type"></div>
         <div class="ret__side" data-slot="roi-table"></div>
       </div>
       <p class="desc">Net result of backing ${solo ? "the fighter" : "each fighter"} with 100 at the decimal odds of every priced fight. Dashed lines: average return per fight. * fewer than 5 fights.</p>`,
      { cls: "row", aside: rangeControl() },
    ) +
    mod(
      "fights.length",
      "Fight length",
      `<div class="ret">
         <div class="chart chart--wide" data-chart="dur" role="img" aria-label="Distribution of fight length in minutes"></div>
         <div class="ret__side" data-slot="dur-table"></div>
       </div>`,
      { cls: "row", aside: rangeControl() },
    )
  );
}

export function fightCharts(a: Fighter | null, b: Fighter | null): string {
  return a && b ? fightRows() : "";
}

// ---------- fight.dialog ----------
/** Content of the fight dialog: one fight seen from both sides (`opp` is the opponent's record of it, if found). */
export function fightDetail(f: Fighter, x: Fight, opp: Fight | null): string {
  const ret = x.odds ? (x.result === "W" ? 100 * (x.odds - 1) : x.result === "L" ? -100 : 0) : null;
  const facts: [string, string][] = [
    ["Method", esc(x.method_detail)],
    ["Ended", x.round ? `Round ${x.round}, ${clock(x.round_time_s)}` : DASH],
    ["Fight time", clock(x.fight_time_s)],
    ["Division", x.weight_class ? esc(x.weight_class) : DASH],
    [`${esc(lastName(f.name))} odds`, x.odds ? x.odds.toFixed(2) : DASH],
    [`${esc(lastName(x.opponent))} odds`, x.opp_odds ? x.opp_odds.toFixed(2) : DASH],
    ["Fair win chance", x.implied_prob_fair != null ? `${Math.round(x.implied_prob_fair * 100)}%` : DASH],
    ["Return on 100", ret == null ? DASH : `${ret > 0 ? "+" : ""}${Math.round(ret)}`],
  ];
  const s = x.stats, o = opp?.stats ?? null;
  const stat = (label: string, mine: string, theirs: string) => `<tr><td class="num">${mine}</td><th scope="row">${label}</th><td class="num">${theirs}</td></tr>`;
  const ofs = (l: number, t: number) => `${l} / ${t} <small>${t ? Math.round((l / t) * 100) : 0}%</small>`;
  const stats =
    s || o
      ? `<table class="dstats"><thead><tr><th scope="col" class="num">${esc(lastName(f.name))}</th><td></td><th scope="col" class="num">${esc(lastName(x.opponent))}</th></tr></thead><tbody>
          ${stat("Knockdowns", s ? `${s.kd}` : DASH, o ? `${o.kd}` : DASH)}
          ${stat("Significant strikes", s ? ofs(s.sig_landed, s.sig_attempted) : DASH, o ? ofs(o.sig_landed, o.sig_attempted) : DASH)}
          ${stat("Takedowns", s ? ofs(s.td, s.td_attempted) : DASH, o ? ofs(o.td, o.td_attempted) : DASH)}
          ${stat("Submission attempts", s ? `${s.sub_att}` : DASH, o ? `${o.sub_att}` : DASH)}
        </tbody></table>`
      : noData("no per-fight statistics");
  return `<header class="dlg__head">
      <span class="res res--lg r-${x.result}">${x.result}</span>
      <div><h2 id="dlg-title">${esc(lastName(f.name))} vs ${esc(x.opponent)}</h2><p class="muted">${RESULT[x.result]} · ${dateLong(x.date)}</p></div>
      <button type="button" class="dlg__close" data-close aria-label="Close">×</button>
    </header>
    <dl class="dlg__facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
    ${stats}
    <p class="dlg__actions"><a class="cta" href="/?a=${f.slug}&amp;b=${x.opponent_slug}">Compare with ${esc(x.opponent)}</a><a class="ghost" href="/fighters/${x.opponent_slug}/">${esc(x.opponent)}'s profile</a></p>`;
}
