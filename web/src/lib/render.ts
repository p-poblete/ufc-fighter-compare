// Pure HTML builders shared by the build (featured pair, prerendered) and the client script.
import type { Fighter, Side } from "./data";
import { DASH, ageFrom, esc, feetInches, initials, lastName } from "./format";

const CORNER: Record<Side, string> = { a: "Red corner", b: "Blue corner" };

export function age(f: Fighter, today?: Date): number | null {
  return f.dob ? ageFrom(f.dob, today) : f.age;
}

export function title(a: Fighter | null, b: Fighter | null): string {
  if (a && b) return `${a.name} vs ${b.name}`;
  return (a ?? b)?.name ?? "Compare two UFC fighters";
}

/** One line under the title: the clearest physical differences between the two. */
export function finding(a: Fighter | null, b: Fighter | null, today?: Date): string {
  if (!a || !b) return "Pick a fighter for each corner to compare them side by side.";
  const parts: string[] = [];
  if (a.weight_class && b.weight_class) {
    parts.push(a.weight_class === b.weight_class ? `Both fight at ${a.weight_class}.` : `${a.weight_class} against ${b.weight_class}.`);
  }
  if (a.reach_cm != null && b.reach_cm != null && Math.abs(a.reach_cm - b.reach_cm) >= 1) {
    const [long, short] = a.reach_cm > b.reach_cm ? [a, b] : [b, a];
    parts.push(`${lastName(long.name)} has ${(long.reach_cm! - short.reach_cm!).toFixed(1)} cm more reach.`);
  }
  const ageA = age(a, today);
  const ageB = age(b, today);
  if (ageA != null && ageB != null && ageA !== ageB) {
    const [old, young] = ageA > ageB ? [a, b] : [b, a];
    const gap = Math.abs(ageA - ageB);
    parts.push(`${lastName(old.name)} is ${gap} year${gap === 1 ? "" : "s"} older than ${lastName(young.name)}.`);
  }
  return parts.join(" ") || "Same division, reach and age on record.";
}

/** Identity block of one corner: avatar, name, nickname and division, or why it is empty. */
export function card(f: Fighter | null, side: Side, warning: string | null = null): string {
  const warn = warning ? `<p class="warn" role="status">${esc(warning)}</p>` : "";
  if (!f) return `${warn}<p class="empty">Search for the ${side === "a" ? "red" : "blue"} corner.</p>`;
  const sub = [f.nickname ? `“${esc(f.nickname)}”` : null, f.weight_class ? esc(f.weight_class) : null]
    .filter(Boolean)
    .join(" · ");
  return `<div class="fighter__id">
      <span class="avatar" aria-hidden="true">${esc(initials(f.name))}</span>
      <div><h2 class="fighter__name">${esc(f.name)}</h2>${sub ? `<p class="fighter__sub">${sub}</p>` : ""}</div>
    </div>${warn}`;
}

type Row = { label: string; value: (f: Fighter, today?: Date) => string };

const v = (x: string | number | null | undefined) => (x == null || x === "" ? DASH : String(x));

const ROWS: Row[] = [
  { label: "Record", value: (f) => `${f.record.wins}-${f.record.losses}-${f.record.draws}` },
  {
    label: "UFC record",
    value: (f) => `${f.ufc_record.W}-${f.ufc_record.L}-${f.ufc_record.D}${f.ufc_record.NC ? ` (${f.ufc_record.NC} NC)` : ""}`,
  },
  { label: "Age", value: (f, t) => v(age(f, t)) },
  { label: "Height", value: (f) => (f.height_cm == null ? DASH : `${Math.round(f.height_cm)} cm <small>${feetInches(f.height_cm)}</small>`) },
  { label: "Reach", value: (f) => (f.reach_cm == null ? DASH : `${Math.round(f.reach_cm)} cm <small>${Math.round(f.reach_cm / 2.54)}″</small>`) },
  { label: "Weight", value: (f) => (f.weight_lbs == null ? DASH : `${f.weight_lbs} lb`) },
  { label: "Stance", value: (f) => v(f.stance && esc(f.stance)) },
  { label: "Division", value: (f) => v(f.weight_class && esc(f.weight_class)) },
];

/** Tale of the tape: red corner values, label in the middle, blue corner values. */
export function tape(a: Fighter | null, b: Fighter | null, today?: Date): string {
  const cell = (f: Fighter | null, row: Row) => (f ? row.value(f, today) : DASH);
  const rows = ROWS.map(
    (row) => `<tr><td class="num a">${cell(a, row)}</td><th scope="row">${row.label}</th><td class="num b">${cell(b, row)}</td></tr>`,
  ).join("");
  const head = `<tr><th scope="col" class="a">${a ? esc(lastName(a.name)) : CORNER.a}</th><td></td><th scope="col" class="b">${b ? esc(lastName(b.name)) : CORNER.b}</th></tr>`;
  return `<table class="tape"><caption class="sr">Tale of the tape</caption><thead>${head}</thead><tbody>${rows}</tbody></table>`;
}

type BarRow = [label: string, a: number, b: number];

function barGroup(caption: string, rows: BarRow[], max: number): string {
  const bar = (n: number, side: Side) =>
    `<span class="bar bar--${side}"><span class="bar__fill" style="--w:${((n / max) * 100).toFixed(1)}%"></span><span class="bar__n">${n}</span></span>`;
  return `<table class="bars"><caption>${caption}</caption><tbody>${rows
    .map(([label, x, y]) => `<tr><td>${bar(x, "a")}</td><th scope="row">${label}</th><td>${bar(y, "b")}</td></tr>`)
    .join("")}</tbody></table>`;
}

/** Mirrored bars of the record, whole career and in the UFC. Only drawn with both fighters. */
export function recordBars(a: Fighter | null, b: Fighter | null): string {
  if (!a || !b) return `<p class="empty">Pick both fighters to compare their records.</p>`;
  const career: BarRow[] = [
    ["Wins", a.record.wins, b.record.wins],
    ["Losses", a.record.losses, b.record.losses],
    ["Draws", a.record.draws, b.record.draws],
  ];
  const ufc: BarRow[] = [
    ["Wins", a.ufc_record.W, b.ufc_record.W],
    ["Losses", a.ufc_record.L, b.ufc_record.L],
    ["Draws", a.ufc_record.D, b.ufc_record.D],
    ["No contests", a.ufc_record.NC, b.ufc_record.NC],
  ];
  const max = Math.max(1, ...career.flatMap(([, x, y]) => [x, y]));
  return `${barGroup("Professional career", career, max)}${barGroup("In the UFC since 2010", ufc, max)}
  <p class="note">Both groups share one scale: the longest bar is ${max}.</p>`;
}
