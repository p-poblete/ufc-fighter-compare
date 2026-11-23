"""Repository paths used across the pipeline."""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
RAW = DATA / "raw"
CACHE = RAW / "cache"
PROCESSED = DATA / "processed"
ENRICHMENT = RAW / "enrichment.parquet"
WEB_DATA = ROOT / "web" / "public" / "data"
WEB_CONFIG = ROOT / "web" / "src" / "config.ts"
ALIASES = ROOT / "pipeline" / "aliases.csv"
