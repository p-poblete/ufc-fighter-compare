"""Raw sources: UFC-Almanac (downloaded each build) and the versioned enrichment snapshot."""

from __future__ import annotations

import urllib.request
from dataclasses import dataclass

import pandas as pd

from pipeline.paths import CACHE, ENRICHMENT

ALMANAC_URL = "https://raw.githubusercontent.com/Sam-Armstrong/UFC-Almanac/main/data/{name}.csv"
ALMANAC_FILES = ("FightResults", "FightStats", "FighterData")

SOURCES = [
    {
        "name": "UFC-Almanac",
        "url": "https://github.com/Sam-Armstrong/UFC-Almanac",
        "license": "MIT",
        "provides": "fights, per-fight stats and career profiles (UFCStats)",
    },
    {
        "name": "UFC Data: Stats & Rankings & Betting Odds (jerzyszocik)",
        "url": "https://www.kaggle.com/datasets/jerzyszocik/ufc-fight-forecast-complete-gold-modeling-dataset",
        "license": "CC0 1.0",
        "provides": "division, gender, odds, nickname, date of birth",
    },
    {
        "name": "Ultimate UFC Dataset (mdabbert)",
        "url": "https://www.kaggle.com/datasets/mdabbert/ultimate-ufc-dataset",
        "license": "CC BY 4.0",
        "provides": "fallback odds",
    },
]


@dataclass
class Almanac:
    results: pd.DataFrame
    stats: pd.DataFrame
    fighters: pd.DataFrame


def american_to_decimal(odds: float | None) -> float | None:
    """American odds -> decimal odds. +150 -> 2.5, -200 -> 1.5."""
    if odds is None or pd.isna(odds) or odds == 0:
        return None
    return 1 + odds / 100 if odds > 0 else 1 + 100 / abs(odds)


def download_almanac(offline: bool = False) -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    for name in ALMANAC_FILES:
        target = CACHE / f"{name}.csv"
        if offline and target.exists():
            continue
        with urllib.request.urlopen(ALMANAC_URL.format(name=name), timeout=60) as response:
            target.write_bytes(response.read())


def load_almanac(offline: bool = False) -> Almanac:
    download_almanac(offline=offline)
    results = pd.read_csv(CACHE / "FightResults.csv")
    stats = pd.read_csv(CACHE / "FightStats.csv")
    fighters = pd.read_csv(CACHE / "FighterData.csv", index_col=0)
    for frame in (results, stats):
        frame["Date"] = pd.to_datetime(frame["Date"], format="%d/%m/%Y")
    return Almanac(results=results, stats=stats, fighters=fighters)


def load_enrichment() -> pd.DataFrame:
    return pd.read_parquet(ENRICHMENT)
