// Viewer settings shared by every page: units and percentile base. Kept in localStorage when allowed.
export type Units = "metric" | "imperial";
export type Base = "auto" | "division" | "global";
export interface Settings {
  units: Units;
  base: Base;
}

const KEY = "fc-settings";
const DEFAULTS: Settings = { units: "metric", base: "auto" };
let current: Settings = { ...DEFAULTS };

export function loadSettings(): Settings {
  try {
    current = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    current = { ...DEFAULTS };
  }
  return current;
}
export const settings = (): Settings => current;
export function setSetting<K extends keyof Settings>(k: K, v: Settings[K]): void {
  current = { ...current, [k]: v };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* private mode: the setting lasts for this page only */
  }
  document.dispatchEvent(new CustomEvent("settings:change", { detail: current }));
}
