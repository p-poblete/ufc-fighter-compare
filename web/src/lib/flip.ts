// corner.identity flip (spec 11.1 #8): a button turns the block over; only the visible face is interactive.
const OPEN = "is-flipped";

function set(block: HTMLElement, flipped: boolean, focus = false): void {
  const btn = block.querySelector<HTMLButtonElement>("[data-flip]");
  block.classList.toggle(OPEN, flipped);
  btn?.setAttribute("aria-pressed", String(flipped));
  block.querySelector<HTMLElement>('[data-face="front"]')?.toggleAttribute("inert", flipped);
  block.querySelector<HTMLElement>('[data-face="back"]')?.toggleAttribute("inert", !flipped);
  if (focus) btn?.focus();
}

let ready = false;
/** Delegated, so blocks that the comparison re-renders keep working. Safe to call more than once. */
export function initFlip(): void {
  if (ready) return;
  ready = true;
  document.addEventListener("click", (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>("[data-flip]");
    const block = btn?.closest<HTMLElement>('[data-module="corner.identity"]');
    if (btn && block) set(block, !block.classList.contains(OPEN), true);
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") return;
    const block = (ev.target as HTMLElement).closest<HTMLElement>(`[data-module="corner.identity"].${OPEN}`);
    if (!block) return;
    ev.preventDefault();
    set(block, false, true);
  });
}
