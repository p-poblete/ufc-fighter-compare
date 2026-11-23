"""Contract checks for the clean dataset and the web JSON (spec section 6.3)."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

import pandas as pd

COMPLEMENT = {"W": "L", "L": "W", "D": "D", "NC": "NC"}
PERCENT_COLUMNS = ["str_acc", "str_def", "td_acc", "td_def"]
VOLUME_TOLERANCE = 0.995
MIN_DATE = date(2010, 1, 1)


@dataclass
class Report:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors


def config_slugs(path: Path) -> list[str]:
    """Slugs referenced in web/src/config.ts (quoted kebab-case values of keys a/b/slug)."""
    if not path.exists():
        return []
    text = path.read_text(encoding="utf-8")
    return re.findall(r"""\b(?:a|b|slug)\s*:\s*["']([a-z0-9-]+)["']""", text)


def validate(
    fights: pd.DataFrame,
    fighters: pd.DataFrame,
    slugs: pd.DataFrame,
    frozen_slugs: pd.DataFrame | None,
    index: list[dict],
    payloads: dict[str, dict],
    previous_meta: dict | None,
    featured: list[str],
    today: date | None = None,
) -> Report:
    report = Report()
    err = report.errors.append
    today = today or date.today()

    # Unique keys.
    dup = fights.duplicated(["fight_id", "fighter_slug"]).sum()
    if dup:
        err(f"fights: {dup} duplicated (fight_id, fighter_slug)")
    if fighters["fighter_slug"].duplicated().any():
        err("fighters: duplicated fighter_slug")

    # Each fight twice with complementary results.
    per_fight = fights.groupby("fight_id")["result"].agg(list)
    bad = [fid for fid, res in per_fight.items() if len(res) != 2 or COMPLEMENT.get(res[0]) != res[1]]
    if bad:
        err(f"fights: {len(bad)} fights without exactly two complementary rows (e.g. {bad[:3]})")

    # Referential integrity.
    known = set(fighters["fighter_slug"])
    missing = (set(fights["fighter_slug"]) | set(fights["opponent_slug"])) - known
    if missing:
        err(f"fights reference {len(missing)} slugs missing from fighters (e.g. {sorted(missing)[:3]})")
    index_slugs = [r["slug"] for r in index]
    if len(index_slugs) != len(set(index_slugs)):
        err("index.json: duplicated slug")
    if set(index_slugs) != set(payloads):
        err("index.json and fighters/<slug>.json differ")
    if set(index_slugs) != known:
        err("index.json does not cover exactly the fighters table")
    for slug in featured:
        if slug not in known:
            err(f"config.ts: featured slug '{slug}' not in index.json")

    # Frozen slugs never change.
    if frozen_slugs is not None and len(frozen_slugs):
        merged = frozen_slugs.merge(slugs, on="fighter_key", how="left", suffixes=("_old", "_new"))
        changed = merged[merged["slug_old"] != merged["slug_new"]]
        if len(changed):
            err(f"slugs.csv: {len(changed)} frozen assignments changed (e.g. {changed['fighter_key'].iloc[0]})")
    if slugs["slug"].duplicated().any():
        err("slugs.csv: one slug assigned to two fighters")

    # Ranges.
    dates = pd.to_datetime(fights["date"]).dt.date
    if (dates < MIN_DATE).any() or (dates > today).any():
        err("fights: dates outside 2010-01-01..today")
    for col in PERCENT_COLUMNS:
        values = fighters[col].dropna()
        if ((values < 0) | (values > 100)).any():
            err(f"fighters.{col}: values outside [0, 100]")
    prob = fights["implied_prob_fair"].dropna()
    if ((prob < 0) | (prob > 1)).any():
        err("fights.implied_prob_fair outside [0, 1]")
    for col in ["odds_decimal", "opp_odds_decimal"]:
        if (fights[col].dropna() <= 1).any():
            err(f"fights.{col}: values <= 1")

    # Volume against the versioned meta.json.
    if previous_meta and previous_meta.get("fights"):
        before, now = previous_meta["fights"], fights["fight_id"].nunique()
        if now < before * VOLUME_TOLERANCE:
            err(f"volume: {now} fights < 99.5% of previous {before}")
        elif now < before:
            report.warnings.append(f"volume: {now} fights, previously {before}")
    return report
