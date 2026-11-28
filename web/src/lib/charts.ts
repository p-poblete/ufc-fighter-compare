// Client-only ECharts views: radar (duel.style), performance, betting returns and fight length.
// Fight points are linked to the history rows: hovering a row highlights its points, clicking a
// point opens fight.dialog (event "fight:open").
import { BarChart, LineChart, RadarChart, ScatterChart } from "echarts/charts";
import { GridComponent, MarkLineComponent, RadarComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import type { Fight, FightStats, Fighter, OddsType } from "./data";
import { dateLong, esc, lastName } from "./format";
import { CAREER_METRICS, METHODS, METRICS, ODDS_TYPES, clock, population } from "./render";

echarts.use([LineChart, RadarChart, ScatterChart, BarChart, RadarComponent, GridComponent, TooltipComponent, MarkLineComponent, SVGRenderer]);

export interface Entry {
  f: Fighter;
  color: string;
}
type Range = "all" | "5y" | "3y" | "10";
export type Mode = "points" | "line";
type Chart = ReturnType<typeof echarts.init>;

const INK = "#f5f6f8";
const MUTED = "#a6a9b1";
const FAINT = "#868a93";
const LINE = "rgb(255 255 255 / 0.09)";
const font = { fontFamily: "Inter Variable, Inter, system-ui, sans-serif", color: MUTED, fontSize: 12 };
const tooltip = {
  backgroundColor: "#1a1c21",
  borderWidth: 0,
  padding: [10, 12],
  textStyle: { ...font, color: INK, lineHeight: 18 },
  extraCssText: "box-shadow:0 12px 32px rgb(0 0 0 / .6);border-radius:10px;",
  confine: true,
};
const axis = {
  axisLine: { lineStyle: { color: LINE } },
  axisTick: { show: false },
  axisLabel: { ...font, color: FAINT },
  splitLine: { lineStyle: { color: "rgb(255 255 255 / 0.05)" } },
};
// Points: large enough to hover, no grow-on-hover (that caused the flicker), a white ring when highlighted.
const POINT = 13;
const emphasis = { scale: false, itemStyle: { borderColor: "#fff", borderWidth: 2.5 } };
const symbolFor = (r: Fight["result"]) => (r === "W" ? "circle" : r === "L" ? "emptyCircle" : "diamond");
const RESULT: Record<Fight["result"], string> = { W: "Win", L: "Loss", D: "Draw", NC: "No contest" };
const signedNum = (x: number, d = 0) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(d)}`;

function instance(el: HTMLElement) {
  return echarts.getInstanceByDom(el) ?? echarts.init(el, undefined, { renderer: "svg" });
}

/** Fights inside a time span; fights are stored newest first. Keeps each fight's index in the full list. */
function inRange(fights: Fight[], range: Range, today = new Date()): { x: Fight; i: number }[] {
  const all = fights.map((x, i) => ({ x, i }));
  if (range === "10") return all.slice(0, 10);
  if (range === "all") return all;
  const cut = new Date(today);
  cut.setFullYear(cut.getFullYear() - (range === "5y" ? 5 : 3));
  const iso = cut.toISOString().slice(0, 10);
  return all.filter(({ x }) => x.date >= iso);
}

/** Average line for one fighter, labelled with its value. */
const avgLine = (axisKey: "xAxis" | "yAxis", value: number, color: string, text: string, slot = 0, at: "start" | "end" = "end") => ({
  silent: true,
  symbol: "none",
  lineStyle: { color, type: "dashed" as const, width: 1, opacity: 0.45 },
  // Vertical lines get a horizontal label above the plot, one row per fighter so they never overlap.
  label:
    axisKey === "xAxis"
      ? { show: true, formatter: text, color, opacity: 0.7, fontSize: 11, fontFamily: font.fontFamily, position: at, rotate: 0, distance: 4 + slot * 14 }
      : { show: true, formatter: text, color, opacity: 0.7, fontSize: 11, fontFamily: font.fontFamily, position: "insideEndTop" as const },
  data: [{ [axisKey]: value }],
});

// ---------- links between history rows and chart points ----------
const links = new Map<string, { chart: Chart; seriesIndex: number; dataIndex: number }[]>();
const key = (slug: string, i: number) => `${slug}:${i}`;
function register(chart: Chart, series: { data: { slug: string; idx: number }[] }[]) {
  for (const [k, list] of links) links.set(k, list.filter((l) => l.chart !== chart));
  series.forEach((s, seriesIndex) =>
    s.data.forEach((d, dataIndex) => {
      const k = key(d.slug, d.idx);
      links.set(k, [...(links.get(k) ?? []), { chart, seriesIndex, dataIndex }]);
    }),
  );
}
function openOnClick(chart: Chart) {
  chart.off("click");
  chart.on("click", (p) => {
    const d = p.data as { slug?: string; idx?: number; tone?: string; color?: string } | undefined;
    if (d?.slug != null && d.idx != null) document.dispatchEvent(new CustomEvent("fight:open", { detail: { slug: d.slug, i: d.idx, tone: d.tone, color: d.tone === "solo" ? d.color : undefined } }));
  });
}
let linked = false;
function linkHistoryRows() {
  if (linked) return;
  linked = true;
  const act = (el: HTMLElement, type: "highlight" | "downplay") => {
    for (const l of links.get(key(el.dataset.slug!, Number(el.dataset.fight))) ?? []) {
      l.chart.dispatchAction({ type, seriesIndex: l.seriesIndex, dataIndex: l.dataIndex });
      if (type === "highlight") l.chart.dispatchAction({ type: "showTip", seriesIndex: l.seriesIndex, dataIndex: l.dataIndex });
      else l.chart.dispatchAction({ type: "hideTip" });
    }
  };
  document.addEventListener("pointerover", (ev) => {
    const row = (ev.target as HTMLElement).closest<HTMLElement>("[data-fight]");
    if (row && !row.contains(ev.relatedTarget as Node)) act(row, "highlight");
  });
  document.addEventListener("pointerout", (ev) => {
    const row = (ev.target as HTMLElement).closest<HTMLElement>("[data-fight]");
    if (row && !row.contains(ev.relatedTarget as Node)) act(row, "downplay");
  });
}

// ---------- duel.style radar: hover picks the nearest axis and lights its spec cell ----------
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
      silent: true,
      symbolSize: 6,
      data: [
        {
          value: METRICS.map(([m]) => Math.round(e.f.percentiles![pop]![m])),
          lineStyle: { color: e.color, width: 2.5, type: i === 1 && shown.length > 1 ? ("dashed" as const) : ("solid" as const) },
          itemStyle: { color: e.color },
          areaStyle: { color: e.color, opacity: shown.length > 1 ? 0.1 : 0.22 },
        },
      ],
    }));
  const radius = Math.max(60, Math.min(el.clientHeight / 2 - 34, el.clientWidth / 2 - (el.clientWidth < 480 ? 96 : 118)));
  const chart = instance(el);
  chart.setOption(
    {
      textStyle: font,
      radar: {
        indicator: METRICS.map(([m]) => ({ name: SHORT[m], max: 100 })),
        // Narrow (metric sheet open, phones): a smaller radar leaves room for the axis names.
        // Radius in pixels: as large as the block allows, leaving room for the axis names around it.
        radius,
        center: ["50%", "50%"],
        splitNumber: 4,
        axisNameGap: 8,
        axisName: { ...font, fontSize: el.clientWidth < 480 ? 11 : 12, color: MUTED, rich: { on: { color: INK, fontWeight: 700 } } },
        splitLine: { lineStyle: { color: LINE } },
        splitArea: { show: false },
        axisLine: { lineStyle: { color: LINE } },
      },
      series,
    },
    true,
  );

  // Per-metric hover: the nearest axis to the pointer is the metric; its spec cell lights up.
  const panel = el.closest(".panel")!;
  const cells = [...panel.querySelectorAll<HTMLElement>(".spec__cell")];
  const tip = panel.querySelector<HTMLElement>(".radar__tip") ?? Object.assign(document.createElement("div"), { className: "radar__tip" });
  el.style.position = "relative";
  el.append(tip);
  // With the metric sheet open the sheet is the read-out: the radar lights the axis name and its vertices instead of a tip.
  const sheetOpen = () => !!panel.querySelector(".spec:not([hidden])");
  el.querySelectorAll(".radar__vertex").forEach((d) => d.remove()); // from the previous draw
  const marks = shown
    .filter((e) => e.f.percentiles?.[pop])
    .map((e) => {
      const dot = Object.assign(document.createElement("i"), { className: "radar__vertex" });
      dot.style.setProperty("--c", e.color);
      dot.hidden = true;
      el.append(dot);
      return { e, dot };
    });
  let lit: number | null = null;
  const lightAxis = (i: number | null) => {
    if (i === lit) return;
    lit = i;
    chart.setOption({ radar: { axisName: { formatter: (name: string) => (i != null && name === SHORT[METRICS[i][0]] ? `{on|${name}}` : name) } } });
    const a = ((i ?? 0) * Math.PI) / 4;
    for (const { e, dot } of marks) {
      dot.hidden = i == null;
      if (i == null) continue;
      const r = (radius * e.f.percentiles![pop]![METRICS[i][0]]) / 100;
      dot.style.left = `${el.clientWidth / 2 - Math.sin(a) * r}px`;
      dot.style.top = `${el.clientHeight / 2 - Math.cos(a) * r}px`;
    }
  };
  const setActive = (i: number | null) => {
    cells.forEach((c, j) => c.classList.toggle("is-active", j === i));
    lightAxis(sheetOpen() ? i : null);
    if (i == null || sheetOpen()) {
      tip.hidden = true;
      return;
    }
    const [m, label] = METRICS[i];
    tip.innerHTML = `<b>${label}</b>${shown
      .map((e) => `<span><i style="background:${e.color}"></i>${esc(lastName(e.f.name))} <b>${e.f.percentiles?.[pop] ? Math.round(e.f.percentiles[pop]![m]) : "—"}</b></span>`)
      .join("")}`;
    tip.hidden = false;
  };
  el.onpointermove = (ev) => {
    const r = el.getBoundingClientRect();
    const dx = ev.clientX - (r.left + r.width / 2);
    const dy = ev.clientY - (r.top + r.height / 2);
    const dist = Math.hypot(dx, dy);
    if (dist > radius + 30) return setActive(null); // the web plus a margin for the axis names
    const ang = (Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI); // 0 at the top, clockwise
    const i = (8 - Math.round(ang / (Math.PI / 4))) % 8; // ECharts lays indicators counter-clockwise
    setActive(i);
    tip.style.left = `${ev.clientX - r.left + 14}px`;
    tip.style.top = `${ev.clientY - r.top + 14}px`;
  };
  el.onpointerleave = () => setActive(null);
  cells.forEach((c, j) => {
    c.onpointerenter = () => {
      setActive(j);
      // From the sheet: the tip sits by that axis's tip on the web (indicators run counter-clockwise from the top).
      const a = (j * Math.PI) / 4;
      tip.style.left = `${el.clientWidth / 2 - Math.sin(a) * radius + 10}px`;
      tip.style.top = `${el.clientHeight / 2 - Math.cos(a) * radius + 10}px`;
    };
    c.onpointerleave = () => setActive(null);
  });
  setActive(null);
}

/** Radar for a group: one polygon per entry (colour by list position), 0-100 percentiles; the table is the read-out. */
export interface PolyEntry {
  name: string;
  color: string;
  values: number[]; // one percentile per METRICS row
}
const lastPolys = new WeakMap<HTMLElement, PolyEntry[]>();
export function drawGroupRadar(el: HTMLElement, polys: PolyEntry[]): void {
  lastPolys.set(el, polys);
  const chart = instance(el);
  // Pixel radius from the box (room left for the axis names), as on the home radar.
  const radius = Math.max(50, Math.min(el.clientHeight / 2 - 34, el.clientWidth / 2 - (el.clientWidth < 480 ? 96 : 118)));
  chart.setOption(
    {
      textStyle: font,
      radar: {
        indicator: METRICS.map(([m]) => ({ name: SHORT[m], max: 100 })),
        radius,
        center: ["50%", "50%"],
        splitNumber: 4,
        axisNameGap: 8,
        axisName: { ...font, fontSize: el.clientWidth < 480 ? 11 : 12, color: MUTED },
        splitLine: { lineStyle: { color: LINE } },
        splitArea: { show: false },
        axisLine: { lineStyle: { color: LINE } },
      },
      series: polys.map((p) => ({
        type: "radar" as const,
        name: p.name,
        silent: true,
        symbolSize: 5,
        data: [
          {
            value: p.values.map((v) => Math.round(v)),
            lineStyle: { color: p.color, width: 2.5 },
            itemStyle: { color: p.color },
            areaStyle: { color: p.color, opacity: 0.1 },
          },
        ],
      })),
    },
    true,
  );
  if (!observed.has(el)) {
    observed.add(el);
    resizer.observe(el);
    // The radius is in pixels: redraw when the box changes size.
    let w = el.clientWidth, h = el.clientHeight;
    new ResizeObserver(() => {
      if (Math.abs(el.clientWidth - w) > 8 || Math.abs(el.clientHeight - h) > 8) {
        w = el.clientWidth;
        h = el.clientHeight;
        drawGroupRadar(el, lastPolys.get(el) ?? []);
      }
    }).observe(el);
  }
}

// ---------- fights.performance ----------
export type PerfMetric = "slpm" | "acc" | "td" | "sub";
const PERF: Record<PerfMetric, { label: string; unit: string; digits: number; value: (x: Fight) => number | null }> = {
  slpm: { label: "Significant strikes landed per minute", unit: "/min", digits: 1, value: (x) => (x.stats?.sig_landed != null && x.fight_time_s ? x.stats.sig_landed / (x.fight_time_s / 60) : null) },
  acc: { label: "Significant strike accuracy", unit: "%", digits: 0, value: (x) => (x.stats?.sig_landed != null && x.stats.sig_attempted ? (x.stats.sig_landed / x.stats.sig_attempted) * 100 : null) },
  td: { label: "Takedowns landed", unit: "", digits: 0, value: (x) => (x.stats ? x.stats.td : null) },
  sub: { label: "Submission attempts", unit: "", digits: 0, value: (x) => (x.stats ? x.stats.sub_att : null) },
};

function perf(el: HTMLElement, entries: Entry[], metric: PerfMetric, range: Range, tones: string[], mode: Mode) {
  const cfg = PERF[metric];
  const fmt = (v: number) => `${v.toFixed(cfg.digits)}${cfg.unit}`;
  const series = entries.map((e, s) => {
    const line = mode === "line";
    // Points drop the fights without data; the line keeps them as gaps, oldest first.
    const all = inRange(e.f.fights, range).map(({ x, i }) => ({ x, i, v: cfg.value(x) }));
    const pts = line ? [...all].reverse() : all.filter((d) => d.v != null);
    const vals = pts.filter((d) => d.v != null);
    const avg = vals.length ? vals.reduce((t, d) => t + d.v!, 0) / vals.length : null;
    return {
      type: (line ? "line" : "scatter") as "line" | "scatter",
      name: e.f.name,
      itemStyle: { color: e.color },
      ...(line ? { lineStyle: { color: e.color, width: 2 }, connectNulls: false } : {}),
      symbolSize: line ? 11 : POINT,
      emphasis,
      cursor: "pointer",
      avg,
      markLine: avg == null ? undefined : avgLine("yAxis", avg, e.color, `${lastName(e.f.name)} avg ${fmt(avg)}`),
      data: pts.map(({ x, i, v }) => ({ value: [x.date, v], symbol: symbolFor(x.result), fight: x, fighter: e.f.name, slug: e.f.slug, idx: i, tone: tones[s], color: e.color, avg })),
    };
  });
  const chart = instance(el);
  chart.setOption(
    {
      textStyle: font,
      grid: { left: 48, right: 24, top: 24, bottom: 30 },
      tooltip: {
        ...tooltip,
        trigger: "item",
        formatter: (p: { data: { fight: Fight; fighter: string; value: [string, number]; avg: number } }) => {
          const { fight: x, fighter, value, avg } = p.data;
          const diff = value[1] - avg;
          return `<b>${esc(lastName(fighter))}</b> vs ${esc(x.opponent)} · ${RESULT[x.result]}<br>${dateLong(x.date)} · ${esc(x.method_detail)}${x.round ? `, R${x.round} ${clock(x.round_time_s)}` : ""}<br>${cfg.label}: <b>${fmt(value[1])}</b> (${signedNum(diff, cfg.digits)} vs their average)<br><span style="color:${FAINT}">Click for the full fight</span>`;
        },
      },
      xAxis: { type: "time", ...axis },
      yAxis: { type: "value", ...axis, min: 0, max: metric === "acc" ? 100 : undefined },
      series,
    },
    true,
  );
  register(chart, series);
  openOnClick(chart);
}

// ---------- fights.career (profile): one metric, fight by fight ----------
const stat = (k: keyof FightStats) => (x: Fight) => (x.stats ? x.stats[k] : null);
/** Accuracy needs attempts: a fight with none leaves a gap. */
const ratio = (n: keyof FightStats, d: keyof FightStats) => (x: Fight) =>
  x.stats && x.stats[n] != null && x.stats[d] ? (x.stats[n]! / x.stats[d]!) * 100 : null;
const CAREER: Record<string, { unit: string; digits: number; value: (x: Fight) => number | null }> = {
  sig_landed: { unit: "", digits: 0, value: stat("sig_landed") },
  sig_absorbed: { unit: "", digits: 0, value: stat("sig_absorbed") },
  sig_acc: { unit: "%", digits: 0, value: ratio("sig_landed", "sig_attempted") },
  str_landed: { unit: "", digits: 0, value: stat("str_landed") },
  str_absorbed: { unit: "", digits: 0, value: stat("str_absorbed") },
  kd: { unit: "", digits: 0, value: stat("kd") },
  kd_against: { unit: "", digits: 0, value: stat("kd_against") },
  td: { unit: "", digits: 0, value: stat("td") },
  td_acc: { unit: "%", digits: 0, value: ratio("td", "td_attempted") },
  taken_down: { unit: "", digits: 0, value: stat("taken_down") },
  sub_att: { unit: "", digits: 0, value: stat("sub_att") },
  clinch: { unit: "", digits: 0, value: stat("clinch") },
  ground: { unit: "", digits: 0, value: stat("ground") },
};
const shortDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
};

function career(el: HTMLElement, entry: Entry, metric: string, tone: string, mode: Mode) {
  const cfg = CAREER[metric] ?? CAREER.sig_landed;
  const label = CAREER_METRICS.find(([k]) => k === metric)?.[1] ?? metric;
  const fmt = (v: number) => `${v.toFixed(cfg.digits)}${cfg.unit}`;
  const rows = entry.f.fights.map((x, i) => ({ x, i, v: cfg.value(x) })).reverse(); // oldest first
  const vals = rows.filter((r) => r.v != null).map((r) => r.v!);
  if (vals.length < 2) {
    echarts.getInstanceByDom(el)?.dispose();
    el.innerHTML = `<p class="nodata">No data · fewer than 2 UFC fights have this statistic</p>`;
    return;
  }
  if (el.querySelector(".nodata")) el.innerHTML = "";
  const avg = vals.reduce((t, v) => t + v, 0) / vals.length;
  const color = entry.color;
  const data = rows.map(({ x, i, v }) => ({ value: v, fight: x, slug: entry.f.slug, idx: i, tone, color, avg, symbol: symbolFor(x.result) }));
  const series = [
    {
      type: "line" as const,
      name: entry.f.name,
      smooth: 0.3,
      connectNulls: false,
      symbolSize: 9,
      cursor: "pointer",
      itemStyle: { color },
      // Points: the same series without its line and fill.
      lineStyle: mode === "line" ? { color, width: 2.5 } : { color, width: 0, opacity: 0 },
      areaStyle: mode === "line" ? { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: color + "59" }, { offset: 1, color: color + "00" }]) } : undefined,
      emphasis: { scale: false, focus: "none" as const, itemStyle: { borderColor: "#fff", borderWidth: 2.5 } },
      markLine: avgLine("yAxis", avg, color, `avg ${fmt(avg)}`),
      data,
    },
  ];
  const chart = instance(el);
  chart.setOption(
    {
      textStyle: font,
      grid: { left: 48, right: 24, top: 24, bottom: 30 },
      tooltip: {
        ...tooltip,
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: LINE } },
        formatter: (ps: { data: { fight: Fight; value: number | null; avg: number } }[]) => {
          const d = ps[0]?.data;
          if (!d) return "";
          const { fight: x, value } = d;
          const head = `<b>${esc(lastName(entry.f.name))}</b> vs ${esc(x.opponent)} · ${RESULT[x.result]}<br>${dateLong(x.date)} · ${esc(x.method_detail)}${x.round ? `, R${x.round} ${clock(x.round_time_s)}` : ""}<br>`;
          return head + (value == null ? `${esc(label)}: no data` : `${esc(label)}: <b>${fmt(value)}</b> (${signedNum(value - d.avg, cfg.digits)} vs avg)`);
        },
      },
      xAxis: { type: "category", boundaryGap: false, data: rows.map((r) => r.x.date), ...axis, axisLabel: { ...axis.axisLabel, formatter: shortDate, hideOverlap: true } },
      yAxis: { type: "value", ...axis, min: 0, max: cfg.unit === "%" ? 100 : undefined },
      series,
    },
    true,
  );
  register(chart, series);
  openOnClick(chart);
}

// ---------- fights.returns ----------
function oddsType(o: number): OddsType {
  if (o < 1.5) return "Heavy favorite";
  if (o < 2) return "Favorite";
  if (o < 2.5) return "Pick'em";
  if (o < 4) return "Underdog";
  return "Heavy underdog";
}
const stakeReturn = (x: Fight, stake: number) => (x.result === "W" ? stake * (x.odds! - 1) : x.result === "L" ? -stake : 0);

/** Betting returns as a line: running net result of a 100 bet on every priced fight, by date; break-even at 0. */
function roiLine(entries: Entry[], priced: { x: Fight; i: number }[][], tones: string[]) {
  const series = entries.map((e, s) => {
    let total = 0;
    const data = [...priced[s]].reverse().map(({ x, i }) => {
      const net = stakeReturn(x, 100);
      total += net;
      return { value: [x.date, Math.round(total)], symbol: symbolFor(x.result), fight: x, fighter: e.f.name, slug: e.f.slug, idx: i, tone: tones[s], color: e.color, net };
    });
    return {
      type: "line" as const,
      name: e.f.name,
      itemStyle: { color: e.color },
      lineStyle: { color: e.color, width: 2 },
      symbolSize: 11,
      emphasis,
      cursor: "pointer",
      data,
    };
  });
  const option = {
    textStyle: font,
    grid: { left: 56, right: 24, top: 24, bottom: 30 },
    tooltip: {
      ...tooltip,
      trigger: "item",
      formatter: (p: { data: { fight: Fight; fighter: string; value: [string, number]; net: number } }) => {
        const { fight: x, fighter, value, net } = p.data;
        return `<b>${esc(lastName(fighter))}</b> vs ${esc(x.opponent)} · ${RESULT[x.result]}<br>${dateLong(x.date)} · ${oddsType(x.odds!)} at ${x.odds!.toFixed(2)}<br>This fight: <b>${signedNum(net)}</b> · running total: <b>${signedNum(value[1])}</b><br><span style="color:${FAINT}">Click for the full fight</span>`;
      },
    },
    xAxis: { type: "time" as const, ...axis },
    yAxis: { type: "value" as const, ...axis, name: "running net on 100 bets", nameLocation: "end" as const, nameTextStyle: { ...font, color: FAINT, align: "left" as const } },
    series: [
      ...series,
      { type: "scatter" as const, data: [], silent: true, markLine: { silent: true, symbol: "none", lineStyle: { color: MUTED, type: "solid" as const, width: 1, opacity: 0.35 }, label: { show: true, formatter: "break-even", color: FAINT, opacity: 0.7, fontSize: 11, position: "insideEndTop" as const }, data: [{ yAxis: 0 }] } },
    ],
  };
  return { option, series };
}

function roi(el: HTMLElement, entries: Entry[], range: Range, tones: string[], mode: Mode) {
  // Rows of the odds types hold one dot column per fighter, spread around the row centre (2 fighters: ±0.17).
  const step = Math.min(0.34, 0.72 / entries.length);
  const offsets = entries.map((_, s) => (entries.length > 1 ? (s - (entries.length - 1) / 2) * step : 0));
  const priced = entries.map((e) => inRange(e.f.fights, range).filter(({ x }) => x.odds));
  const series = entries.map((e, s) => {
    const avg = priced[s].length ? priced[s].reduce((t, { x }) => t + stakeReturn(x, 100), 0) / priced[s].length : null;
    return {
      type: "scatter" as const,
      name: e.f.name,
      itemStyle: { color: e.color },
      symbolSize: POINT,
      emphasis,
      cursor: "pointer",
      markLine: avg == null ? undefined : avgLine("xAxis", avg, e.color, `${lastName(e.f.name)} avg ${signedNum(avg)}`, s, "start"), // y axis is inverted: start = top
      data: priced[s].map(({ x, i }) => ({
        value: [Math.round(stakeReturn(x, 100)), ODDS_TYPES.indexOf(oddsType(x.odds!)) + offsets[s]],
        symbol: symbolFor(x.result),
        fight: x,
        fighter: e.f.name,
        slug: e.f.slug,
        idx: i,
        tone: tones[s],
        color: e.color,
      })),
    };
  });
  const line = mode === "line" ? roiLine(entries, priced, tones) : null;
  const chart = instance(el);
  chart.setOption(
    line ? line.option : {
      textStyle: font,
      grid: { left: 110, right: 24, top: Math.max(44, 16 + 14 * entries.length), bottom: 40 },
      tooltip: {
        ...tooltip,
        trigger: "item",
        formatter: (p: { data: { fight: Fight; fighter: string; value: [number, number] } }) => {
          const { fight: x, fighter, value } = p.data;
          const chance = x.implied_prob_fair != null ? `, market gave ${Math.round(x.implied_prob_fair * 100)}%` : "";
          return `<b>${esc(lastName(fighter))}</b> vs ${esc(x.opponent)} · ${RESULT[x.result]}<br>${dateLong(x.date)}<br>${oddsType(x.odds!)} at ${x.odds!.toFixed(2)}${chance}<br>Net on 100: <b>${signedNum(value[0])}</b><br><span style="color:${FAINT}">Click for the full fight</span>`;
        },
      },
      xAxis: { type: "value", ...axis, axisLine: { show: false }, name: "net return on 100", nameLocation: "middle", nameGap: 26, nameTextStyle: { ...font, color: FAINT } },
      yAxis: {
        type: "value", ...axis, min: -0.5, max: ODDS_TYPES.length - 0.5, interval: 1, inverse: true,
        splitLine: { show: true, lineStyle: { color: "rgb(255 255 255 / 0.04)" } }, axisLine: { show: false },
        axisLabel: { ...axis.axisLabel, formatter: (v: number) => ODDS_TYPES[Math.round(v)] ?? "" },
      },
      series: [
        ...series,
        { type: "scatter", data: [], silent: true, markLine: { silent: true, symbol: "none", lineStyle: { color: MUTED, type: "solid", width: 1, opacity: 0.35 }, label: { show: true, formatter: "break-even", color: FAINT, opacity: 0.7, fontSize: 11, position: "end", rotate: 0, distance: 18 }, data: [{ xAxis: 0 }] } },
      ],
    },
    true,
  );
  register(chart, line ? line.series : series);
  openOnClick(chart);

  const slot = el.closest(".panel")?.querySelector<HTMLElement>('[data-slot="roi-table"]');
  if (slot) {
    const cell = (fs: { x: Fight }[]) => {
      if (!fs.length) return `<td class="num">—</td>`;
      const pct = (fs.reduce((t, { x }) => t + stakeReturn(x, 100), 0) / (100 * fs.length)) * 100;
      return `<td class="num ${pct >= 0 ? "pos" : "neg"}">${signedNum(pct)}%<small> ${fs.length}${fs.length < 5 ? "*" : ""}</small></td>`;
    };
    const head = entries.map((e) => `<th scope="col" class="num" style="color:${e.color}">${esc(lastName(e.f.name))}</th>`).join("");
    const rows = ODDS_TYPES.map((t) => `<tr><th scope="row">${t}</th>${priced.map((fs) => cell(fs.filter(({ x }) => oddsType(x.odds!) === t))).join("")}</tr>`).join("");
    const total = `<tr class="tot"><th scope="row">All priced fights</th>${priced.map(cell).join("")}</tr>`;
    const exp = entries
      .map((e, s) => {
        const fair = priced[s].filter(({ x }) => x.implied_prob_fair != null && x.result !== "D" && x.result !== "NC");
        if (!fair.length) return "";
        const expected = fair.reduce((t, { x }) => t + x.implied_prob_fair!, 0);
        const won = fair.filter(({ x }) => x.result === "W").length;
        return `<p><b style="color:${e.color}">${esc(lastName(e.f.name))}</b> won ${won} of ${fair.length}; the market expected ${expected.toFixed(1)} (${signedNum(won - expected, 1)}).</p>`;
      })
      .join("");
    slot.innerHTML = `<table class="mini"><thead><tr><th scope="col">ROI · fights</th>${head}</tr></thead><tbody>${rows}${total}</tbody></table><div class="ret__exp">${exp}</div>`;
  }
}

// ---------- fights.length ----------
const BINS = [0, 5, 10, 15, 20, 25];

function duration(el: HTMLElement, entries: Entry[], range: Range, mode: Mode) {
  const sets = entries.map((e) => inRange(e.f.fights, range).map(({ x }) => x).filter((x) => x.fight_time_s != null));
  const bars = entries.map((e, s) => {
    const fs = sets[s];
    // Right-closed bins like the pipeline: a 15:00 decision belongs to 10–15.
    const counts = BINS.slice(0, -1).map((lo, i) => fs.filter((x) => { const m = x.fight_time_s! / 60; return (i === 0 ? m >= lo : m > lo) && m <= BINS[i + 1]; }).length);
    const data = counts.map((c, i) => ({ value: c, bin: i, total: fs.length }));
    // Line: a frequency polygon over the same bins; a fighter with no fights in the span has no series.
    if (mode === "line") {
      return {
        type: "line" as const,
        name: e.f.name,
        symbolSize: 9,
        itemStyle: { color: e.color },
        lineStyle: { color: e.color, width: 2.5 },
        areaStyle: { color: e.color, opacity: 0.08 },
        emphasis: { scale: false, itemStyle: { borderColor: "#fff", borderWidth: 2 } },
        data: fs.length ? data : [],
      };
    }
    return {
      type: "bar" as const,
      name: e.f.name,
      barMaxWidth: 34,
      barGap: "12%",
      itemStyle: { color: e.color, borderRadius: [4, 4, 0, 0] },
      emphasis: { itemStyle: { color: e.color, borderColor: "#fff", borderWidth: 2 } },
      data,
    };
  });
  // Averages ride on a hidden 0–25 value axis laid exactly over the five round-long categories.
  const avgs = entries.map((e, s) => {
    const fs = sets[s];
    const avg = fs.length ? fs.reduce((t, x) => t + x.fight_time_s!, 0) / fs.length / 60 : null;
    return { type: "scatter" as const, xAxisIndex: 1, data: [], silent: true, markLine: avg == null ? undefined : avgLine("xAxis", avg, e.color, `${lastName(e.f.name)} avg ${avg.toFixed(1)} min`, s) };
  });
  instance(el).setOption(
    {
      textStyle: font,
      grid: { left: 36, right: 24, top: Math.max(44, 16 + 14 * entries.length), bottom: 40 },
      tooltip: {
        ...tooltip,
        trigger: "item",
        formatter: (p: { seriesName: string; data: { value: number; bin: number; total: number } }) => {
          const { value, bin, total } = p.data;
          return `<b>${esc(lastName(p.seriesName))}</b> · ended in round ${bin + 1} time (${BINS[bin]}–${BINS[bin + 1]} min)<br><b>${value}</b> of ${total} fights (${total ? Math.round((value / total) * 100) : 0}%)`;
        },
      },
      xAxis: [
        { type: "category", data: BINS.slice(0, -1).map((lo, i) => `R${i + 1} · ${lo}–${BINS[i + 1]} min`), ...axis, splitLine: { show: false } },
        { type: "value", min: 0, max: 25, show: false },
      ],
      yAxis: { type: "value", ...axis, minInterval: 1 },
      series: [...bars, ...avgs],
    },
    true,
  );
  const slot = el.closest(".panel")?.querySelector<HTMLElement>('[data-slot="dur-table"]');
  if (slot) {
    const stats = entries.map((e, s) => {
      const fs = sets[s];
      const decided = fs.filter((x) => x.result !== "NC");
      return {
        e,
        n: fs.length,
        avg: fs.length ? fs.reduce((t, x) => t + x.fight_time_s!, 0) / fs.length / 60 : null,
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

// ---------- fights.methods (groups): wins and losses by method, stacked horizontally ----------
/** `color` mixed with the card ink by `pct` percent, like the .m1/.m2 steps in app.css. */
function shade(color: string, pct: number): string {
  const mix = (c: number, k: number) => Math.round(c * (pct / 100) + k * (1 - pct / 100));
  const n = parseInt(color.slice(1), 16);
  return `rgb(${mix((n >> 16) & 255, 0x1c)} ${mix((n >> 8) & 255, 0x1e)} ${mix(n & 255, 0x22)})`;
}
function methods(el: HTMLElement, entries: Entry[]) {
  // Two rows per fighter (wins above, losses below); the fighter's colour carries the identity, its shade the method.
  const rows = entries.flatMap((e) => [{ e, kind: "Wins", by: e.f.wins_by }, { e, kind: "Losses", by: e.f.losses_by }]);
  const tint = (c: string, i: number) => (i === 0 ? c : i === 1 ? shade(c, 58) : i === 2 ? shade(c, 30) : "#6b7080");
  const series = METHODS.map(([k, label], i) => ({
    type: "bar" as const,
    name: label,
    stack: "m",
    barWidth: 16,
    emphasis: { itemStyle: { borderColor: "#fff", borderWidth: 2 } },
    label: { show: true, color: "#fff", fontWeight: 800, fontSize: 12, fontFamily: font.fontFamily, formatter: (p: { value: number }) => (p.value ? String(p.value) : "") },
    itemStyle: { borderColor: "#15171b", borderWidth: 1 },
    data: rows.map((r) => ({ value: r.by[k], kind: r.kind, fighter: r.e.f.name, total: METHODS.reduce((t, [m]) => t + r.by[m], 0), itemStyle: { color: tint(r.e.color, i) } })),
  }));
  // A pair of rows per fighter with a gap between pairs: category spacing alone does not separate them, the name does.
  const h = 40 + rows.length * 30;
  el.style.height = `${h}px`;
  instance(el).setOption(
    {
      textStyle: font,
      grid: { left: 150, right: 24, top: 8, bottom: 8 },
      tooltip: {
        ...tooltip,
        trigger: "item",
        formatter: (p: { seriesName: string; data: { value: number; kind: string; fighter: string; total: number } }) => {
          const { value, kind, fighter, total } = p.data;
          return `<b>${esc(lastName(fighter))}</b> · ${kind.toLowerCase()} by ${p.seriesName.toLowerCase()}<br><b>${value}</b> of ${total} ${kind.toLowerCase()}${total ? ` (${Math.round((value / total) * 100)}%)` : ""}`;
        },
      },
      xAxis: { type: "value", ...axis, minInterval: 1, splitLine: { show: true, lineStyle: { color: LINE } } },
      yAxis: {
        type: "category",
        inverse: true,
        data: rows.map((r) => `${entries.indexOf(r.e)}|${r.e.f.name}|${r.kind}`),
        ...axis,
        axisLine: { show: false },
        splitLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          ...axis.axisLabel,
          interval: 0,
          formatter: (v: string) => { const [i, n, k] = v.split("|"); return k === "Wins" ? `{n${i}|${lastName(n)}} {k|${k}}` : `{k|${k}}`; },
          rich: { k: { color: MUTED, fontSize: 12, fontFamily: font.fontFamily }, ...Object.fromEntries(entries.map((e, i) => [`n${i}`, { color: e.color, fontWeight: 700, fontSize: 12, fontFamily: font.fontFamily }])) },
        },
      },
      series,
    },
    true,
  );
}

const observed = new WeakSet<HTMLElement>();
const drawers = new WeakMap<HTMLElement, () => void>();
const resizer = new ResizeObserver((items) => {
  for (const it of items) echarts.getInstanceByDom(it.target as HTMLElement)?.resize();
});
const pressed = (panel: Element, attr: string, fallback: string) =>
  (panel.querySelector(`[${attr}][aria-pressed="true"]`) as HTMLElement | null)?.getAttribute(attr) ?? fallback;
function wire(panel: Element, attr: string, redraw: () => void) {
  panel.querySelectorAll<HTMLButtonElement>(`[${attr}]`).forEach((btn) =>
    btn.addEventListener("click", () => {
      panel.querySelectorAll(`[${attr}]`).forEach((x) => x.setAttribute("aria-pressed", String(x === btn)));
      redraw();
    }),
  );
}

// ---------- tabbed chart block (fights.charts): ARIA tabs, one Time span and one Points/Line switch ----------
const setParam = (k: string, v: string) => {
  try {
    const u = new URL(location.href);
    u.searchParams.set(k, v);
    // URLSearchParams escapes the commas of ?f=a,b,c; keep the readable form the rest of the site writes.
    history.replaceState(history.state, "", `${u.pathname}${u.search.replace(/%2C/gi, ",")}${u.hash}`);
  } catch { /* the URL is a convenience */ }
};
/** Draws the charts of the visible view (hidden ones are drawn when they are shown) and gives them their size. */
function redrawVisible(block: HTMLElement) {
  for (const el of block.querySelectorAll<HTMLElement>("[data-chart]")) {
    if (el.closest("[hidden]")) continue;
    drawers.get(el)?.();
    echarts.getInstanceByDom(el)?.resize();
  }
}
function selectTab(block: HTMLElement, tab: HTMLElement, opts: { focus?: boolean; url?: boolean; redraw?: boolean }) {
  const id = tab.dataset.tab;
  block.querySelectorAll<HTMLElement>('[role="tab"]').forEach((t) => {
    t.setAttribute("aria-selected", String(t === tab));
    t.tabIndex = t === tab ? 0 : -1;
  });
  let uses = "";
  block.querySelectorAll<HTMLElement>('[role="tabpanel"]').forEach((v) => {
    v.hidden = v.dataset.view !== id;
    if (!v.hidden) uses = v.dataset.uses ?? "";
  });
  // Controls the view does not use are hidden; they keep their value.
  block.querySelectorAll<HTMLElement>("[data-ctl]").forEach((c) => (c.hidden = !uses.split(" ").includes(c.dataset.ctl!)));
  if (opts.focus) tab.focus();
  if (opts.url) setParam("chart", id!);
  if (opts.redraw) redrawVisible(block);
}
function applyMode(block: HTMLElement, mode: Mode) {
  block.querySelectorAll<HTMLElement>("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  block.querySelectorAll<HTMLElement>("[data-desc]").forEach((d) => (d.hidden = d.dataset.desc !== mode));
}
/** Applies ?chart= and ?mode= (invalid → defaults) to the block. */
function readUrl(block: HTMLElement, redraw: boolean) {
  const q = new URLSearchParams(location.search);
  const tabs = [...block.querySelectorAll<HTMLElement>('[role="tab"]')];
  const m = q.get("mode");
  applyMode(block, m === "points" || m === "line" ? m : (block.dataset.defaultMode as Mode));
  selectTab(block, tabs.find((t) => t.dataset.tab === q.get("chart")) ?? tabs[0], { redraw });
}
/** Re-reads the URL after Back/Forward (the block was wired already). */
export function syncBlockFromUrl(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>("[data-tabs][data-ready]").forEach((b) => readUrl(b, true));
}
/** Reads ?chart= and ?mode= (invalid → defaults) and wires tabs and switch, once per block. */
function initBlock(block: HTMLElement) {
  if (block.dataset.ready) return;
  block.dataset.ready = "1";
  readUrl(block, false);
  const tabs = [...block.querySelectorAll<HTMLElement>('[role="tab"]')];
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => selectTab(block, t, { url: true, redraw: true }));
    t.addEventListener("keydown", (ev) => {
      const to = ev.key === "ArrowRight" ? (i + 1) % tabs.length : ev.key === "ArrowLeft" ? (i + tabs.length - 1) % tabs.length : ev.key === "Home" ? 0 : ev.key === "End" ? tabs.length - 1 : -1;
      if (to < 0) return;
      ev.preventDefault();
      selectTab(block, tabs[to], { focus: true, url: true, redraw: true });
    });
  });
  block.querySelectorAll<HTMLElement>("[data-mode]").forEach((b) =>
    b.addEventListener("click", () => {
      applyMode(block, b.dataset.mode as Mode);
      setParam("mode", b.dataset.mode!);
      redrawVisible(block);
    }),
  );
}

/** Draw every [data-chart] inside root. `tones` names each entry's corner for the fight dialog. */
export function drawCharts(root: ParentNode, entries: Entry[], tones: string[] = ["a", "b"]): void {
  if (!entries.length) return;
  linkHistoryRows();
  root.querySelectorAll<HTMLElement>("[data-tabs]").forEach(initBlock);
  for (const el of root.querySelectorAll<HTMLElement>("[data-chart]")) {
    const kind = el.dataset.chart;
    const panel = el.closest(".panel")!;
    const range = () => pressed(panel, "data-range", "all") as Range;
    const mode = () => pressed(panel, "data-mode", "points") as Mode;
    let draw: () => void;
    if (kind === "radar") draw = () => radar(el, entries, pressed(panel, "data-layer", "both"));
    else if (kind === "perf") draw = () => perf(el, entries, pressed(panel, "data-metric", "slpm") as PerfMetric, range(), tones, mode());
    else if (kind === "career") draw = () => career(el, entries[0], panel.querySelector<HTMLSelectElement>("[data-career-metric]")?.value ?? "sig_landed", tones[0], mode());
    else if (kind === "roi") draw = () => roi(el, entries, range(), tones, mode());
    else if (kind === "dur") draw = () => duration(el, entries, range(), mode());
    else if (kind === "methods") draw = () => methods(el, entries);
    else continue;
    // A view in a hidden tab is drawn when it is shown: ECharts would measure 0 px.
    if (el.closest("[data-tabs]")) {
      const inner = draw;
      draw = () => { if (!el.closest("[hidden]")) inner(); };
    }
    drawers.set(el, draw);
    draw();
    // Listeners and observers are attached once per element; they always call its latest draw.
    if (observed.has(el)) continue;
    observed.add(el);
    resizer.observe(el);
    const redraw = () => drawers.get(el)?.();
    wire(panel, "data-range", redraw);
    if (kind === "perf") wire(panel, "data-metric", redraw);
    if (kind === "career") panel.querySelector("[data-career-metric]")?.addEventListener("change", redraw);
    if (kind === "radar") {
      wire(panel, "data-layer", redraw);
      // The radius is set in pixels, so redraw when the block changes size (alignRadar stretches it).
      let w = el.clientWidth, h = el.clientHeight;
      new ResizeObserver(() => {
        if (Math.abs(el.clientWidth - w) > 8 || Math.abs(el.clientHeight - h) > 8) {
          w = el.clientWidth;
          h = el.clientHeight;
          redraw();
        }
      }).observe(el);
    }
  }
}

export function disposeCharts(root: ParentNode): void {
  for (const el of root.querySelectorAll<HTMLElement>("[data-chart]")) echarts.getInstanceByDom(el)?.dispose();
}
