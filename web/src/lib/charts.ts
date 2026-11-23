// Client-only ECharts views: radar (P1), performance by fight, return per fight, fight length.
// The three fight charts take a time span (all, 5 or 3 years, last 10 fights) from their panel's control.
import { BarChart, RadarChart, ScatterChart } from "echarts/charts";
import { GridComponent, MarkLineComponent, RadarComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import type { Fight, Fighter, OddsType } from "./data";
import { dateLong, esc, lastName } from "./format";
import { METRICS, ODDS_TYPES, population } from "./render";

echarts.use([RadarChart, ScatterChart, BarChart, RadarComponent, GridComponent, TooltipComponent, MarkLineComponent, SVGRenderer]);

export interface Entry {
  f: Fighter;
  color: string;
}
type Range = "all" | "5y" | "3y" | "10";

const INK = "#f4f5f6";
const MUTED = "#a3a6ad";
const FAINT = "#868a92";
const LINE = "rgb(255 255 255 / 0.09)";
const font = { fontFamily: "Inter Variable, Inter, system-ui, sans-serif", color: MUTED, fontSize: 12 };
const tooltip = {
  backgroundColor: "#1c1e22",
  borderWidth: 0,
  padding: [8, 10],
  textStyle: { ...font, color: INK },
  extraCssText: "box-shadow:0 12px 32px rgb(0 0 0 / .6);border-radius:8px;",
};
const axis = {
  axisLine: { lineStyle: { color: LINE } },
  axisTick: { show: false },
  axisLabel: { ...font, color: FAINT },
  splitLine: { lineStyle: { color: "rgb(255 255 255 / 0.05)" } },
};
const symbolFor = (r: Fight["result"]) => (r === "W" ? "circle" : r === "L" ? "emptyCircle" : "diamond");
const RESULT: Record<Fight["result"], string> = { W: "Win", L: "Loss", D: "Draw", NC: "No contest" };

function instance(el: HTMLElement) {
  return echarts.getInstanceByDom(el) ?? echarts.init(el, undefined, { renderer: "svg" });
}

/** Fights inside a time span; fights are stored newest first. */
function inRange(fights: Fight[], range: Range, today = new Date()): Fight[] {
  if (range === "10") return fights.slice(0, 10);
  if (range === "all") return fights;
  const cut = new Date(today);
  cut.setFullYear(cut.getFullYear() - (range === "5y" ? 5 : 3));
  const iso = cut.toISOString().slice(0, 10);
  return fights.filter((x) => x.date >= iso);
}

// ---------- radar ----------
const SHORT: Record<string, string> = {
  slpm: "Strikes/min", str_acc: "Str. accuracy", sapm: "Absorbed (inv.)", str_def: "Str. defence",
  td_avg: "Takedowns", td_acc: "TD accuracy", td_def: "TD defence", sub_avg: "Submissions",
};

function radar(el: HTMLElement, entries: Entry[], layer: string) {
  const pop = population(entries[0]?.f ?? null, entries[1]?.f ?? null);
  const shown = entries.filter((_, i) => layer === "both" || layer === (i === 0 ? "a" : "b"));
  const series = shown
    .filter((e) => e.f.percentiles?.[pop])
    .map((e, i) => ({
      type: "radar" as const,
      name: e.f.name,
      z: 2 + i,
      symbolSize: 6,
      emphasis: { focus: "self" as const, areaStyle: { opacity: 0.32 } },
      blur: { lineStyle: { opacity: 0.25 }, areaStyle: { opacity: 0.04 } },
      data: [
        {
          name: e.f.name,
          value: METRICS.map(([m]) => Math.round(e.f.percentiles![pop]![m])),
          lineStyle: { color: e.color, width: 2.5, type: i === 1 && shown.length > 1 ? ("dashed" as const) : ("solid" as const) },
          itemStyle: { color: e.color },
          areaStyle: { color: e.color, opacity: shown.length > 1 ? 0.1 : 0.22 },
        },
      ],
    }));
  instance(el).setOption(
    {
      textStyle: font,
      tooltip: {
        ...tooltip,
        trigger: "item",
        formatter: (p: { name: string; value: number[] }) =>
          `<b>${esc(p.name)}</b><br>${METRICS.map(([m, l], i) => `${l}: <b>${p.value[i]}</b>`).join("<br>")}`,
      },
      radar: {
        indicator: METRICS.map(([m]) => ({ name: SHORT[m], max: 100 })),
        radius: "70%",
        center: ["50%", "52%"],
        splitNumber: 4,
        axisName: { ...font, fontSize: 12, color: MUTED },
        splitLine: { lineStyle: { color: LINE } },
        splitArea: { show: false },
        axisLine: { lineStyle: { color: LINE } },
      },
      series,
    },
    true,
  );
}

// ---------- performance by fight ----------
export type PerfMetric = "slpm" | "acc" | "td" | "sub";
const PERF: Record<PerfMetric, { label: string; unit: string; value: (x: Fight) => number | null }> = {
  slpm: {
    label: "Significant strikes landed per minute",
    unit: "/min",
    value: (x) => (x.stats && x.fight_time_s ? x.stats.sig_landed / (x.fight_time_s / 60) : null),
  },
  acc: {
    label: "Significant strike accuracy",
    unit: "%",
    value: (x) => (x.stats && x.stats.sig_attempted ? (x.stats.sig_landed / x.stats.sig_attempted) * 100 : null),
  },
  td: { label: "Takedowns landed", unit: "", value: (x) => (x.stats ? x.stats.td : null) },
  sub: { label: "Submission attempts", unit: "", value: (x) => (x.stats ? x.stats.sub_att : null) },
};

function perf(el: HTMLElement, entries: Entry[], metric: PerfMetric, range: Range) {
  const cfg = PERF[metric];
  const series = entries.map((e) => ({
    type: "scatter" as const,
    name: e.f.name,
    itemStyle: { color: e.color },
    symbolSize: 10,
    data: inRange(e.f.fights, range)
      .map((x) => ({ x, v: cfg.value(x) }))
      .filter((d) => d.v != null)
      .map(({ x, v }) => ({ value: [x.date, Math.round(v! * 10) / 10], symbol: symbolFor(x.result), fight: x, fighter: e.f.name })),
  }));
  instance(el).setOption(
    {
      textStyle: font,
      grid: { left: 44, right: 16, top: 16, bottom: 28 },
      tooltip: {
        ...tooltip,
        trigger: "item",
        formatter: (p: { data: { fight: Fight; fighter: string; value: [string, number] } }) => {
          const { fight: x, fighter, value } = p.data;
          return `<b>${esc(lastName(fighter))}</b> vs ${esc(x.opponent)}<br>${dateLong(x.date)} · ${RESULT[x.result]} · ${esc(x.method_detail)}<br>${cfg.label}: <b>${value[1]}${cfg.unit}</b>`;
        },
      },
      xAxis: { type: "time", ...axis },
      yAxis: { type: "value", ...axis, min: 0, max: metric === "acc" ? 100 : undefined },
      series,
    },
    true,
  );
}

// ---------- return per fight ----------
function oddsType(o: number): OddsType {
  if (o < 1.5) return "Heavy favorite";
  if (o < 2) return "Favorite";
  if (o < 2.5) return "Pick'em";
  if (o < 4) return "Underdog";
  return "Heavy underdog";
}
const stakeReturn = (x: Fight, stake: number) => (x.result === "W" ? stake * (x.odds! - 1) : x.result === "L" ? -stake : 0);

function roi(el: HTMLElement, entries: Entry[], range: Range) {
  const offsets = entries.length > 1 ? [-0.16, 0.16] : [0];
  const priced = entries.map((e) => inRange(e.f.fights, range).filter((x) => x.odds));
  const series = entries.map((e, i) => ({
    type: "scatter" as const,
    name: e.f.name,
    itemStyle: { color: e.color },
    symbolSize: 10,
    data: priced[i].map((x) => ({
      value: [Math.round(stakeReturn(x, 100)), ODDS_TYPES.indexOf(oddsType(x.odds!)) + offsets[i]],
      symbol: symbolFor(x.result),
      fight: x,
      fighter: e.f.name,
    })),
    markLine: i === 0 ? { silent: true, symbol: "none", lineStyle: { color: FAINT, type: "dashed" }, label: { show: false }, data: [{ xAxis: 0 }] } : undefined,
  }));
  instance(el).setOption(
    {
      textStyle: font,
      grid: { left: 104, right: 16, top: 12, bottom: 28 },
      tooltip: {
        ...tooltip,
        trigger: "item",
        formatter: (p: { data: { fight: Fight; fighter: string; value: [number, number] } }) => {
          const { fight: x, fighter, value } = p.data;
          return `<b>${esc(lastName(fighter))}</b> vs ${esc(x.opponent)}<br>${dateLong(x.date)} · ${RESULT[x.result]} at ${x.odds!.toFixed(2)}<br>${oddsType(x.odds!)} · net <b>${value[0] > 0 ? "+" : ""}${value[0]}</b>`;
        },
      },
      xAxis: { type: "value", ...axis, axisLine: { show: false } },
      yAxis: {
        type: "value",
        ...axis,
        min: -0.5,
        max: ODDS_TYPES.length - 0.5,
        interval: 1,
        inverse: true,
        splitLine: { show: false },
        axisLine: { show: false },
        axisLabel: { ...axis.axisLabel, formatter: (v: number) => ODDS_TYPES[Math.round(v)] ?? "" },
      },
      series,
    },
    true,
  );
  // Side table for the span: ROI by odds type for each fighter, and wins against the market.
  const slot = el.closest(".panel")?.querySelector<HTMLElement>('[data-slot="roi-table"]');
  if (slot) {
    const cell = (fs: Fight[]) => {
      if (!fs.length) return `<td class="num">—</td>`;
      const pct = (fs.reduce((s, x) => s + stakeReturn(x, 100), 0) / (100 * fs.length)) * 100;
      return `<td class="num ${pct >= 0 ? "pos" : "neg"}">${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(Math.round(pct))}%<small> ${fs.length}${fs.length < 5 ? "*" : ""}</small></td>`;
    };
    const head = entries.map((e) => `<th scope="col" class="num" style="color:${e.color}">${esc(lastName(e.f.name))}</th>`).join("");
    const rows = ODDS_TYPES.map((t) => `<tr><th scope="row">${t}</th>${priced.map((fs) => cell(fs.filter((x) => oddsType(x.odds!) === t))).join("")}</tr>`).join("");
    const total = `<tr class="tot"><th scope="row">All priced fights</th>${priced.map((fs) => cell(fs)).join("")}</tr>`;
    const exp = entries
      .map((e, i) => {
        const fair = priced[i].filter((x) => x.implied_prob_fair != null && x.result !== "D" && x.result !== "NC");
        if (!fair.length) return "";
        const expected = fair.reduce((s, x) => s + x.implied_prob_fair!, 0);
        const won = fair.filter((x) => x.result === "W").length;
        return `<p><b style="color:${e.color}">${esc(lastName(e.f.name))}</b> won ${won} of ${fair.length}; the odds expected ${expected.toFixed(1)}.</p>`;
      })
      .join("");
    slot.innerHTML = `<table class="mini"><thead><tr><th scope="col">ROI · fights</th>${head}</tr></thead><tbody>${rows}${total}</tbody></table><div class="ret__exp">${exp}</div>`;
  }
}

// ---------- fight length ----------
const BINS = [0, 5, 10, 15, 20, 25];

function duration(el: HTMLElement, entries: Entry[], range: Range) {
  const sets = entries.map((e) => inRange(e.f.fights, range).filter((x) => x.fight_time_s != null));
  const counts = sets.map((fs) =>
    // Right-closed bins like the pipeline: a 15:00 decision belongs to 10–15.
    BINS.slice(0, -1).map((lo, i) => fs.filter((x) => { const m = x.fight_time_s! / 60; return (i === 0 ? m >= lo : m > lo) && m <= BINS[i + 1]; }).length),
  );
  instance(el).setOption(
    {
      textStyle: font,
      grid: { left: 32, right: 12, top: 12, bottom: 28 },
      tooltip: {
        ...tooltip,
        trigger: "axis",
        axisPointer: { type: "shadow", shadowStyle: { color: "rgb(255 255 255 / 0.04)" } },
        formatter: (ps: { seriesName: string; value: number; axisValue: string }[]) =>
          `${ps[0].axisValue} min<br>${ps.map((p) => `${esc(lastName(p.seriesName))}: <b>${p.value}</b> fights`).join("<br>")}`,
      },
      xAxis: { type: "category", data: BINS.slice(0, -1).map((lo, i) => `${lo}–${BINS[i + 1]}`), ...axis, splitLine: { show: false } },
      yAxis: { type: "value", ...axis, minInterval: 1 },
      series: entries.map((e, i) => ({
        type: "bar",
        name: e.f.name,
        data: counts[i],
        itemStyle: { color: e.color, borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 22,
      })),
    },
    true,
  );
  const slot = el.closest(".panel")?.querySelector<HTMLElement>('[data-slot="dur-table"]');
  if (slot) {
    const stats = entries.map((e, i) => {
      const fs = sets[i];
      const decided = fs.filter((x) => x.result !== "NC");
      return {
        e,
        n: fs.length,
        avg: fs.length ? fs.reduce((s, x) => s + x.fight_time_s!, 0) / fs.length / 60 : null,
        dec: decided.length ? (decided.filter((x) => x.method === "DEC").length / decided.length) * 100 : null,
        r1: fs.length ? (fs.filter((x) => x.round === 1 && x.method !== "DEC").length / fs.length) * 100 : null,
      };
    });
    const row = (label: string, v: (s: (typeof stats)[number]) => string) => `<tr><th scope="row">${label}</th>${stats.map((s) => `<td class="num">${v(s)}</td>`).join("")}</tr>`;
    slot.innerHTML = `<table class="mini"><thead><tr><th scope="col"></th>${stats.map((s) => `<th scope="col" class="num" style="color:${s.e.color}">${esc(lastName(s.e.f.name))}</th>`).join("")}</tr></thead><tbody>
      ${row("Fights", (s) => `${s.n}`)}
      ${row("Average length", (s) => (s.avg == null ? "—" : `${s.avg.toFixed(1)} min`))}
      ${row("Go to the judges", (s) => (s.dec == null ? "—" : `${Math.round(s.dec)}%`))}
      ${row("Finished in round 1", (s) => (s.r1 == null ? "—" : `${Math.round(s.r1)}%`))}
    </tbody></table>`;
  }
}

const observed = new WeakSet<HTMLElement>();
const resizer = new ResizeObserver((items) => {
  for (const it of items) echarts.getInstanceByDom(it.target as HTMLElement)?.resize();
});

const pressed = (panel: Element, attr: string, fallback: string) =>
  (panel.querySelector(`[${attr}][aria-pressed="true"]`) as HTMLElement | null)?.getAttribute(attr) ?? fallback;

/** Wire a segmented control: one pressed button, redraw on change. */
function wire(panel: Element, attr: string, redraw: () => void) {
  panel.querySelectorAll<HTMLButtonElement>(`[${attr}]`).forEach((btn) =>
    btn.addEventListener("click", () => {
      panel.querySelectorAll(`[${attr}]`).forEach((x) => x.setAttribute("aria-pressed", String(x === btn)));
      redraw();
    }),
  );
}

/** Draw every [data-chart] inside root. Safe to call again after the HTML is replaced. */
export function drawCharts(root: ParentNode, entries: Entry[]): void {
  if (!entries.length) return;
  for (const el of root.querySelectorAll<HTMLElement>("[data-chart]")) {
    const kind = el.dataset.chart;
    const panel = el.closest(".panel")!;
    const range = () => pressed(panel, "data-range", "all") as Range;
    let draw: () => void;
    if (kind === "radar") draw = () => radar(el, entries, pressed(panel, "data-layer", "both"));
    else if (kind === "perf") draw = () => perf(el, entries, pressed(panel, "data-metric", "slpm") as PerfMetric, range());
    else if (kind === "roi") draw = () => roi(el, entries, range());
    else if (kind === "dur") draw = () => duration(el, entries, range());
    else continue;
    draw();
    wire(panel, "data-range", draw);
    if (kind === "perf") wire(panel, "data-metric", draw);
    if (kind === "radar") wire(panel, "data-layer", draw);
    if (!observed.has(el)) {
      observed.add(el);
      resizer.observe(el);
    }
  }
}

export function disposeCharts(root: ParentNode): void {
  for (const el of root.querySelectorAll<HTMLElement>("[data-chart]")) echarts.getInstanceByDom(el)?.dispose();
}
