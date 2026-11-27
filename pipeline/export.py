"""Static JSON for the web: index.json, meta.json and fighters/<slug>.json."""

from __future__ import annotations

import json
import math
from datetime import date
from pathlib import Path

import pandas as pd

from pipeline import metrics, photos
from pipeline.data import CAREER_METRICS
from pipeline.paths import CHAMPIONS
from pipeline.photos import SOURCE as PHOTOS_SOURCE
from pipeline.sources import SOURCES
from pipeline.styles import SOURCE as STYLES_SOURCE

FIGHT_STATS = [
    "kd",
    "kd_against",
    "sig_landed",
    "sig_attempted",
    "sig_absorbed",
    "str_landed",
    "str_attempted",
    "str_absorbed",
    "td",
    "td_attempted",
    "taken_down",
    "sub_att",
    "clinch",
    "clinch_taken",
    "ground",
    "ground_taken",
]


def load_champions(path: Path) -> pd.DataFrame:
    """data/raw/champions.csv (division, slug, interim, since); empty frame when missing."""
    cols = ["division", "slug", "interim", "since"]
    if not path.exists():
        return pd.DataFrame(columns=cols)
    return pd.read_csv(path, dtype=str, keep_default_na=False)[cols]


def is_interim(value: str) -> bool | None:
    """Strict boolean from the CSV text; None when it is neither true nor false."""
    return {"true": True, "false": False}.get(str(value).strip().lower())


def belts_for(slug: str, own: pd.DataFrame, champions: pd.DataFrame) -> list[dict]:
    """Rule 7a: belts from the CSV, plus a former belt per division with a title win and no current belt."""
    current = {}
    for r in champions[champions["slug"] == slug].itertuples():
        current[r.division] = "interim" if is_interim(r.interim) else "champion"
    won = own[own["title_bout"] & (own["result"] == "W")]
    for division in sorted({d for d in won["weight_class"].dropna()}):
        current.setdefault(division, "former")
    order = {"champion": 0, "interim": 1, "former": 2}
    return [{"division": d, "kind": k} for d, k in sorted(current.items(), key=lambda kv: (order[kv[1]], kv[0]))]


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
                "title": bool(f["title_bout"]),
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
    champions: pd.DataFrame | None = None,
) -> tuple[list[dict], dict, dict[str, dict]]:
    """Returns (index, meta, {slug: fighter payload}) without touching the disk."""
    by_fighter = dict(tuple(fights.groupby("fighter_slug", sort=False)))
    index, payloads = [], {}
    pictures = photos.load()
    champions = load_champions(CHAMPIONS) if champions is None else champions
    for idx, row in fighters.iterrows():
        slug = row["fighter_slug"]
        own = by_fighter[slug]
        ufc = metrics.ufc_record(own)
        belts = belts_for(slug, own, champions)
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
            "belts": belts,
            "photo": pictures.get(slug),
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
        "sources": [*SOURCES, STYLES_SOURCE, PHOTOS_SOURCE],
        "fights": int(fights["fight_id"].nunique()),
        "fighters": len(fighters),
    }
    return index, meta, payloads


def _mean_percentile(pct: dict | None) -> float | None:
    """Composite index: mean of the 8 stored percentiles (SApM is already stored as 100 - p, as in the radar)."""
    if not pct:
        return None
    return round(sum(pct[m] for m in CAREER_METRICS) / len(CAREER_METRICS), 1)


def build_directory(index: list[dict], payloads: dict[str, dict]) -> list[dict]:
    """Carousel directory (spec 11.1 row 4): one short-key object per index.json entry, same order. Nulls omitted.

    s slug, n name, g gender, d division, r record (as index.json), a archetype, sp specialties, di discipline,
    p photo {u, w, h, a author, l license, lu license url, pg Commons page}, belts [{division, kind}],
    sl SLpM, td TDAvg, fr finish % (KO/TKO+SUB of UFC wins),
    ix composite index, nf UFC fights, lf last fight, rf last 5 UFC fights newest first [result, date, opponent,
    method], w UFC wins since 2010, wp UFC win % since 2010 (wins / (W+L+D); NC excluded).
    """
    out = []
    for entry in index:
        f = payloads[entry["slug"]]
        pct = f["percentiles"]
        own = (pct["division"] or pct["global"]) if pct else None
        wins, rec = f["ufc_record"]["W"], f["ufc_record"]
        decided = wins + rec["L"] + rec["D"]
        career = f["career"] or {}
        photo = f["photo"]
        finishes = f["wins_by"]["KO/TKO"] + f["wins_by"]["SUB"]
        row = {
            "s": entry["slug"],
            "n": entry["name"],
            "g": entry["gender"],
            "d": entry["weight_class"],
            "r": entry["record"],
            "a": f["archetype"],
            "sp": f["specialties"] or None,
            "di": f["discipline"],
            "p": {
                "u": photo["url"],
                "w": photo["width"],
                "h": photo["height"],
                "a": photo["author"],
                "l": photo["license"],
                "lu": photo["license_url"],
                "pg": photo["page"],
            }
            if photo
            else None,
            "belts": f["belts"],
            "sl": clean(career.get("slpm")),
            "td": clean(career.get("td_avg")),
            "fr": round(finishes / wins * 100, 1) if wins else None,
            "ix": _mean_percentile(own),
            "nf": f["ufc_fights"],
            "lf": f["last_fight"],
            "rf": [[x["result"], x["date"], x["opponent"], x["method"]] for x in f["fights"][:5]],
            "w": wins,
            "wp": round(wins / decided * 100, 1) if decided else None,
        }
        out.append({k: v for k, v in row.items() if v is not None})
    return out


def _dump(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n"


def _write_if_changed(path: Path, text: str) -> None:
    if not path.exists() or path.read_text(encoding="utf-8") != text:
        path.write_text(text, encoding="utf-8")


def write_payloads(
    out_dir: Path, index: list[dict], meta: dict, payloads: dict[str, dict], directory: list[dict] | None = None
) -> None:
    # Update in place: deleting and recreating the whole folder makes the dev server's watcher lose
    # some files (404 until restart). Only changed files are rewritten and stale ones removed.
    fighters_dir = out_dir / "fighters"
    fighters_dir.mkdir(parents=True, exist_ok=True)
    _write_if_changed(out_dir / "index.json", _dump(index))
    if directory is not None:
        _write_if_changed(out_dir / "directory.json", _dump(directory))
    _write_if_changed(out_dir / "meta.json", json.dumps(meta, ensure_ascii=False, indent=2) + "\n")
    for slug, payload in payloads.items():
        _write_if_changed(fighters_dir / f"{slug}.json", _dump(payload))
    keep = {f"{slug}.json" for slug in payloads}
    for stale in fighters_dir.glob("*.json"):
        if stale.name not in keep:
            stale.unlink()
