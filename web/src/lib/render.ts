// Pure HTML builders shared by the build (prerendered pages) and the client script.
// Every block is a module (docs/spec.md §3.2) with a data-module name and one question to answer.
import type { Fight, FightStats, Fighter, Method, Metric, OddsType } from "./data";
import { DASH, ageFrom, dateLong, esc, feetInches, initials, lastName } from "./format";
import { settings } from "./settings";
import { ARCHETYPES, BELT, FACT_ICONS, FLIP, SPECIALTIES, svgIcon } from "./icons";

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
export const RESULT: Record<Fight["result"], string> = { W: "Win", L: "Loss", D: "Draw", NC: "No contest" };

// ---------- figures ----------
export function age(f: Fighter, today?: Date): number | null {
  return f.dob ? ageFrom(f.dob, today) : f.age;
}
/** Professional record; when the source has none (about one in nine fighters), the UFC record, as index.json does. */
export function careerRecord(f: Fighter): { wins: number; losses: number; draws: number } {
  const r = f.record;
  return r.wins == null || r.losses == null || r.draws == null
    ? { wins: f.ufc_record.W, losses: f.ufc_record.L, draws: f.ufc_record.D }
    : { wins: r.wins, losses: r.losses, draws: r.draws };
}
export const recordText = (f: Fighter) => {
  const r = careerRecord(f);
  return `${r.wins}-${r.losses}-${r.draws}`;
};
const totalFights = (f: Fighter) => {
  const r = careerRecord(f);
  return r.wins + r.losses + r.draws;
};
export const winRate = (f: Fighter) => (totalFights(f) ? (careerRecord(f).wins / totalFights(f)) * 100 : null);
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
  const base = settings().base;
  if (base === "global") return "global";
  if (base === "division") return (!a || a.percentiles?.division) && (!b || b.percentiles?.division) ? "division" : "global";
  if (a && b) {
    return a.weight_class && a.weight_class === b.weight_class && a.percentiles?.division && b.percentiles?.division ? "division" : "global";
  }
  return (a ?? b)?.percentiles?.division ? "division" : "global";
}

// ---------- units ----------
const imperial = () => settings().units === "imperial";
export const fmtHeight = (cm: number) => (imperial() ? `${feetInches(cm)} <small>${Math.round(cm)} cm</small>` : `${Math.round(cm)} cm <small>${feetInches(cm)}</small>`);
export const fmtReach = (cm: number) => (imperial() ? `${Math.round(cm / 2.54)}″ <small>${Math.round(cm)} cm</small>` : `${Math.round(cm)} cm <small>${Math.round(cm / 2.54)}″</small>`);
export const fmtWeight = (lb: number) => (imperial() ? `${lb} lb` : `${Math.round(lb * 0.4536)} kg`);
const gapUnit = (kind: "len" | "wt") => (kind === "len" ? (imperial() ? ["in", 1 / 2.54] : ["cm", 1]) : imperial() ? ["lb", 1] : ["kg", 0.4536]) as [string, number];

export function title(a: Fighter | null, b: Fighter | null): string {
  if (a && b) return `${a.name} vs ${b.name}`;
  return (a ?? b)?.name ?? "Compare two UFC fighters";
}

/** A module. An empty heading leaves the header out and names the block for assistive tech instead. */
function mod(name: string, heading: string, body: string, opts: { aside?: string; label?: string; cls?: string; tone?: Tone } = {}): string {
  const attrs = `class="panel ${opts.cls ?? ""}" data-module="${name}"${opts.tone ? ` data-tone="${opts.tone}"` : ""}`;
  if (!heading.trim()) {
    // No title: the content names itself; controls (if any) still get their header row.
    const head = opts.aside ? `<header class="panel__head panel__head--bare">${opts.aside}</header>` : "";
    return `<section ${attrs} aria-label="${opts.label ?? name}">${head}${body}</section>`;
  }
  return `<section ${attrs}><header class="panel__head"><h2>${heading}</h2>${opts.aside ?? ""}</header>${body}</section>`;
}
const noData = (why: string) => `<p class="nodata">No data · ${esc(why)}</p>`;
/** Archetype and specialties as recognisable icons; hover or focus shows the label and its rule. */
const badge = (cls: string, label: string, rule: string, face: string) =>
  `<span class="badge ${cls}" tabindex="0" role="img" aria-label="${esc(`${label}: ${rule}`)}">${face}<span class="badge__tip"><b>${esc(label)}</b>${esc(rule)}</span></span>`;
export const archetypeChip = (x: string | null) =>
  x && ARCHETYPES[x] ? badge(`chip chip--label chip--${x.toLowerCase()}`, x, ARCHETYPES[x].rule, `${svgIcon(ARCHETYPES[x].path)}<span>${esc(x)}</span>`) : "";
/** Specialty icons on one row: every one is rendered and `fitBadges()` (lib/fit.ts) keeps as many as the row
 *  holds, folding the rest into a "+N" badge that lists them. Without script, up to 4 show (a lone 4th in place of "+1"). */
const SHOWN_SPECIALTIES = 3;
export function badges(f: Pick<Fighter, "archetype" | "discipline" | "specialties">, withDiscipline = true, discIcon = false): string {
  const keys = (f.specialties ?? []).filter((k) => SPECIALTIES[k]);
  const shown = keys.length <= SHOWN_SPECIALTIES + 1 ? keys.length : SHOWN_SPECIALTIES;
  const spec = keys
    .map((k, i) => badge("spec-badge", SPECIALTIES[k].label, SPECIALTIES[k].rule, svgIcon(SPECIALTIES[k].path)).replace('<span class="badge', `<span${i >= shown ? " hidden" : ""} data-spec="${i}" class="badge`))
    .join("");
  const rest = keys.length - shown;
  const more = keys.length
    ? `<span class="badge spec-badge spec-badge--more" data-more tabindex="0" role="img"${rest ? "" : " hidden"} aria-label="${esc(`More specialties: ${keys.slice(shown).map((k) => SPECIALTIES[k].label).join(", ")}`)}">+${rest}<span class="badge__tip">${keys
        .map((k, i) => `<span data-spec-tip="${i}"${i < shown ? " hidden" : ""}><b>${esc(SPECIALTIES[k].label)}</b><span class="tip__rule">${esc(SPECIALTIES[k].rule)}</span></span>`)
        .join("")}</span></span>`
    : "";
  const disc = withDiscipline && f.discipline
    ? badge("disc", f.discipline, "Listed style on UFC.com (via TidyTuesday/{fightr})", `${discIcon ? svgIcon(FACT_ICONS.discipline) : ""}${discIcon ? `<span>${esc(f.discipline)}</span>` : esc(f.discipline)}`)
    : "";
  return `<div class="badges">${archetypeChip(f.archetype)}${disc}${spec}${more}</div>`;
}

// ---------- corner.* (one fighter, against their edge) ----------
/** corner.identity. Physical facts only when no duel.matchup shows them (profile, or one corner empty). */
/** The square's background: the Commons photo when there is one (credit behind a © on hover/focus), else the monogram. */
export function portrait(f: Pick<Fighter, "name" | "photo">): string {
  const p = f.photo;
  if (!p) return `<div class="portrait" aria-hidden="true"><span>${esc(initials(f.name))}</span></div>`;
  const lic = p.license_url ? `<a href="${esc(p.license_url)}" rel="license noopener" target="_blank">${esc(p.license)}</a>` : esc(p.license);
  return `<div class="portrait portrait--photo"><img src="${esc(p.url)}" width="${p.width}" height="${p.height}" alt="" loading="lazy" decoding="async" crossorigin="anonymous" referrerpolicy="no-referrer"></div>
    <span class="badge credit" tabindex="0" role="note" aria-label="Photo credit: ${esc(p.author ?? "unknown author")}, ${esc(p.license)}">©<span class="badge__tip"><b>Photo</b>${esc(p.author ?? "Unknown author")} · ${lic} · <a href="${esc(p.page)}" rel="noopener" target="_blank">Wikimedia Commons</a></span></span>`;
}

const BELT_LABEL = { champion: "Champion", interim: "Interim champion", former: "Former champion" } as const;

/** Belts stacked at the portrait's top-left corner, one per division: gold (champion), silver (interim) or old gold (former). */
export function championMark(f: Pick<Fighter, "belts">): string {
  if (!f.belts?.length) return "";
  const items = f.belts
    .map((b) => {
      const text = `${BELT_LABEL[b.kind]} · ${b.division}`;
      return `<span class="badge champ champ--${b.kind}" tabindex="0" role="img" aria-label="${esc(text)}">${svgIcon(BELT)}<span class="badge__tip"><b>${esc(text)}</b></span></span>`;
    })
    .join("");
  return `<div class="belts">${items}</div>`;
}

/** Belt icons for a table cell: same icon and colours as the portrait mark, label as accessible name and title, no tooltip. */
export function beltIcons(belts: { division: string; kind: keyof typeof BELT_LABEL }[]): string {
  return belts
    .map((b) => {
      const text = `${BELT_LABEL[b.kind]} · ${b.division}`;
      return `<span class="belt-ico champ--${b.kind}" role="img" aria-label="${esc(text)}" title="${esc(text)}">${svgIcon(BELT)}</span>`;
    })
    .join("");
}

export function identity(f: Fighter | null, tone: Tone, warning: string | null = null, withFacts = false): string {
  const warn = warning ? `<p class="warn" role="status">${esc(warning)}</p>` : "";
  const corner = ""; // the colour and the side already say which corner
  if (!f) {
    return mod("corner.identity", "", `${corner}${warn}<p class="nodata">Pick a fighter for the ${tone === "a" ? "red" : "blue"} corner above.</p>`, {
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
        f.height_cm != null ? fmtHeight(f.height_cm).replace(/ <small>.*<\/small>/, "") : null,
        f.reach_cm != null ? `${fmtReach(f.reach_cm).replace(/ <small>.*<\/small>/, "")} reach` : null,
        f.weight_lbs != null ? fmtWeight(f.weight_lbs) : null,
        f.stance ? esc(f.stance) : null,
      ].filter(Boolean)
    : [];
  const front = `<div class="face face--front" data-face="front">${portrait(f)}${championMark(f)}
       <div class="id__text">
         <h2 class="id__name">${name}</h2>
         ${sub ? `<p class="id__sub">${sub}</p>` : ""}
         ${facts.length ? `<p class="id__facts">${facts.join(" · ")}</p>` : ""}
         ${badges(f)}
       </div>${warn}</div>`;
  const back = `<div class="face face--back" data-face="back" inert>${identityBack(f)}</div>`;
  const flip = `<button type="button" class="flip-btn" data-flip aria-pressed="false" aria-label="Fighter details (flip)">${svgIcon(FLIP)}</button>`;
  return mod("corner.identity", "", `<div class="flip"><div class="flip__in">${front}${back}</div></div>${flip}`, { cls: "id id--square", tone, label: f.name });
}

/** Reverse of corner.identity (spec 11.1 #8). Same look as the face and no scrolling: on top the style, one row per group
 *  (archetype and discipline, belts, specialties; every rule in a tooltip), below the data in two columns with an icon each.
 *  The same data on a profile and in a comparison (Piero, 2026-11-27). */
function identityBack(f: Fighter): string {
  const tip = (label: string, rule: string, cls: string, face: string) =>
    `<span class="badge ${cls}" tabindex="0" role="img" aria-label="${esc(`${label}: ${rule}`)}">${face}<span class="badge__tip"><b>${esc(label)}</b>${esc(rule)}</span></span>`;
  const short = (iso: string) => dateLong(iso).replace(/(\w{3})\w*(?= \d{4}$)/, "$1");
  // Style on top, one row per group: archetype and discipline, then belts, then specialty icons (name and rule in the tooltip).
  const keys = (f.specialties ?? []).filter((k) => SPECIALTIES[k]);
  const line = (items: string[]) => (items.some(Boolean) ? `<div class="back__line">${items.join("")}</div>` : "");
  const style = [
    line([archetypeChip(f.archetype), f.discipline ? tip(f.discipline, "Listed style on UFC.com", "disc", esc(f.discipline)) : ""]),
    line((f.belts ?? []).map((b) => tip(`${BELT_LABEL[b.kind]} · ${b.division}`, "UFC title", `back__belt champ--${b.kind}`, `${svgIcon(BELT)}<span>${esc(b.division)}</span>`))),
    line(keys.map((k) => tip(SPECIALTIES[k].label, SPECIALTIES[k].rule, "spec-badge", svgIcon(SPECIALTIES[k].path)))),
  ].join("");
  // Details below: two columns, icon beside a small label and the value.
  const cell = (icon: string, k: string, v: string, title = "") =>
    `<div class="back__cell"${title ? ` title="${esc(title)}"` : ""}><dt>${svgIcon(icon)}<span>${k}</span></dt><dd>${v}</dd></div>`;
  const years = age(f);
  const oldest = f.fights.length ? f.fights[f.fights.length - 1] : null;
  const newest = f.fights[0];
  const facts = [
    f.weight_class ? cell(FACT_ICONS.division, "Division", esc(f.weight_class)) : "",
    years != null ? cell(FACT_ICONS.age, "Age", `${years}${f.dob ? ` <small>${short(f.dob)}</small>` : ""}`, f.dob ? `Born ${dateLong(f.dob)}` : "") : "",
    f.height_cm != null ? cell(FACT_ICONS.height, "Height", fmtHeight(f.height_cm)) : "",
    f.reach_cm != null ? cell(FACT_ICONS.reach, "Reach", fmtReach(f.reach_cm)) : "",
    f.weight_lbs != null ? cell(FACT_ICONS.weight, "Weight", fmtWeight(f.weight_lbs)) : "",
    f.stance ? cell(FACT_ICONS.stance, "Stance", esc(f.stance)) : "",
    oldest ? cell(FACT_ICONS.first, "UFC debut", short(oldest.date), `First UFC fight in the data (since 2010): ${dateLong(oldest.date)}`) : "",
    newest ? cell(FACT_ICONS.last, "Last fight", short(newest.date), `Last UFC fight: ${dateLong(newest.date)}`) : "",
  ].join("");
  return `<div class="id__back" role="region" aria-label="${esc(f.name)}: details">
    <header class="back__head"><h2 class="back__name">${esc(f.name)}</h2>${f.nickname ? `<p class="back__nick">“${esc(f.nickname)}”</p>` : ""}</header>${style ? `<div class="back__style">${style}</div>` : ""}${facts ? `<dl class="back__facts">${facts}</dl>` : `<p class="nodata">No data</p>`}</div>`;
}

/** corner.record: record and streak, then every professional fight as a painted square (GitHub style).
 *  Colour = result, intensity = how it ended (KO/sub strong, decision light). UFC fights since 2010 run
 *  oldest to newest with their own border and open fight.dialog; the rest of the career has no order. */
export function record(f: Fighter, tone: Tone): string {
  const u = f.ufc_record;
  const st = streak(f);
  const career = careerRecord(f);
  const outside = {
    W: Math.max(0, career.wins - u.W),
    L: Math.max(0, career.losses - u.L),
    D: Math.max(0, career.draws - u.D),
  };
  const plain = (r: "W" | "L" | "D", n: number) =>
    Array.from({ length: n }, () => `<li><span class="sq sq--${r}" title="${RESULT[r]} outside the UFC or before 2010"></span></li>`).join("");
  const ufc = [...f.fights]
    .map((x, i) => ({ x, i }))
    .reverse()
    .map(
      ({ x, i }) =>
        `<li><button type="button" class="sq sq--${x.result} sq--${x.method === "DEC" ? "dec" : x.method === "OTHER" ? "oth" : "fin"} sq--ufc" data-fight="${i}" data-slug="${f.slug}" data-tone="${tone}" aria-haspopup="dialog" aria-label="${esc(`${RESULT[x.result]} vs ${x.opponent}, ${dateLong(x.date)}`)}" title="${esc(`${dateLong(x.date)} · ${RESULT[x.result]} vs ${x.opponent} · ${x.method_detail}`)}"></button></li>`,
    )
    .join("");
  return mod(
    "corner.record",
    "",
    `<div class="rec__top">
       <p class="display">${recordText(f)}</p>
       ${st ? `<p class="streak"><b class="relief r-${st[0]}">${st}</b><span>${st[0] === "W" ? "win" : "losing"} streak</span></p>` : ""}
     </div>
     <ol class="squares" aria-label="Professional fights: earlier career, then UFC fights since 2010 from oldest to newest">${plain("W", outside.W)}${plain("L", outside.L)}${plain("D", outside.D)}${ufc}</ol>`,
    { cls: "rec", tone, label: "Record" },
  );
}

/** corner.finishes (M2): how the wins and the losses ended. */
export function finishes(f: Fighter, tone: Tone, legend = true): string {
  const bar = (by: Record<Method, number>, label: string) => {
    const total = METHODS.reduce((s, [k]) => s + by[k], 0);
    const stack = total
      ? `<div class="stack">${METHODS.map(([k, l], i) => (by[k] ? `<span class="m${i}" style="flex:${by[k]}" title="${l}: ${by[k]}">${by[k]}</span>` : "")).join("")}</div>`
      : `<div class="stack stack--empty"></div>`;
    return `<div class="mix"><p class="mix__label">${label} <span>${total}</span></p>${stack}</div>`;
  };
  const key = legend ? `<p class="legend">${METHODS.slice(0, 3).map(([, l], i) => `<span><i class="m${i}"></i>${l}</span>`).join("")}</p>` : "";
  return mod("corner.finishes", "", `<p class="desc">UFC since 2010</p>` + bar(f.wins_by, "Wins by method") + bar(f.losses_by, "Losses by method") + key, { tone, label: "How the fights end" });
}

/** profile.alike: the closest styles in the same division, each with its profile and a Compare link. */
export function alike(f: Fighter): string {
  const body = !f.similar
    ? noData("no division percentile")
    : !f.similar.length
      ? `<p class="nodata">No similar fighters in this division</p>`
      : `<ol class="alike">${f.similar
          .map((s) => `<li><a class="alike__name" href="/fighters/${s.slug}/">${esc(s.name)}</a><a class="ghost ghost--sm" href="/?a=${f.slug}&amp;b=${s.slug}" aria-label="Compare ${esc(f.name)} with ${esc(s.name)}">Compare</a></li>`)
          .join("")}</ol>`;
  return mod("profile.alike", "Fighters alike", `<p class="desc">Closest style in the division (the eight radar percentiles)</p>${body}`, { tone: "solo" });
}

/** corner.history: every UFC fight, open, in a scrolling list that fills the rest of the column. */
export function history(f: Fighter, tone: Tone = "solo"): string {
  if (!f.fights.length) return "";
  const row = (x: Fight, i: number) => `<li><button type="button" class="fight" data-fight="${i}" data-slug="${f.slug}" data-tone="${tone}" aria-haspopup="dialog">
      <span class="res relief r-${x.result}" aria-label="${RESULT[x.result]}">${x.result}</span>
      <span class="fight__main"><b>${esc(x.opponent)}</b><span>${esc(x.method_detail)}${x.round && x.method !== "DEC" ? ` · R${x.round} ${clock(x.round_time_s)}` : ""}</span></span>
      <time class="fight__date" datetime="${x.date}">${x.date.slice(0, 4)}</time>
    </button></li>`;
  return mod("corner.history", "", `<p class="hist__head">${f.fights.length} UFC fights since 2010</p><ol class="fights" tabindex="0" aria-label="Fight history">${f.fights.map(row).join("")}</ol>`, {
    cls: "hist",
    label: "Fight history",
  });
}

export function ownColumn(f: Fighter | null, tone: Tone, warning: string | null = null, other: Fighter | null = null): string {
  return identity(f, tone, warning, !other) + (f ? record(f, tone) + finishes(f, tone) + history(f, tone) : "");
}

// ---------- duel.* (both fighters, centre) ----------
type Row = { label: string; a: string; b: string; ea?: boolean; eb?: boolean };

/** duel.matchup: win and finish rates, then the tape with up/down arrows and the gap written.
 *  Green/red where higher is better (rates, height, reach); grey where it is neither (age, weight). */
export function matchup(a: Fighter, b: Fighter, today?: Date): string {
  const arrow = (dir: "up" | "down", neutral: boolean) =>
    `<svg class="arrow arrow--${neutral ? "neutral" : dir}" viewBox="0 0 12 12" role="img" aria-label="${dir === "up" ? "higher" : "lower"}"><path d="${dir === "up" ? "M6 2l4.5 7h-9z" : "M6 10L1.5 3h9z"}"/></svg>`;
  const gap = (x: number | null, y: number | null, unit: string, k = 1) =>
    x != null && y != null && Math.abs(x - y) * k >= 0.5 ? `<small>${Math.round(Math.abs(x - y) * k * 10) / 10} ${unit} apart</small>` : "";
  const line = (label: string, va: string, vb: string, ma = "", mb = "") =>
    `<div class="mu__row"><span class="mu__v a">${ma}${va}</span><span class="mu__l">${label}</span><span class="mu__v b">${vb}${mb}</span></div>`;
  // Arrows only when the figures shown differ (97% vs 97% gets none).
  const marks = (x: number | null, y: number | null, differ: boolean, neutral: boolean): [string, string] =>
    x != null && y != null && differ ? [arrow(x > y ? "up" : "down", neutral), arrow(y > x ? "up" : "down", neutral)] : ["", ""];
  const rateRow = (label: string, x: number | null, y: number | null) =>
    line(label, pctText(x), pctText(y), ...marks(x, y, pctText(x) !== pctText(y), false));
  const tapeRow = (label: string, x: number | null, y: number | null, fmt: (v: number) => string, unit: string, k = 1, neutral = false) =>
    line(`${label}${gap(x, y, unit, k)}`, x == null ? DASH : fmt(x), y == null ? DASH : fmt(y), ...marks(x, y, x != null && y != null && Math.abs(x - y) * k >= 0.5, neutral));
  const [lenU, lenK] = gapUnit("len");
  const [wtU, wtK] = gapUnit("wt");
  const body =
    rateRow("Win rate", winRate(a), winRate(b)) +
    rateRow("Finish rate in the UFC", finishRate(a), finishRate(b)) +
    tapeRow("Age", age(a, today), age(b, today), (v) => `${v}`, "years", 1, true) +
    tapeRow("Height", a.height_cm, b.height_cm, fmtHeight, lenU, lenK) +
    tapeRow("Reach", a.reach_cm, b.reach_cm, fmtReach, lenU, lenK) +
    tapeRow("Weight", a.weight_lbs, b.weight_lbs, fmtWeight, wtU, wtK, true) +
    line("Stance", a.stance ? esc(a.stance) : DASH, b.stance ? esc(b.stance) : DASH);
  return mod("duel.matchup", "", body, { cls: "mu", label: "Figures and tale of the tape" });
}

export const RAW: Record<Metric, (x: number) => string> = {
  slpm: (x) => x.toFixed(2), str_acc: (x) => `${Math.round(x)}%`, sapm: (x) => x.toFixed(2), str_def: (x) => `${Math.round(x)}%`,
  td_avg: (x) => x.toFixed(2), td_acc: (x) => `${Math.round(x)}%`, td_def: (x) => `${Math.round(x)}%`, sub_avg: (x) => x.toFixed(1),
};

/** duel.style: the radar large with a layer control, the eight metrics under it as a spec sheet. */
export function style(a: Fighter | null, b: Fighter | null): string {
  const pop = population(a, b);
  const pa = a?.percentiles?.[pop] ?? null;
  const pb = b?.percentiles?.[pop] ?? null;
  const solo = !b;
  // Same block, same size and place as the radar: only the body says "No data" (the page layout never changes).
  if (!pa && !pb) {
    return mod("duel.style", "", `<div class="style__body style__body--empty">${noData("fewer than 3 UFC fights or missing career stats")}</div>`, {
      label: "Style radar",
      cls: solo ? "style style--solo" : "style",
      aside: `<button type="button" class="icon-btn" disabled aria-hidden="true" tabindex="-1" style="visibility:hidden"></button>`,
    });
  }
  const val = (f: Fighter | null, p: Record<Metric, number> | null, m: Metric, cls: string) =>
    p && f?.career
      ? `<span class="spec__v ${cls}"><b>${Math.round(p[m])}</b><small>${RAW[m](f.career[m])}</small></span>`
      : `<span class="spec__v ${cls}"><b>${DASH}</b></span>`;
  // One block, one row per metric: A | metric | B (mirrored like the tape); solo: metric | value.
  const cells = METRICS.map(([m, l]) =>
    solo
      ? `<div class="spec__cell spec__row spec__row--solo"><p class="spec__l">${l}</p>${val(a, pa, m, "s")}</div>`
      : `<div class="spec__cell spec__row">${val(a, pa, m, "a")}<p class="spec__l">${l}</p>${val(b, pb, m, "b")}</div>`,
  ).join("");
  const missing = !solo && a && b ? (!pa ? a : !pb ? b : null) : null;
  const layerBtn = (k: "a" | "b", f: Fighter, p: unknown) =>
    `<button type="button" data-layer="${k}" aria-pressed="false"${p ? "" : " disabled"}>${esc(lastName(f.name))}</button>`;
  const layers =
    !solo && a && b
      ? `<div class="seg" role="group" aria-label="Radar layer"><button type="button" data-layer="both" aria-pressed="true">Both</button>${layerBtn("a", a, pa)}${layerBtn("b", b, pb)}</div>`
      : "";
  const gapNote = missing ? `<p class="nodata style__missing" data-tone="${missing === a ? "a" : "b"}">No data · ${esc(lastName(missing.name))}: fewer than 3 UFC fights or missing career stats</p>` : "";
  return mod(
    "duel.style",
    "",
    `<div class="style__body"><div class="chart chart--radar" data-chart="radar" role="img" aria-label="Radar of the eight style percentiles"></div>
     <div class="spec spec--rows" id="spec-${solo ? "s" : "ab"}" hidden><div class="spec__list">${cells}</div></div></div>`,
    {
      label: "Style radar",
      cls: solo ? "style style--solo" : "style",
      // Layer choice on the left, the metric sheet toggle on the right.
      aside: `${layers}${gapNote}<button type="button" class="icon-btn" data-toggle="spec-${solo ? "s" : "ab"}" aria-expanded="false" aria-controls="spec-${solo ? "s" : "ab"}" title="Show the 8 metrics"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 5h12M4 10h12M4 15h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span class="sr">Show the 8 metrics</span></button>`,
    },
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

/** Metric ids of the career chart (labels live in charts.ts next to their formulas). */
export const CAREER_METRICS: [string, string][] = [
  ["sig_landed", "Significant strikes landed"],
  ["sig_absorbed", "Significant strikes absorbed"],
  ["sig_acc", "Significant strike accuracy"],
  ["str_landed", "Total strikes landed"],
  ["str_absorbed", "Total strikes absorbed"],
  ["kd", "Knockdowns"],
  ["kd_against", "Knockdowns against"],
  ["td", "Takedowns landed"],
  ["td_acc", "Takedown accuracy"],
  ["taken_down", "Times taken down"],
  ["sub_att", "Submission attempts"],
  ["clinch", "Clinch strikes landed"],
  ["ground", "Ground strikes landed"],
];
const CAREER_OPTIONS = CAREER_METRICS.map(([k, l]) => `<option value="${k}">${l}</option>`).join("");

/** Views of the chart block: id, tab label and the title the export gives the image (spec §12.1 #5, #7). */
export const CHART_VIEWS = {
  solo: [["career", "Career", "Career chart"], ["returns", "Returns", "Betting returns"], ["length", "Length", "Fight length"]],
  duel: [["performance", "Performance", "Performance by fight"], ["returns", "Returns", "Betting returns"], ["length", "Length", "Fight length"]],
  group: [["performance", "Performance", "Performance by fight"], ["returns", "Betting returns", "Betting returns"], ["length", "Fight length", "Fight length"], ["methods", "Methods", "How the fights end"]],
} as const;
const MODES = [["points", "Points"], ["line", "Line"]] as const;
/** The same description in both modes; the block shows the one for the chosen mode. */
const descs = (points: string, line: string) =>
  `<p class="desc" data-desc="points">${points}</p><p class="desc" data-desc="line" hidden>${line}</p>`;

/**
 * One block with tabs for the per-fight charts (ARIA tabs; lib/charts.ts wires them). A single Time span and a single
 * Points/Line switch serve every view; the views that do not use a control hide it (it keeps its value).
 * `data-uses` on each view lists the shared controls it needs.
 */
export function fightRows(kind: boolean | "group" = false): string {
  const group = kind === "group";
  const solo = kind === true;
  const views = group ? CHART_VIEWS.group : solo ? CHART_VIEWS.solo : CHART_VIEWS.duel;
  const defMode = solo ? "line" : "points";
  const metrics = [
    ["slpm", "Strikes / min"],
    ["acc", "Accuracy"],
    ["td", "Takedowns"],
    ["sub", "Sub. attempts"],
  ]
    .map(([k, l], i) => `<button type="button" data-metric="${k}" aria-pressed="${i === 0}">${l}</button>`)
    .join("");
  const who = solo ? "the fighter" : "each fighter";
  // In a group the side tables (ROI by odds type, length figures) are left out: the metrics table already lists four columns.
  const side = (slot: string) => (group ? "" : `<div class="ret__side" data-slot="${slot}"></div>`);
  const ret = group ? "" : " ret";
  const body: Record<string, string> = {
    career: `<div class="career__pick"><label for="career-metric" class="muted">Metric</label><select id="career-metric" class="sel" data-career-metric>${CAREER_OPTIONS}</select></div>
       <div class="chart chart--wide" data-chart="career" role="img" aria-label="Fight-by-fight career trend of the chosen metric"></div>
       ${descs(
         "Each point is a UFC fight, oldest to newest. Dashed line: the fighter's average over the fights with data. Fights without statistics, or without attempts for a rate, have no point. Click a point, or point at a fight in the history, to see it.",
         "Each point is a UFC fight, oldest to newest. Dashed line: the fighter's average over the fights with data. Fights without statistics, or without attempts for a rate, break the line. Click a point, or point at a fight in the history, to see it.",
       )}`,
    performance: `<div class="seg" role="group" aria-label="Metric">${metrics}</div>
         <div class="chart chart--wide" data-chart="perf" role="img" aria-label="Per-fight performance over time"></div>
         ${descs(
           "Each point is a fight: filled = win, ring = loss, diamond = draw or no contest. Dashed lines: each fighter's average in the span. Click a point, or point at a fight in the history, to see it.",
           "One line per fighter, fight by fight over time; a fight without data leaves a gap. Filled = win, ring = loss, diamond = draw or no contest. Dashed lines: each fighter's average in the span. Click a point, or point at a fight in the history, to see it.",
         )}`,
    returns: `<div class="${ret.trim()}">
         <div class="chart chart--wide" data-chart="roi" role="img" aria-label="Net return of a 100 bet on each fight"></div>
         ${side("roi-table")}
       </div>
       ${descs(
         `Net result of backing ${who} with 100 at the decimal odds of every priced fight, by odds type. Dashed lines: average return per fight. * fewer than 5 fights.`,
         `Running total of backing ${who} with 100 at the decimal odds of every priced fight, fight by fight over time. Above the line at 0 is profit overall. The table counts every priced fight in the span. * fewer than 5 fights.`,
       )}`,
    length: `<div class="${ret.trim()}">
         <div class="chart chart--wide" data-chart="dur" role="img" aria-label="Distribution of fight length in minutes"></div>
         ${side("dur-table")}
       </div>
       ${descs(
         "How many fights ended in each five-minute stretch, per fighter. Dashed lines: average length.",
         "The same counts joined into one line per fighter, so the shape of each fighter's fight lengths can be compared. Dashed lines: average length.",
       )}`,
    methods: `<div class="chart chart--methods" data-chart="methods" role="img" aria-label="Wins and losses of each fighter by method"></div>
       <p class="legend legend--steps" aria-hidden="true">${METHODS.map(([, l], i) => `<span><i class="m${i}"></i>${l}</span>`).join("")}</p>
       <p class="desc">Each fighter has two bars over the whole UFC career, wins above and losses below, split by how the fight ended. The shade of the fighter's colour gives the method (brightest KO/TKO, then submission, then decision); grey is other results. Numbers count fights.</p>`,
  };
  const uses: Record<string, string> = { career: "mode", performance: "range mode", returns: "range mode", length: "range mode", methods: "" };
  const tabs = views
    .map(([id, label, title], i) => `<button type="button" role="tab" id="ct-${id}" data-tab="${id}" data-title="${title}" aria-controls="cv-${id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${label}</button>`)
    .join("");
  const panels = views
    .map(([id], i) => `<div role="tabpanel" id="cv-${id}" data-view="${id}" data-uses="${uses[id]}" aria-labelledby="ct-${id}"${i ? " hidden" : ""}>${body[id]}</div>`)
    .join("");
  const mode = `<div class="seg" role="group" aria-label="Chart style" data-ctl="mode">${MODES.map(([k, l]) => `<button type="button" data-mode="${k}" aria-pressed="${k === defMode}">${l}</button>`).join("")}</div>`;
  return `<section class="panel row" data-module="fights.charts"${group ? ' id="g-charts"' : ""} data-tabs data-default-mode="${defMode}" aria-label="Charts">
    <header class="panel__head"><div class="seg" role="tablist" aria-label="Chart">${tabs}</div><div>${rangeControl().replace('class="seg"', 'class="seg" data-ctl="range"')}${mode}</div></header>
    ${panels}
  </section>`;
}

export function fightCharts(a: Fighter | null, b: Fighter | null): string {
  return a && b ? fightRows() : "";
}

// ---------- fight.dialog ----------
/** Content of the fight dialog: one fight seen from both sides (`opp` is the opponent's record of it, if found). */
export function fightDetail(f: Fighter, x: Fight, opp: Fight | null): string {
  const ret = x.odds ? (x.result === "W" ? 100 * (x.odds - 1) : x.result === "L" ? -100 : 0) : null;
  const oppRet = x.opp_odds ? (x.result === "L" ? 100 * (x.opp_odds - 1) : x.result === "W" ? -100 : 0) : null;
  const num = (v: number | null | undefined) => (v == null ? DASH : String(v));
  const pct = (v: number | null) => (v == null ? DASH : `${Math.round(v * 100)}%`);
  const money = (v: number | null) => (v == null ? DASH : `${v > 0 ? "+" : ""}${Math.round(v)}`);
  const s = x.stats, o = opp?.stats ?? null;
  const row = (label: string, mine: string, theirs: string) => `<tr><td class="num">${mine}</td><th scope="row">${label}</th><td class="num">${theirs}</td></tr>`;
  const stat = (label: string, key: keyof FightStats) => row(label, num(s?.[key]), num(o?.[key]));
  const head = [
    `${dateLong(x.date)}`,
    x.weight_class ? esc(x.weight_class) : DASH,
    x.title ? "Title bout" : "Non-title bout",
  ].join(" · ");
  const ended = [x.method_detail ? esc(x.method_detail) : esc(x.method), x.round ? `Round ${x.round}` : null, x.round_time_s != null ? clock(x.round_time_s) : null].filter(Boolean);
  const table = `<div class="dstats-wrap"><table class="dstats"><thead><tr><th scope="col" class="num">${esc(lastName(f.name))}</th><td></td><th scope="col" class="num">${esc(lastName(x.opponent))}</th></tr></thead><tbody>
      ${row("Odds (decimal)", x.odds ? x.odds.toFixed(2) : DASH, x.opp_odds ? x.opp_odds.toFixed(2) : DASH)}
      ${row("Fair win chance", pct(x.implied_prob_fair), pct(x.implied_prob_fair == null ? null : 1 - x.implied_prob_fair))}
      ${row("Return on 100", money(ret), money(oppRet))}
      ${stat("Knockdowns", "kd")}
      ${stat("Knockdowns against", "kd_against")}
      ${stat("Significant strikes landed", "sig_landed")}
      ${stat("Significant strikes attempted", "sig_attempted")}
      ${stat("Significant strikes absorbed", "sig_absorbed")}
      ${stat("Total strikes landed", "str_landed")}
      ${stat("Total strikes attempted", "str_attempted")}
      ${stat("Total strikes absorbed", "str_absorbed")}
      ${stat("Takedowns landed", "td")}
      ${stat("Takedowns attempted", "td_attempted")}
      ${stat("Times taken down", "taken_down")}
      ${stat("Submission attempts", "sub_att")}
      ${stat("Clinch strikes landed", "clinch")}
      ${stat("Clinch strikes absorbed", "clinch_taken")}
      ${stat("Ground strikes landed", "ground")}
      ${stat("Ground strikes absorbed", "ground_taken")}
    </tbody></table></div>`;
  return `<header class="dlg__head">
      <span class="res res--lg r-${x.result}">${x.result}</span>
      <div><h2 id="dlg-title">${esc(lastName(f.name))} vs ${esc(x.opponent)}</h2><p class="muted">${RESULT[x.result]} · ${head}</p><p class="muted">${ended.join(" · ")}${x.fight_time_s != null ? ` · fight time ${clock(x.fight_time_s)}` : ""}</p></div>
      <button type="button" class="dlg__close" data-close aria-label="Close">×</button>
    </header>
    ${table}
    <p class="dlg__actions"><a class="cta" href="/?a=${f.slug}&amp;b=${x.opponent_slug}">Compare with ${esc(x.opponent)}</a><a class="ghost" href="/fighters/${x.opponent_slug}/">${esc(x.opponent)}'s profile</a></p>`;
}
