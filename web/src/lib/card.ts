// Export image: a 1200×630 share card drawn on a canvas (names, records, rates, tape and the radar).
import * as echarts from "echarts/core";
import type { Fighter } from "./data";
import { age, finishRate, winRate } from "./render";

const W = 1200, H = 630;
const RED = "#e5484d", BLUE = "#3e8cf0";

const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x)}%`);

async function radarImage(centre: HTMLElement): Promise<HTMLImageElement | null> {
  const el = centre.querySelector<HTMLElement>('[data-chart="radar"]');
  const chart = el && echarts.getInstanceByDom(el);
  if (!chart) return null;
  const url = chart.getDataURL({ type: "svg" });
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

export async function exportCard(a: Fighter, b: Fighter, centre: HTMLElement): Promise<Blob | null> {
  await document.fonts.ready;
  const c = Object.assign(document.createElement("canvas"), { width: W * 2, height: H * 2 });
  const g = c.getContext("2d")!;
  g.scale(2, 2);
  g.fillStyle = "#0b0c0f";
  g.fillRect(0, 0, W, H);
  const glow = (x0: number, color: string) => {
    const gr = g.createLinearGradient(x0, 0, x0 === 0 ? W * 0.4 : W * 0.6, 0);
    gr.addColorStop(0, color + "55");
    gr.addColorStop(1, color + "00");
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  };
  glow(0, RED);
  glow(W, BLUE);

  const display = (size: number) => `800 ${size}px "Archivo Variable", "Inter Variable", sans-serif`;
  const ui = (size: number, weight = 500) => `${weight} ${size}px "Inter Variable", sans-serif`;
  const side = (f: Fighter, x: number, align: CanvasTextAlign, color: string) => {
    g.textAlign = align;
    g.fillStyle = color;
    g.font = ui(18, 650);
    g.fillText(f.weight_class ?? "", x, 70);
    g.fillStyle = "#f5f6f8";
    g.font = display(54);
    g.fillText(f.name, x, 128);
    g.font = display(84);
    g.fillText(`${f.record.wins}-${f.record.losses}-${f.record.draws}`, x, 222);
    g.font = ui(18);
    g.fillStyle = "#a6a9b1";
    const facts = [age(f) != null ? `${age(f)} yrs` : null, f.height_cm ? `${Math.round(f.height_cm)} cm` : null, f.reach_cm ? `${Math.round(f.reach_cm)} cm reach` : null].filter(Boolean).join(" · ");
    g.fillText(facts, x, 258);
    const rows: [string, string][] = [
      ["Win rate", pct(winRate(f))],
      ["Finish rate (UFC)", pct(finishRate(f))],
      ["Style", f.archetype ?? "—"],
    ];
    rows.forEach(([k, v], i) => {
      const y = 330 + i * 64;
      g.fillStyle = "#868a93";
      g.font = ui(16);
      g.fillText(k, x, y);
      g.fillStyle = color;
      g.font = display(38);
      g.fillText(v, x, y + 40);
    });
  };
  side(a, 60, "left", RED);
  side(b, W - 60, "right", BLUE);

  const img = await radarImage(centre);
  if (img) {
    const s = 360;
    g.drawImage(img, W / 2 - s / 2, 230, s, (s * img.height) / img.width);
  }
  g.textAlign = "center";
  g.fillStyle = "#f5f6f8";
  g.font = display(40);
  g.fillText("VS", W / 2, 170);
  g.fillStyle = "#868a93";
  g.font = ui(15);
  g.fillText(`Fighter Compare · ${location.host}${location.pathname}${location.search}`, W / 2, H - 28);
  return new Promise((res) => c.toBlob(res, "image/png"));
}
