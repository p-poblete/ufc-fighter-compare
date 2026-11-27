/** Keeps each identity badge row on one line: shows as many specialty icons as fit and folds the rest
 *  into the "+N" badge (whose tooltip lists only the folded ones). A lone leftover shows in place of "+1". */
export function fitBadges(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>(".badges").forEach(fitRow);
}

function fitRow(row: HTMLElement): void {
  const specs = [...row.querySelectorAll<HTMLElement>("[data-spec]")];
  const more = row.querySelector<HTMLElement>("[data-more]");
  if (!specs.length || !more || !row.clientWidth) return;
  const tips = [...more.querySelectorAll<HTMLElement>("[data-spec-tip]")];
  const show = (n: number) => {
    specs.forEach((el, i) => (el.hidden = i >= n));
    tips.forEach((el, i) => (el.hidden = i < n));
    const rest = specs.length - n;
    more.hidden = rest === 0;
    more.firstChild!.textContent = `+${rest}`;
    more.setAttribute("aria-label", `More specialties: ${specs.slice(n).map((el) => el.getAttribute("aria-label")?.split(":")[0]).join(", ")}`);
  };
  // Measure the children's extent, not scrollWidth: corner B aligns right, so it overflows to the left,
  // which scrollWidth does not count.
  const fits = () => {
    const kids = [...row.children].filter((el) => !(el as HTMLElement).hidden);
    if (!kids.length) return true;
    const box = row.getBoundingClientRect();
    const first = kids[0].getBoundingClientRect(), last = kids[kids.length - 1].getBoundingClientRect();
    return Math.min(first.left, last.left) >= box.left - 1 && Math.max(first.right, last.right) <= box.right + 1;
  };
  show(specs.length);
  if (fits()) return;
  // Fold from the end; n = specs.length - 1 would read "+1", so the first fold already hides two.
  for (let n = specs.length - 2; n >= 0; n--) {
    show(n);
    if (fits()) return;
  }
}
