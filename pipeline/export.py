"""Static JSON for the web: index.json, meta.json and fighters/<slug>.json."""

from __future__ import annotations

import json
import math
import shutil
from datetime import date
from pathlib import Path

import pandas as pd

from pipeline import metrics
from pipeline.data import CAREER_METRICS
from pipeline.sources import SOURCES
from pipeline.styles import SOURCE as STYLES_SOURCE

FIGHT_STATS = ["kd", "sig_landed", "sig_attempted", "td", "td_attempted", "sub_att"]


def clean(value):
    """JSON-safe scalar: NaN/NA -> None, numpy -> Python, dates -> ISO."""
    if value is None or value is pd.NA or value is pd.NaT:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    if isinstance(value, (pd.Timestamp, date)):
        return value.strftime("%Y-%m-%d")
    if hasattr(value, "item"):
        value = value.item()
        if isinstance(value, float) and math.isnan(value):
            return None
    if isinstance(value, float):
        return round(value, 4)
    return value


def _record_string(row: pd.Series, ufc: dict[str, int]) -> str:
    if pd.notna(row["wins"]):
        return f"{int(row['wins'])}-{int(row['losses'])}-{int(row['draws'])}"
    return f"{ufc['W']}-{ufc['L']}-{ufc['D']}"


def _pct_block(table: pd.DataFrame, idx) -> dict | None:
    if idx not in table.index:
        return None
    return {m: clean(table.at[idx, m]) for m in CAREER_METRICS}


def _fight_rows(fights: pd.DataFrame) -> list[dict]:
    rows = []
    ordered = fights.sort_values(["date", "fight_id"], ascending=[False, True], kind="stable")
    for f in ordered.to_dict("records"):
        rows.append(
            {
                "date": clean(f["date"]),
                "opponent": f["opponent"],
                "opponent_slug": f["opponent_slug"],
                "result": f["result"],
                "method": f["method"],
                "method_detail": clean(f["method_detail"]),
                "round": clean(f["round"]),
                "round_time_s": clean(f["round_time_s"]),
                "fight_time_s": clean(f["fight_time_s"]),
                "weight_class": clean(f["weight_class"]),
                "odds": clean(f["odds_decimal"]),
                "opp_odds": clean(f["opp_odds_decimal"]),
                "implied_prob_fair": clean(f["implied_prob_fair"]),
                "stats": {k: clean(f[k]) for k in FIGHT_STATS},
            }
        )
    return rows


def _own_pct(idx, division_pct: pd.DataFrame, global_pct: pd.DataFrame):
    """The fighter's percentiles: division when available, else all fighters, else None."""
    if idx in division_pct.index:
        return division_pct.loc[idx]
    return global_pct.loc[idx] if idx in global_pct.index else None


def build_payloads(
    fights: pd.DataFrame,
    fighters: pd.DataFrame,
    global_pct: pd.DataFrame,
    division_pct: pd.DataFrame,
) -> tuple[list[dict], dict, dict[str, dict]]:
    """Returns (index, meta, {slug: fighter payload}) without touching the disk."""
    by_fighter = dict(tuple(fights.groupby("fighter_slug", sort=False)))
    index, payloads = [], {}
    for idx, row in fighters.iterrows():
        slug = row["fighter_slug"]
        own = by_fighter[slug]
        ufc = metrics.ufc_record(own)
        index.append(
            {
                "slug": slug,
                "name": row["fighter"],
                "nickname": clean(row["nickname"]),
                "weight_class": clean(row["weight_class"]),
                "gender": clean(row["gender"]),
                "record": _record_string(row, ufc),
                "last_fight": clean(row["last_fight_date"]),
            }
        )
        payloads[slug] = {
            "slug": slug,
            "name": row["fighter"],
            "nickname": clean(row["nickname"]),
            "dob": clean(row["dob"]),
            "age": clean(row["age"]),
            "height_cm": clean(row["height_cm"]),
            "reach_cm": clean(row["reach_cm"]),
            "weight_lbs": clean(row["weight_lbs"]),
            "stance": clean(row["stance"]),
            "weight_class": clean(row["weight_class"]),
            "gender": clean(row["gender"]),
            "archetype": clean(row["archetype"]),
            "specialties": metrics.specialties(_own_pct(idx, division_pct, global_pct), own),
            "discipline": clean(row.get("discipline")),
            "record": metrics.career_record(row),
            "ufc_record": ufc,
            "ufc_fights": int(row["ufc_fights"]),
            "last_fight": clean(row["last_fight_date"]),
            "career": {m: clean(row[m]) for m in CAREER_METRICS},
            "percentiles": {
                "division": _pct_block(division_pct, idx),
                "global": _pct_block(global_pct, idx),
                "inverted": sorted(metrics.INVERTED),
            },
            "wins_by": metrics.method_breakdown(own, "W"),
            "losses_by": metrics.method_breakdown(own, "L"),
            "odds": metrics.roi(own),
            "duration": metrics.durations(own),
            "fights": _fight_rows(own),
        }
    index.sort(key=lambda r: r["slug"])
    meta = {
        "data_through": clean(fights["date"].max()),
        "sources": [*SOURCES, STYLES_SOURCE],
        "fights": int(fights["fight_id"].nunique()),
        "fighters": len(fighters),
    }
    return index, meta, payloads


def _dump(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n"


def write_payloads(out_dir: Path, index: list[dict], meta: dict, payloads: dict[str, dict]) -> None:
    fighters_dir = out_dir / "fighters"
    if fighters_dir.exists():
        shutil.rmtree(fighters_dir)
    fighters_dir.mkdir(parents=True)
    (out_dir / "index.json").write_text(_dump(index), encoding="utf-8")
    (out_dir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for slug, payload in payloads.items():
        (fighters_dir / f"{slug}.json").write_text(_dump(payload), encoding="utf-8")
