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

  document.addEventListener("click", async (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLElement>("[data-fight]");
    if (!btn) return;
    const f = await loadFighter(btn.dataset.slug!);
    const x = f.fights[Number(btn.dataset.fight)];
    if (!x) return;
    let opp = null;
    try {
      const o = await loadFighter(x.opponent_slug);
      opp = o.fights.find((y) => y.date === x.date && y.opponent_slug === f.slug) ?? null;
    } catch {
      /* the opponent's side stays as dashes */
    }
    dlg.dataset.tone = btn.dataset.tone ?? "solo";
    dlg.innerHTML = fightDetail(f, x, opp);
    dlg.showModal();
    dlg.querySelector<HTMLElement>("[data-close]")?.focus();
  });
}
