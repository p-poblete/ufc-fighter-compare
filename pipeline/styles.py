"""Listed fighting style (base discipline) from UFC.com athlete profiles, via TidyTuesday 2026-07-07 ({fightr}).

The snapshot data/raw/ufc_styles.csv is versioned; `python -m pipeline.styles` refreshes it. Generic labels
(MMA, Freestyle, Striker, Grappler, Brawler) are dropped: only real base disciplines are kept.
"""

from __future__ import annotations

import csv
import io
import urllib.request

import pandas as pd

from pipeline.data import normalize_name
from pipeline.paths import ROOT

URL = "https://raw.githubusercontent.com/rfordatascience/tidytuesday/main/data/2026/2026-07-07/ufc_athletes.csv"
SNAPSHOT = ROOT / "data" / "raw" / "ufc_styles.csv"
SOURCE = {
    "name": "TidyTuesday 2026-07-07 / {fightr} (UFC.com athlete profiles)",
    "url": "https://github.com/rfordatascience/tidytuesday/tree/main/data/2026/2026-07-07",
    "license": "not stated; credited",
    "provides": "listed fighting style (base discipline), where available",
}
DISCIPLINES = {
    "brazilian jiu-jitsu": "BJJ",
    "jiu-jitsu": "BJJ",
    "wrestling": "Wrestling",
    "wrestler": "Wrestling",
    "muay thai": "Muay Thai",
    "kickboxer": "Kickboxing",
    "kickboxing": "Kickboxing",
    "boxing": "Boxing",
    "boxer": "Boxing",
    "karate": "Karate",
    "judo": "Judo",
    "sambo": "Sambo",
    "kung fu": "Kung Fu",
    "kung-fu": "Kung Fu",
    "taekwondo": "Taekwondo",
}


def discipline(label: str | None) -> str | None:
    if not label:
        return None
    return DISCIPLINES.get(label.strip().lower())


def refresh() -> int:
    raw = urllib.request.urlopen(URL, timeout=60).read().decode("utf-8")
    rows = [(r["name"], discipline(r["fighting_style"])) for r in csv.DictReader(io.StringIO(raw))]
    rows = sorted({(n, d) for n, d in rows if n and d})
    SNAPSHOT.parent.mkdir(parents=True, exist_ok=True)
    with SNAPSHOT.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["name", "discipline"])
        w.writerows(rows)
    return len(rows)


def add_disciplines(fighters: pd.DataFrame) -> pd.DataFrame:
    """Joins the snapshot on the normalized name; names listed twice with different styles are left empty."""
    fighters = fighters.copy()
    if not SNAPSHOT.exists():
        fighters["discipline"] = pd.Series(pd.NA, index=fighters.index, dtype="string")
        return fighters
    snap = pd.read_csv(SNAPSHOT, dtype="string")
    snap["key"] = snap["name"].map(normalize_name)
    unique = snap.groupby("key")["discipline"].agg(lambda s: s.iloc[0] if s.nunique() == 1 else pd.NA)
    fighters["discipline"] = fighters["fighter"].map(normalize_name).map(unique).astype("string")
    return fighters


if __name__ == "__main__":
    print(f"{refresh()} fighters with a listed discipline -> {SNAPSHOT}")
