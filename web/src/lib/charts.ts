// Client-only ECharts views: radar (duel.style), performance, betting returns and fight length.
// Fight points are linked to the history rows: hovering a row highlights its points, clicking a
// point opens fight.dialog (event "fight:open").
import { BarChart, RadarChart, ScatterChart } from "echarts/charts";
import { GridComponent, MarkLineComponent, RadarComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import type { Fight, Fighter, OddsType } from "./data";
import { dateLong, esc, lastName } from "./format";
import { METRICS, ODDS_TYPES, clock, population } from "./render";

echarts.use([RadarChart, ScatterChart, BarChart, RadarComponent, GridComponent, TooltipComponent, MarkLineComponent, SVGRenderer]);

export interface Entry {
  f: Fighter;
  color: string;
}
type Range = "all" | "5y" | "3y" | "10";
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
    const d = p.data as { slug?: string; idx?: number; tone?: string } | undefined;
    if (d?.slug != null && d.idx != null) document.dispatchEvent(new CustomEvent("fight:open", { detail: { slug: d.slug, i: d.idx, tone: d.tone } }));
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

// ---------- fights.performance ----------
export type PerfMetric = "slpm" | "acc" | "td" | "sub";
const PERF: Record<PerfMetric, { label: string; unit: string; digits: number; value: (x: Fight) => number | null }> = {
  slpm: { label: "Significant strikes landed per minute", unit: "/min", digits: 1, value: (x) => (x.stats?.sig_landed != null && x.fight_time_s ? x.stats.sig_landed / (x.fight_time_s / 60) : null) },
  acc: { label: "Significant strike accuracy", unit: "%", digits: 0, value: (x) => (x.stats?.sig_landed != null && x.stats.sig_attempted ? (x.stats.sig_landed / x.stats.sig_attempted) * 100 : null) },
  td: { label: "Takedowns landed", unit: "", digits: 0, value: (x) => (x.stats ? x.stats.td : null) },
  sub: { label: "Submission attempts", unit: "", digits: 0, value: (x) => (x.stats ? x.stats.sub_att : null) },
};

function perf(el: HTMLElement, entries: Entry[], metric: PerfMetric, range: Range, tones: string[]) {
  const cfg = PERF[metric];
  const fmt = (v: number) => `${v.toFixed(cfg.digits)}${cfg.unit}`;
  const series = entries.map((e, s) => {
    const pts = inRange(e.f.fights, range)
      .map(({ x, i }) => ({ x, i, v: cfg.value(x) }))
      .filter((d) => d.v != null);
    const avg = pts.length ? pts.reduce((t, d) => t + d.v!, 0) / pts.length : null;
    return {
      type: "scatter" as const,
      name: e.f.name,
      itemStyle: { color: e.color },
      symbolSize: POINT,
      emphasis,
      cursor: "pointer",
      avg,
      markLine: avg == null ? undefined : avgLine("yAxis", avg, e.color, `${lastName(e.f.name)} avg ${fmt(avg)}`),
      data: pts.map(({ x, i, v }) => ({ value: [x.date, v], symbol: symbolFor(x.result), fight: x, fighter: e.f.name, slug: e.f.slug, idx: i, tone: tones[s], avg })),
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

// ---------- fights.returns ----------
function oddsType(o: number): OddsType {
  if (o < 1.5) return "Heavy favorite";
  if (o < 2) return "Favorite";
  if (o < 2.5) return "Pick'em";
  if (o < 4) return "Underdog";
  return "Heavy underdog";
}
const stakeReturn = (x: Fight, stake: number) => (x.result === "W" ? stake * (x.odds! - 1) : x.result === "L" ? -stake : 0);

function roi(el: HTMLElement, entries: Entry[], range: Range, tones: string[]) {
  const offsets = entries.length > 1 ? [-0.17, 0.17] : [0];
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
      })),
    };
  });
  const chart = instance(el);
  chart.setOption(
    {
      textStyle: font,
      grid: { left: 110, right: 24, top: 44, bottom: 40 },
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
  register(chart, series);
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

function duration(el: HTMLElement, entries: Entry[], range: Range) {
  const sets = entries.map((e) => inRange(e.f.fights, range).map(({ x }) => x).filter((x) => x.fight_time_s != null));
  const bars = entries.map((e, s) => {
    const fs = sets[s];
    // Right-closed bins like the pipeline: a 15:00 decision belongs to 10–15.
    const counts = BINS.slice(0, -1).map((lo, i) => fs.filter((x) => { const m = x.fight_time_s! / 60; return (i === 0 ? m >= lo : m > lo) && m <= BINS[i + 1]; }).length);
    return {
      type: "bar" as const,
      name: e.f.name,
      barMaxWidth: 34,
      barGap: "12%",
      itemStyle: { color: e.color, borderRadius: [4, 4, 0, 0] },
      emphasis: { itemStyle: { color: e.color, borderColor: "#fff", borderWidth: 2 } },
      data: counts.map((c, i) => ({ value: c, bin: i, total: fs.length })),
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
      grid: { left: 36, right: 24, top: 44, bottom: 40 },
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

const observed = new WeakSet<HTMLElement>();
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

/** Draw every [data-chart] inside root. `tones` names each entry's corner for the fight dialog. */
export function drawCharts(root: ParentNode, entries: Entry[], tones: string[] = ["a", "b"]): void {
  if (!entries.length) return;
  linkHistoryRows();
  for (const el of root.querySelectorAll<HTMLElement>("[data-chart]")) {
    const kind = el.dataset.chart;
    const panel = el.closest(".panel")!;
    const range = () => pressed(panel, "data-range", "all") as Range;
    let draw: () => void;
    if (kind === "radar") draw = () => radar(el, entries, pressed(panel, "data-layer", "both"));
    else if (kind === "perf") draw = () => perf(el, entries, pressed(panel, "data-metric", "slpm") as PerfMetric, range(), tones);
    else if (kind === "roi") draw = () => roi(el, entries, range(), tones);
    else if (kind === "dur") draw = () => duration(el, entries, range());
    else continue;
    draw();
    wire(panel, "data-range", draw);
    if (kind === "perf") wire(panel, "data-metric", draw);
    if (kind === "radar") {
      wire(panel, "data-layer", draw);
      // The radius is set in pixels, so redraw when the block changes size (alignRadar stretches it).
      let w = el.clientWidth, h = el.clientHeight;
      new ResizeObserver(() => {
        if (Math.abs(el.clientWidth - w) > 8 || Math.abs(el.clientHeight - h) > 8) {
          w = el.clientWidth;
          h = el.clientHeight;
          draw();
        }
      }).observe(el);
    }
    if (!observed.has(el)) {
      observed.add(el);
      resizer.observe(el);
    }
  }
}

export function disposeCharts(root: ParentNode): void {
  for (const el of root.querySelectorAll<HTMLElement>("[data-chart]")) echarts.getInstanceByDom(el)?.dispose();
}
