"""Build the clean dataset and the web JSON.

python -m pipeline.build            # downloads UFC-Almanac
python -m pipeline.build --offline  # reuses data/raw/cache/*.csv if present
"""

from __future__ import annotations

import argparse
import json
import sys

import pandas as pd

from pipeline import data, export, metrics, validate
from pipeline.paths import ALIASES, PROCESSED, WEB_CONFIG, WEB_DATA
from pipeline.sources import load_almanac, load_enrichment
from pipeline.styles import add_disciplines


def _read_json(path):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--offline", action="store_true", help="reuse cached Almanac CSVs")
    args = parser.parse_args(argv)

    slugs_path = PROCESSED / "slugs.csv"
    frozen = pd.read_csv(slugs_path) if slugs_path.exists() else None
    previous_meta = _read_json(WEB_DATA / "meta.json")

    clean = data.build_tables(load_almanac(offline=args.offline), load_enrichment(), frozen, data.load_aliases(ALIASES))
    global_pct, division_pct = metrics.compute_percentiles(clean.fighters)
    fighters = add_disciplines(metrics.add_archetypes(clean.fighters, global_pct, division_pct))
    index, meta, payloads = export.build_payloads(clean.fights, fighters, global_pct, division_pct)

    report = validate.validate(
        clean.fights,
        fighters,
        clean.slugs,
        frozen,
        index,
        payloads,
        previous_meta,
        validate.config_slugs(WEB_CONFIG),
    )
    for warning in report.warnings:
        print(f"WARNING {warning}")
    if not report.ok:
        for error in report.errors:
            print(f"ERROR {error}", file=sys.stderr)
        print("Validation failed: nothing written.", file=sys.stderr)
        return 1

    PROCESSED.mkdir(parents=True, exist_ok=True)
    clean.fights.to_parquet(PROCESSED / "fights.parquet", index=False)
    fighters.to_parquet(PROCESSED / "fighters.parquet", index=False)
    clean.slugs.to_csv(slugs_path, index=False)
    clean.unmatched.to_csv(PROCESSED / "unmatched.csv", index=False, date_format="%Y-%m-%d")
    export.write_payloads(WEB_DATA, index, meta, payloads)
    print(
        f"OK: {meta['fights']} fights, {meta['fighters']} fighters, data through {meta['data_through']}; "
        f"{len(clean.unmatched)} rows in unmatched.csv"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
