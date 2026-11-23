// Client-only ECharts views: radar (P1), performance by fight, return per fight, fight length.
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

const INK = "#f4f5f6";
const MUTED = "#a3a6ad";
const FAINT = "#73767e";
const LINE = "#2a2d33";
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
  splitLine: { lineStyle: { color: "#1c1e22" } },
};
const symbolFor = (r: Fight["result"]) => (r === "W" ? "circle" : r === "L" ? "emptyCircle" : "diamond");
const RESULT: Record<Fight["result"], string> = { W: "Win", L: "Loss", D: "Draw", NC: "No contest" };

function instance(el: HTMLElement) {
  return echarts.getInstanceByDom(el) ?? echarts.init(el, undefined, { renderer: "svg" });
}

// ---------- radar ----------
const SHORT: Record<string, string> = {
  slpm: "Strikes/min", str_acc: "Str. accuracy", sapm: "Absorbed (inv.)", str_def: "Str. defence",
  td_avg: "Takedowns", td_acc: "TD accuracy", td_def: "TD defence", sub_avg: "Submissions",
};
function radar(el: HTMLElement, entries: Entry[]) {
  const pop = population(entries[0]?.f ?? null, entries[1]?.f ?? null);
  const series = entries
    .map((e) => ({ e, p: e.f.percentiles?.[pop] }))
    .filter((x) => x.p)
    .map(({ e, p }) => ({
      name: e.f.name,
      value: METRICS.map(([m]) => Math.round(p![m])),
      lineStyle: { color: e.color, width: 2 },
      itemStyle: { color: e.color },
      areaStyle: { color: e.color, opacity: 0.14 },
      symbolSize: 4,
    }));
  instance(el).setOption(
    {
      textStyle: font,
      tooltip: { ...tooltip, trigger: "item" },
      radar: {
        indicator: METRICS.map(([m]) => ({ name: SHORT[m], max: 100 })),
        radius: "56%",
        center: ["50%", "52%"],
        splitNumber: 4,
        axisName: { ...font, fontSize: 11 },
        splitLine: { lineStyle: { color: LINE } },
        splitArea: { show: false },
        axisLine: { lineStyle: { color: LINE } },
      },
      series: [{ type: "radar", data: series }],
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

function perf(el: HTMLElement, entries: Entry[], metric: PerfMetric) {
  const cfg = PERF[metric];
  const series = entries.map((e) => ({
    type: "scatter" as const,
    name: e.f.name,
    itemStyle: { color: e.color },
    symbolSize: 9,
    data: e.f.fights
      .map((x) => ({ x, v: cfg.value(x) }))
      .filter((d) => d.v != null)
      .map(({ x, v }) => ({
        value: [x.date, Math.round(v! * 10) / 10],
        symbol: symbolFor(x.result),
        fight: x,
        fighter: e.f.name,
      })),
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
const stakeReturn = (x: Fight, stake: number) =>
  x.result === "W" ? stake * (x.odds! - 1) : x.result === "L" ? -stake : 0;

function roi(el: HTMLElement, entries: Entry[]) {
  const offsets = entries.length > 1 ? [-0.16, 0.16] : [0];
  const series = entries.map((e, i) => ({
    type: "scatter" as const,
    name: e.f.name,
    itemStyle: { color: e.color },
    symbolSize: 9,
    data: e.f.fights
      .filter((x) => x.odds)
      .map((x) => ({
        value: [Math.round(stakeReturn(x, 100)), ODDS_TYPES.indexOf(oddsType(x.odds!)) + offsets[i]],
        symbol: symbolFor(x.result),
        fight: x,
        fighter: e.f.name,
      })),
    markLine:
      i === 0
        ? { silent: true, symbol: "none", lineStyle: { color: FAINT, type: "dashed" }, label: { show: false }, data: [{ xAxis: 0 }] }
        : undefined,
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
          const r = value[0];
          return `<b>${esc(lastName(fighter))}</b> vs ${esc(x.opponent)}<br>${dateLong(x.date)} · ${RESULT[x.result]} at ${x.odds!.toFixed(2)}<br>${oddsType(x.odds!)} · net <b>${r > 0 ? "+" : ""}${r}</b>`;
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
}

// ---------- fight length ----------
function duration(el: HTMLElement, entries: Entry[]) {
  const bins = entries[0].f.duration.bins.map((b) => `${b.from}–${b.to}`);
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
      xAxis: { type: "category", data: bins, ...axis, splitLine: { show: false } },
      yAxis: { type: "value", ...axis, minInterval: 1 },
      series: entries.map((e) => ({
        type: "bar",
        name: e.f.name,
        data: e.f.duration.bins.map((b) => b.count),
        itemStyle: { color: e.color, borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 22,
      })),
    },
    true,
  );
  const note = el.parentElement?.querySelector(".dur__note") ?? document.createElement("p");
  note.className = "foot dur__note";
  note.innerHTML = entries
    .map((e) => `${esc(lastName(e.f.name))}: ${e.f.duration.decision_pct == null ? "—" : `${Math.round(e.f.duration.decision_pct)}%`} of fights go to the judges`)
    .join(" · ");
  el.after(note);
}

const observed = new WeakSet<HTMLElement>();
const resizer = new ResizeObserver((items) => {
  for (const it of items) echarts.getInstanceByDom(it.target as HTMLElement)?.resize();
});

/** Draw every [data-chart] inside root. Safe to call again after the HTML is replaced. */
export function drawCharts(root: ParentNode, entries: Entry[]): void {
  if (!entries.length) return;
  for (const el of root.querySelectorAll<HTMLElement>("[data-chart]")) {
    const kind = el.dataset.chart;
    if (kind === "radar") radar(el, entries);
    else if (kind === "perf") {
      const panel = el.closest(".panel")!;
      const draw = (m: PerfMetric) => perf(el, entries, m);
      draw(((panel.querySelector('[aria-pressed="true"]') as HTMLElement | null)?.dataset.metric as PerfMetric) ?? "slpm");
      panel.querySelectorAll<HTMLButtonElement>("[data-metric]").forEach((btn) =>
        btn.addEventListener("click", () => {
          panel.querySelectorAll("[data-metric]").forEach((x) => x.setAttribute("aria-pressed", String(x === btn)));
          draw(btn.dataset.metric as PerfMetric);
        }),
      );
    } else if (kind === "roi") roi(el, entries);
    else if (kind === "dur") duration(el, entries);
    if (!observed.has(el)) {
      observed.add(el);
      resizer.observe(el);
    }
  }
}

export function disposeCharts(root: ParentNode): void {
  for (const el of root.querySelectorAll<HTMLElement>("[data-chart]")) echarts.getInstanceByDom(el)?.dispose();
}
