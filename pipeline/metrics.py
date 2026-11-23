"""Fighter metrics: record, win/loss methods, odds, ROI, durations, percentiles and archetype.

Ported from ufc-fight-analytics/src/app.py (calcular_retorno, get_tipo_apuesta,
get_historial_*, generar_donas_*, generar_chart_record_barras); the fixed-threshold
archetype is replaced by percentiles.
"""

from __future__ import annotations

import itertools
import math

import pandas as pd

from pipeline.data import CAREER_METRICS, DIVISIONS

STAKE = 100
METHODS = ["KO/TKO", "SUB", "DEC", "OTHER"]
ODDS_TYPES = [  # half-open intervals [low, high) on decimal odds
    ("Heavy favorite", 1.0, 1.5),
    ("Favorite", 1.5, 2.0),
    ("Pick'em", 2.0, 2.5),
    ("Underdog", 2.5, 4.0),
    ("Heavy underdog", 4.0, math.inf),
]
SMALL_SAMPLE = 5
MIN_FIGHTS_FOR_PERCENTILE = 3
INVERTED = {"sapm"}  # lower is better: stored as 100 - percentile
DURATION_BINS = [0, 5, 10, 15, 20, 25]  # minutes


# --- record and methods --------------------------------------------------------------------


def ufc_record(fights: pd.DataFrame) -> dict[str, int]:
    counts = fights["result"].value_counts()
    return {k: int(counts.get(k, 0)) for k in ["W", "L", "D", "NC"]}


def career_record(fighter: pd.Series) -> dict[str, int | None]:
    return {k: (None if pd.isna(fighter[k]) else int(fighter[k])) for k in ["wins", "losses", "draws"]}


def method_breakdown(fights: pd.DataFrame, result: str) -> dict[str, int]:
    """How a fighter won (result='W') or lost (result='L'): counts per grouped method."""
    counts = fights.loc[fights["result"] == result, "method"].value_counts()
    return {m: int(counts.get(m, 0)) for m in METHODS}


# --- odds and ROI ---------------------------------------------------------------------------


def bet_return(result: str, odds: float | None, stake: float = STAKE) -> float | None:
    """Return of a fixed bet on the fighter: profit if W, -stake if L, 0 if D/NC."""
    if odds is None or pd.isna(odds):
        return None
    if result == "W":
        return stake * (odds - 1)
    if result == "L":
        return -stake
    return 0.0


def odds_type(odds: float | None) -> str | None:
    if odds is None or pd.isna(odds) or odds <= 1:
        return None
    for name, low, high in ODDS_TYPES:
        if low <= odds < high:
            return name
    return None


def implied_prob_fair(odds: float | None, opp_odds: float | None) -> float | None:
    """Implied win probability with the bookmaker margin removed."""
    if odds is None or opp_odds is None or pd.isna(odds) or pd.isna(opp_odds):
        return None
    inv, opp_inv = 1 / odds, 1 / opp_odds
    return inv / (inv + opp_inv)


def _roi_block(rows: pd.DataFrame) -> dict:
    n = len(rows)
    if n == 0:
        return {"n": 0, "profit": None, "roi_pct": None, "small_sample": False, "no_data": True}
    profit = float(sum(bet_return(r, o) for r, o in zip(rows["result"], rows["odds_decimal"])))
    return {
        "n": n,
        "profit": round(profit, 2),
        "roi_pct": round(profit / (STAKE * n) * 100, 2),
        "small_sample": n < SMALL_SAMPLE,
        "no_data": False,
    }


def roi(fights: pd.DataFrame) -> dict:
    """ROI of betting STAKE on the fighter in every fight with odds, total and per odds type."""
    with_odds = fights[fights["odds_decimal"].notna()]
    total = _roi_block(with_odds)
    total["coverage"] = round(len(with_odds) / len(fights), 4) if len(fights) else None
    types = with_odds["odds_decimal"].map(odds_type)
    by_type = {name: _roi_block(with_odds[types == name]) for name, _, _ in ODDS_TYPES}
    fair = fights[fights["implied_prob_fair"].notna() & fights["result"].isin(["W", "L"])]
    expected = {
        "n": len(fair),
        "expected_wins": round(float(fair["implied_prob_fair"].sum()), 2) if len(fair) else None,
        "actual_wins": int((fair["result"] == "W").sum()) if len(fair) else None,
    }
    return {"stake": STAKE, "total": total, "by_type": by_type, "expected_vs_actual": expected}


# --- durations ------------------------------------------------------------------------------


def durations(fights: pd.DataFrame) -> dict:
    timed = fights[fights["fight_time_s"].notna()]
    minutes = timed["fight_time_s"].astype(float) / 60
    bins = [  # (low, high] minutes, i.e. one bin per 5-minute round
        {"from": low, "to": high, "count": int(((minutes > low) & (minutes <= high)).sum())}
        for low, high in itertools.pairwise(DURATION_BINS)
    ]
    decided = fights[fights["result"].isin(["W", "L", "D"])]
    to_decision = int((decided["method"] == "DEC").sum())
    return {
        "n": len(timed),
        "avg_minutes": round(float(minutes.mean()), 2) if len(timed) else None,
        "bins": bins,
        "decision_pct": round(to_decision / len(decided) * 100, 1) if len(decided) else None,
    }


# --- percentiles and archetype ---------------------------------------------------------------


def percentile_rank(values: pd.Series) -> pd.Series:
    """Mid-rank percentile (0-100): share below plus half the ties."""
    n = len(values)
    if n == 0:
        return values.astype(float)
    below = values.rank(method="min") - 1
    ties = values.rank(method="max") - values.rank(method="min") + 1
    return ((below + 0.5 * ties) / n * 100).round(1)


def percentile_population(fighters: pd.DataFrame) -> pd.DataFrame:
    has_metrics = fighters[CAREER_METRICS].notna().all(axis=1)
    return fighters[has_metrics & (fighters["ufc_fights"] >= MIN_FIGHTS_FOR_PERCENTILE)]


def _percentiles(pop: pd.DataFrame) -> pd.DataFrame:
    out = pd.DataFrame(index=pop.index)
    for metric in CAREER_METRICS:
        pct = percentile_rank(pop[metric].astype(float))
        out[metric] = (100 - pct).round(1) if metric in INVERTED else pct
    return out


def compute_percentiles(fighters: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """(global, division) percentile tables indexed like `fighters`; rows outside the population absent."""
    pop = percentile_population(fighters)
    global_pct = _percentiles(pop)
    parts = [_percentiles(group) for div, group in pop.groupby("weight_class") if div in DIVISIONS]
    division_pct = pd.concat(parts) if parts else pd.DataFrame(columns=CAREER_METRICS)
    return global_pct, division_pct


def archetype(pct: dict | pd.Series | None) -> str | None:
    """Striker / Grappler / Balanced from SLpM and TDAvg percentiles."""
    if pct is None:
        return None
    slpm, td = pct["slpm"], pct["td_avg"]
    if slpm is None or td is None or pd.isna(slpm) or pd.isna(td):
        return None
    if slpm >= 70 and td < 70:
        return "Striker"
    if td >= 70 and slpm < 70:
        return "Grappler"
    return "Balanced"


def add_archetypes(fighters: pd.DataFrame, global_pct: pd.DataFrame, division_pct: pd.DataFrame) -> pd.DataFrame:
    fighters = fighters.copy()
    labels = []
    for idx in fighters.index:
        table = division_pct if idx in division_pct.index else global_pct
        labels.append(archetype(table.loc[idx]) if idx in table.index else None)
    fighters["archetype"] = pd.Series(labels, index=fighters.index, dtype="string")
    return fighters
