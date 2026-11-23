"""Rebuild data/raw/enrichment.parquet from the two Kaggle datasets (run by hand).

The snapshot keeps only what the pipeline needs: one row per fight and source with
date, both names, division, gender, decimal odds, nickname, date of birth, finish
round/time and the UFCStats fighter URLs (used to tell homonyms apart).

    python -m pipeline.refresh_enrichment
"""

from __future__ import annotations

import re
from pathlib import Path

import kagglehub
import pandas as pd
import pyarrow.parquet as pq

from pipeline.paths import ENRICHMENT
from pipeline.sources import american_to_decimal

JERZY = "jerzyszocik/ufc-fight-forecast-complete-gold-modeling-dataset"
MDABBERT = "mdabbert/ultimate-ufc-dataset"

COLUMNS = [
    "source",
    "date",
    "name_1",
    "name_2",
    "weight_class",
    "gender",
    "odds_1",
    "odds_2",
    "nickname_1",
    "nickname_2",
    "dob_1",
    "dob_2",
    "finish_round",
    "finish_time",
    "url_1",
    "url_2",
]


def _clean_text(value: object) -> object:
    if not isinstance(value, str):
        return None
    value = re.sub(r"\s+", " ", value).strip()
    return value or None


def load_jerzyszocik(folder: Path) -> pd.DataFrame:
    wanted = [
        "event_date",
        "f_1_name",
        "f_2_name",
        "weight_class",
        "gender",
        "f_1_odds_legacy",
        "f_2_odds_legacy",
        "f_1_fighter_nickname",
        "f_2_fighter_nickname",
        "f_1_fighter_dob",
        "f_2_fighter_dob",
        "finish_round",
        "finish_time",
        "f_1_url",
        "f_2_url",
    ]
    # ignore_metadata: the file stores a "dbdate" pandas dtype that pandas cannot rebuild.
    df = pq.read_table(folder / "full_data_silver_plus.parquet", columns=wanted).to_pandas(ignore_metadata=True)
    df.columns = [
        "date",
        "name_1",
        "name_2",
        "weight_class",
        "gender",
        "odds_1",
        "odds_2",
        "nickname_1",
        "nickname_2",
        "dob_1",
        "dob_2",
        "finish_round",
        "finish_time",
        "url_1",
        "url_2",
    ]
    df["source"] = "jerzyszocik"
    return df


def load_mdabbert(folder: Path) -> pd.DataFrame:
    raw = pd.read_csv(folder / "ufc-master.csv")
    df = pd.DataFrame(
        {
            "date": pd.to_datetime(raw["date"]).dt.date,
            "name_1": raw["R_fighter"],
            "name_2": raw["B_fighter"],
            "weight_class": raw["weight_class"],
            "gender": raw["gender"].map({"MALE": "M", "FEMALE": "F"}),
            "odds_1": raw["R_odds"].map(american_to_decimal),
            "odds_2": raw["B_odds"].map(american_to_decimal),
        }
    )
    df["source"] = "mdabbert"
    return df


def build_snapshot(jerzy_dir: Path, mdabbert_dir: Path) -> pd.DataFrame:
    df = pd.concat([load_jerzyszocik(jerzy_dir), load_mdabbert(mdabbert_dir)], ignore_index=True)
    for col in COLUMNS:
        if col not in df:
            df[col] = None
    df = df[COLUMNS]
    for col in ["name_1", "name_2", "weight_class", "nickname_1", "nickname_2", "finish_time"]:
        df[col] = df[col].map(_clean_text).astype("string")
    df["date"] = pd.to_datetime(df["date"])
    for col in ["dob_1", "dob_2"]:
        df[col] = pd.to_datetime(df[col])
    df["finish_round"] = df["finish_round"].astype("Int64")
    df = df.sort_values(["source", "date", "name_1", "name_2"], kind="stable").reset_index(drop=True)
    return df


def main() -> None:
    jerzy_dir = Path(kagglehub.dataset_download(JERZY))
    mdabbert_dir = Path(kagglehub.dataset_download(MDABBERT))
    snapshot = build_snapshot(jerzy_dir, mdabbert_dir)
    ENRICHMENT.parent.mkdir(parents=True, exist_ok=True)
    snapshot.to_parquet(ENRICHMENT, index=False)
    by_source = snapshot.groupby("source")["date"].agg(["count", "min", "max"])
    print(f"Wrote {ENRICHMENT} ({len(snapshot)} rows)\n{by_source}")


if __name__ == "__main__":
    main()
