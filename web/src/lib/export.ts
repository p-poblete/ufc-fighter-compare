// Export by components (docs/spec.md §11.1 #9). Loaded with import() the first time the "select" mode is entered,
// so neither this module nor modern-screenshot is part of the initial bundle (CA10, CA24).
import * as echarts from "echarts/core";
import { domToBlob } from "modern-screenshot";
import { initials } from "./format";
import { toast } from "./tools";

const WIDTH = 1200;
const GROUND = "#0b0c0f";

let active: { cancel: (restore?: boolean) => void; busy: () => boolean } | null = null;

const blocks = (main: Element): HTMLElement[] =>
  [...main.querySelectorAll<HTMLElement>(".panel")].filter((p) => !p.hidden && !p.parentElement?.closest(".panel") && !p.closest("[hidden]"));

/** The tabbed chart block counts as one and is named after its active tab. */
const tabTitle = (p: HTMLElement): string | undefined => p.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.dataset.title;
const blockName = (p: HTMLElement): string =>
  tabTitle(p) || p.querySelector(":scope > .panel__head h2")?.textContent?.trim() || p.getAttribute("aria-label") || p.dataset.module || "Block";
const blockKey = (p: HTMLElement): string => `${p.dataset.module ?? ""}|${p.dataset.tone ?? ""}|${tabTitle(p) ? p.getAttribute("aria-label") : blockName(p)}`;

/** File name by view: compare, profile or group (spec §11.1 #9). */
function fileName(main: HTMLElement): string {
  const q = new URLSearchParams(location.search);
  const path = location.pathname;
  if (path.startsWith("/groups")) {
    const f = (q.get("f") ?? "").split(",").filter(Boolean);
    return `ufc-group-${f.join("-") || "empty"}.png`;
  }
  if (path.startsWith("/fighters/")) return `ufc-${main.dataset.slug ?? path.split("/").filter(Boolean).pop()}.png`;
  const explicit = q.has("a") || q.has("b");
  const a = explicit ? q.get("a") : main.dataset.featuredA;
  const b = explicit ? q.get("b") : main.dataset.featuredB;
  return a && b ? `ufc-${a}-vs-${b}.png` : `ufc-${a || b || "comparison"}.png`;
}

let fontCss: Promise<string | undefined> | null = null;
/** Self-hosted Inter and Archivo (latin and latin-ext subsets) as data: URLs, so the capture draws them exactly. */
function fonts(): Promise<string | undefined> {
  return (fontCss ??= (async () => {
    try {
      const out: string[] = [];
      for (const sheet of [...document.styleSheets]) {
        let rules: CSSRuleList;
        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }
        for (const r of [...rules]) {
          if (!(r instanceof CSSFontFaceRule)) continue;
          const s = r.style;
          const fam = s.getPropertyValue("font-family").replace(/["']/g, "").trim();
          const range = s.getPropertyValue("unicode-range");
          if (!/^(Inter|Archivo) Variable$/.test(fam) || !/U\+0000-00FF|U\+0100-02BA/.test(range)) continue;
          const m = /url\(["']?([^"')]+\.woff2)["']?\)/.exec(s.getPropertyValue("src"));
          if (!m) continue;
          const blob = await (await fetch(new URL(m[1], sheet.href ?? location.href))).blob();
          const url = await toDataUrl(blob);
          out.push(
            `@font-face{font-family:"${fam}";font-style:${s.getPropertyValue("font-style") || "normal"};font-weight:${s.getPropertyValue("font-weight") || "400"};` +
              `${s.getPropertyValue("font-stretch") ? `font-stretch:${s.getPropertyValue("font-stretch")};` : ""}font-display:block;src:url(${url}) format("woff2");unicode-range:${range};}`,
          );
        }
      }
      return out.length ? out.join("\n") : undefined;
    } catch {
      return undefined; // the library embeds the page's fonts by itself
    }
  })());
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

/** corner.identity: keep only the face that is visible on the page and drop the 3D flip, so the capture is flat. */
function flatten(clone: HTMLElement): void {
  const blocks = clone.matches('[data-module="corner.identity"]') ? [clone] : [...clone.querySelectorAll<HTMLElement>('[data-module="corner.identity"]')];
  for (const b of blocks) {
    const back = b.classList.contains("is-flipped");
    b.classList.remove("is-flipped");
    b.querySelector(`[data-face="${back ? "front" : "back"}"]`)?.remove();
    const keep = b.querySelector<HTMLElement>(".face");
    keep?.removeAttribute("inert");
    keep?.style.setProperty("backface-visibility", "visible");
    keep?.style.setProperty("-webkit-backface-visibility", "visible");
    for (const e of b.querySelectorAll<HTMLElement>(".flip, .flip__in")) {
      e.style.setProperty("perspective", "none");
      e.style.setProperty("transform", "none");
      e.style.setProperty("transform-style", "flat");
      e.style.setProperty("transition", "none");
    }
  }
}

/** Interactive controls that mean nothing in an image: drop them, keeping the active choice as text. */
function simplify(clone: HTMLElement): void {
  // Tabbed chart block: only the active view travels, and the tab's name becomes the block's title.
  const title = tabTitle(clone);
  if (title) {
    clone.querySelectorAll('[role="tabpanel"][hidden], [data-ctl][hidden], [data-desc][hidden]').forEach((e) => e.remove());
    const tablist = clone.querySelector('[role="tablist"]');
    if (tablist) tablist.replaceWith(Object.assign(document.createElement("h2"), { textContent: title }));
  }
  clone.querySelectorAll(".grp__rm, .flip-btn, button.icon-btn, [data-flip], [data-toggle]").forEach((e) => e.remove());
  const text = (el: Element, t: string) => {
    if (!t) return el.remove();
    const span = Object.assign(document.createElement("span"), { className: "muted", textContent: t });
    el.replaceWith(span);
  };
  clone.querySelectorAll(".seg").forEach((seg) =>
    text(seg, [...seg.querySelectorAll("button")].filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.textContent?.trim()).join(" ")),
  );
  clone.querySelectorAll(".career__pick").forEach((pick) => {
    const sel = pick.querySelector("select");
    text(pick, sel ? (sel.options[sel.selectedIndex]?.textContent?.trim() ?? "") : "");
  });
}

/** A copy of the block inside copies of its ancestors (display: contents), so the selectors that depend on them still match. */
function wrapped(block: HTMLElement, main: Element): HTMLElement {
  const clone = block.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".xpick").forEach((e) => e.remove());
  flatten(clone);
  simplify(clone);
  clone.removeAttribute("aria-hidden");
  let node: HTMLElement = clone;
  for (let p = block.parentElement; p && p !== main; p = p.parentElement) {
    const w = p.cloneNode(false) as HTMLElement;
    w.removeAttribute("id");
    w.style.display = "contents";
    w.append(node);
    node = w;
  }
  return node;
}

/** Redraw the charts of the clone at its new width from the live chart's options. */
/** Pushes each chart into `made` as it is created, so the caller can dispose them even if a later one throws. */
function redrawCharts(source: HTMLElement[], stage: HTMLElement, made: echarts.ECharts[]): void {
  const SEL = "[data-chart], #g-radar";
  const originals = source.flatMap((b) => [...b.querySelectorAll<HTMLElement>(SEL)].filter((o) => !o.closest("[hidden]"))); // hidden views are not in the copy
  const copies = [...stage.querySelectorAll<HTMLElement>(SEL)];
  copies.forEach((copy, i) => {
    const live = originals[i] && echarts.getInstanceByDom(originals[i]);
    if (!live) return;
    const group = copy.id === "g-radar";
    const radar = copy.dataset.chart === "radar";
    let h = originals[i].clientHeight;
    if (group) h = 560; // proportioned for the 1200 px stage
    copy.replaceChildren();
    copy.removeAttribute("style");
    // cloneNode copies ECharts' instance id: without removing it, init() returns the live page chart and the copy stays empty.
    copy.removeAttribute("_echarts_instance_");
    copy.style.height = `${h}px`;
    const w = copy.clientWidth;
    const opt = live.getOption() as { radar?: { radius?: unknown }[] };
    // The duel radar's radius is in px (charts.ts radar()): recompute it for the new size; the group radar uses a percentage.
    if (radar && opt.radar?.[0]) opt.radar[0].radius = Math.max(60, Math.min(h / 2 - 34, w / 2 - 118));
    const chart = echarts.init(copy, undefined, { renderer: "svg", width: w, height: h });
    made.push(chart);
    chart.setOption({ ...opt, animation: false }, true);
  });
}

/** Photos come as data: URLs fetched with CORS (Commons answers Access-Control-Allow-Origin: *); any failure becomes the monogram. */
async function settleImages(stage: HTMLElement): Promise<void> {
  await Promise.all(
    [...stage.querySelectorAll<HTMLImageElement>("img")].map(async (img) => {
      try {
        img.loading = "eager";
        img.decoding = "sync";
        img.crossOrigin = "anonymous";
        const r = await fetch(img.currentSrc || img.src, { mode: "cors", referrerPolicy: "no-referrer" });
        if (!r.ok) throw new Error(String(r.status));
        const url = await toDataUrl(await r.blob());
        await new Promise<void>((res, rej) => {
          img.onload = () => res();
          img.onerror = () => rej(new Error("image failed"));
          img.src = url;
        });
        await img.decode();
        if (!img.naturalWidth) throw new Error("empty image");
      } catch {
        const box = img.closest(".portrait");
        const name = img.closest("[data-module]")?.getAttribute("aria-label") || img.closest(".panel")?.getAttribute("aria-label") || "";
        if (box) {
          const mono = Object.assign(document.createElement("div"), { className: "portrait" });
          mono.setAttribute("aria-hidden", "true");
          mono.innerHTML = `<span>${initials(name)}</span>`;
          box.replaceWith(mono);
        } else img.remove();
        stage.querySelectorAll(".credit").forEach((c) => {
          if (!c.parentElement?.querySelector(".portrait--photo")) c.remove();
        });
      }
    }),
  );
}

async function render(main: HTMLElement, chosen: HTMLElement[]): Promise<Blob> {
  const stage = document.createElement("div");
  stage.className = `xstage ${[...main.classList].filter((c) => c !== "wide").join(" ")}`;
  stage.setAttribute("aria-hidden", "true");
  const date = document.querySelector(".footer time")?.textContent?.trim() ?? "";
  const head = document.createElement("header");
  head.className = "xstage__head";
  const mark = document.querySelector(".brand__mark")?.outerHTML ?? "";
  head.innerHTML = `<p class="xstage__brand">${mark}ufc-fighter-compare</p>`;
  const h1 = document.createElement("h1");
  h1.className = "xstage__title";
  h1.textContent = main.querySelector("h1")?.textContent?.trim() || document.title.split(" · ")[0];
  head.append(h1);
  const foot = document.createElement("footer");
  foot.className = "xstage__foot";
  const p1 = document.createElement("span");
  p1.textContent = `ufc-fighter-compare · Data through ${date}`;
  const p2 = document.createElement("span");
  p2.textContent = location.href;
  foot.append(p1, p2);
  stage.append(head, ...chosen.map((b) => wrapped(b, main)), foot);
  document.body.append(stage);
  const charts: echarts.ECharts[] = [];
  try {
    await document.fonts.ready;
    redrawCharts(chosen, stage, charts);
    await settleImages(stage);
    const blob = await domToBlob(stage, {
      scale: 2,
      width: WIDTH,
      backgroundColor: GROUND,
      type: "image/png",
      font: { cssText: await fonts() },
      timeout: 15000,
    });
    if (!blob) throw new Error("empty image");
    return blob;
  } finally {
    charts.forEach((c) => c.dispose());
    stage.remove();
  }
}

async function deliver(blob: Blob, name: string): Promise<"shared" | "saved" | "cancelled"> {
  const file = new File([blob], name, { type: "image/png" });
  if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return "shared";
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return "cancelled";
      /* any other error: download instead */
    }
  }
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return "saved";
}

/** Enter the select mode, or leave it when it is already on. */
export function toggleSelect(trigger: HTMLElement): void {
  // While an image is being made the toggle does nothing: leaving would orphan the running export.
  if (active) {
    if (!active.busy()) active.cancel();
    return;
  }
  const main = document.querySelector<HTMLElement>("main");
  if (!main) return;
  const selected = new Set<string>();
  document.body.classList.add("is-selecting");
  trigger.setAttribute("aria-pressed", "true");

  const bar = document.createElement("div");
  bar.className = "xbar";
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", "Export selection");
  bar.innerHTML = `<p class="xbar__n" role="status" aria-live="polite"></p>
    <button type="button" class="xbar__go" disabled>Export</button>
    <button type="button" class="xbar__cancel">Cancel</button>`;
  document.body.append(bar);
  const status = bar.querySelector<HTMLElement>(".xbar__n")!;
  const go = bar.querySelector<HTMLButtonElement>(".xbar__go")!;
  const cancelBtn = bar.querySelector<HTMLButtonElement>(".xbar__cancel")!;
  let busy = false;

  const sync = () => {
    go.disabled = busy || selected.size === 0;
    cancelBtn.disabled = busy;
    if (!busy) status.textContent = selected.size ? `${selected.size} selected` : "Select the blocks to export";
  };

  const mark = () => {
    for (const p of blocks(main)) {
      if (p.querySelector(":scope > .xpick")) continue;
      const key = blockKey(p);
      const label = document.createElement("label");
      label.className = "xpick";
      const box = Object.assign(document.createElement("input"), { type: "checkbox", checked: selected.has(key) });
      const text = Object.assign(document.createElement("span"), { className: "sr", textContent: blockName(p) });
      label.append(box, text);
      p.prepend(label);
      p.classList.toggle("is-picked", box.checked);
      box.addEventListener("change", () => {
        if (box.checked) selected.add(key);
        else selected.delete(key);
        p.classList.toggle("is-picked", box.checked);
        sync();
      });
    }
    sync();
  };
  mark();
  // The views redraw their blocks (swap, new fighter, units): mark the new ones and keep the choice.
  let queued = 0;
  const watch = new MutationObserver(() => {
    if (busy || blocks(main).every((p) => p.querySelector(":scope > .xpick"))) return;
    cancelAnimationFrame(queued);
    queued = requestAnimationFrame(mark);
  });
  watch.observe(main, { childList: true, subtree: true });
  (document.querySelector<HTMLElement>(".xpick input") ?? cancelBtn).focus();

  let closed = false;
  const cancel = (restore = true) => {
    if (closed) return;
    closed = true;
    watch.disconnect();
    document.removeEventListener("keydown", onKey);
    document.querySelectorAll(".xpick").forEach((e) => e.remove());
    document.querySelectorAll(".is-picked").forEach((e) => e.classList.remove("is-picked"));
    bar.remove();
    document.body.classList.remove("is-selecting");
    trigger.removeAttribute("aria-pressed");
    if (active?.cancel === cancel) active = null;
    if (restore) trigger.focus();
  };
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === "Escape" && !busy && !document.querySelector("dialog[open]")) cancel();
  };
  document.addEventListener("keydown", onKey);
  cancelBtn.addEventListener("click", () => cancel());

  go.addEventListener("click", async () => {
    const chosen = blocks(main).filter((p) => selected.has(blockKey(p)));
    if (!chosen.length) return;
    busy = true;
    sync();
    status.textContent = "Exporting…";
    try {
      const blob = await render(main, chosen);
      const how = await deliver(blob, fileName(main));
      busy = false;
      if (how === "cancelled") {
        status.textContent = "Sharing cancelled";
        sync();
        return;
      }
      cancel();
      toast(how === "shared" ? "Image shared" : "Image saved");
    } catch {
      busy = false;
      sync();
      status.textContent = "The image could not be created. Try again.";
    }
  });
  active = { cancel, busy: () => busy };
}
