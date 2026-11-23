// fight.dialog: any [data-fight] row opens one fight's details, seen from both sides.
import { loadFighter } from "./data";
import { fightDetail } from "./render";

export function setupFightDialog(): void {
  const dlg = document.createElement("dialog");
  dlg.className = "dlg";
  dlg.setAttribute("aria-labelledby", "dlg-title");
  document.body.append(dlg);

  dlg.addEventListener("click", (ev) => {
    const t = ev.target as HTMLElement;
    if (t === dlg || t.closest("[data-close]")) dlg.close(); // backdrop or close button
  });

  document.addEventListener("click", (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLElement>("[data-fight]");
    if (btn) void open(btn.dataset.slug!, Number(btn.dataset.fight), btn.dataset.tone ?? "solo");
  });
  // Chart points ask for the same dialog.
  document.addEventListener("fight:open", (ev) => {
    const d = (ev as CustomEvent<{ slug: string; i: number; tone?: string }>).detail;
    void open(d.slug, d.i, d.tone ?? "solo");
  });

  async function open(slug: string, i: number, tone: string) {
    const f = await loadFighter(slug);
    const x = f.fights[i];
    if (!x) return;
    let opp = null;
    try {
      const o = await loadFighter(x.opponent_slug);
      opp = o.fights.find((y) => y.date === x.date && y.opponent_slug === f.slug) ?? null;
    } catch {
      /* the opponent's side stays as dashes */
    }
    dlg.dataset.tone = tone;
    dlg.innerHTML = fightDetail(f, x, opp);
    dlg.showModal();
    dlg.querySelector<HTMLElement>("[data-close]")?.focus();
  }
}
