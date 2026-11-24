"""Fighter photos from Wikimedia Commons, found through Wikidata (image P18).

The snapshot data/raw/photos.csv is versioned; `python -m pipeline.photos` refreshes it (needs
data/processed/fighters.parquet from a previous build). Matching, in order of trust:

1. Wikidata "UFC athlete ID" (P9722) equal to our slug.
2. The normalized English label equal to the fighter's name, only when the item has a Sherdog ID
   (it is an MMA fighter), the label is unique on Wikidata, the name is unique in our data and the
   item carries no different UFC athlete ID.

The web hotlinks the Commons thumbnail and credits author and licence next to it.
"""

from __future__ import annotations

import csv
import html
import json
import re
import urllib.parse
import urllib.request

import pandas as pd

from pipeline.data import normalize_name
from pipeline.paths import PROCESSED, ROOT

SNAPSHOT = ROOT / "data" / "raw" / "photos.csv"
WIDTH = 480
AGENT = "ufc-fighter-compare/0.6 (https://github.com/p-poblete/ufc-fighter-compare)"
SPARQL = "https://query.wikidata.org/sparql"
COMMONS = "https://commons.wikimedia.org/w/api.php"
SOURCE = {
    "name": "Wikimedia Commons via Wikidata",
    "url": "https://commons.wikimedia.org/",
    "license": "per image (credited on the page)",
    "provides": "fighter photos, where available",
}
COLUMNS = ["slug", "file", "thumb", "width", "height", "author", "license", "license_url", "page"]

Q_BY_ID = "SELECT ?item ?ufc ?img WHERE { ?item wdt:P9722 ?ufc; wdt:P18 ?img. }"
Q_BY_NAME = (
    "SELECT ?item ?label ?img ?ufc WHERE { ?item wdt:P2818 ?sherdog; wdt:P18 ?img. "
    'OPTIONAL { ?item wdt:P9722 ?ufc } ?item rdfs:label ?label FILTER(LANG(?label) = "en") }'
)


def _get(url: str, params: dict) -> dict:
    req = urllib.request.Request(f"{url}?{urllib.parse.urlencode(params)}", headers={"User-Agent": AGENT})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.load(resp)


def _sparql(query: str) -> list[dict]:
    rows = _get(SPARQL, {"query": query, "format": "json"})["results"]["bindings"]
    return [{k: v["value"] for k, v in r.items()} for r in rows]


def _file_name(commons_url: str) -> str:
    return urllib.parse.unquote(commons_url.rsplit("/", 1)[-1]).replace("_", " ")


def match(fighters: pd.DataFrame, by_id: list[dict], by_name: list[dict]) -> dict[str, str]:
    """{slug: Commons file name}. Pure: takes the SPARQL rows, no network."""
    slugs = set(fighters["fighter_slug"])
    found: dict[str, str] = {}
    for r in sorted(by_id, key=lambda r: (r["ufc"], r["img"])):
        if r["ufc"] in slugs and r["ufc"] not in found:
            found[r["ufc"]] = _file_name(r["img"])

    labels: dict[str, set[str]] = {}
    for r in by_name:
        labels.setdefault(normalize_name(r["label"]), set()).add(r["item"])
    names = fighters["fighter"].map(normalize_name)
    unique_names = set(names[~names.duplicated(keep=False)])
    for r in sorted(by_name, key=lambda r: (r["item"], r["img"])):
        key = normalize_name(r["label"])
        if key not in unique_names or len(labels[key]) != 1:
            continue
        slug = fighters.loc[names == key, "fighter_slug"].iloc[0]
        if slug in found or r.get("ufc", slug) != slug:
            continue
        found[slug] = _file_name(r["img"])
    return found


def _text(meta: dict, key: str) -> str | None:
    value = meta.get(key, {}).get("value")
    if not value:
        return None
    value = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", value))).strip()
    return value or None


def _image_info(files: list[str]) -> dict[str, dict]:
    info = {}
    for i in range(0, len(files), 50):
        chunk = files[i : i + 50]
        params = {
            "action": "query",
            "format": "json",
            "prop": "imageinfo",
            "iiprop": "url|size|extmetadata",
            "iiurlwidth": WIDTH,
            "titles": "|".join(f"File:{f}" for f in chunk),
        }
        data = _get(COMMONS, params)["query"]
        aliases = {n["to"]: n["from"] for n in data.get("normalized", [])}
        for page in data["pages"].values():
            if "imageinfo" not in page:
                continue
            ii, meta = page["imageinfo"][0], page["imageinfo"][0].get("extmetadata", {})
            info[aliases.get(page["title"], page["title"]).removeprefix("File:")] = {
                "thumb": (ii.get("thumburl") or ii["url"]).split("?", 1)[0],
                "width": ii.get("thumbwidth") or ii["width"],
                "height": ii.get("thumbheight") or ii["height"],
                "author": _text(meta, "Artist"),
                "license": _text(meta, "LicenseShortName"),
                "license_url": _text(meta, "LicenseUrl"),
                "page": ii["descriptionurl"],
            }
    return info


def refresh() -> int:
    fighters = pd.read_parquet(PROCESSED / "fighters.parquet", columns=["fighter", "fighter_slug"])
    found = match(fighters, _sparql(Q_BY_ID), _sparql(Q_BY_NAME))
    info = _image_info(sorted(set(found.values())))
    rows = [{"slug": s, "file": f, **info[f]} for s, f in sorted(found.items()) if f in info]
    SNAPSHOT.parent.mkdir(parents=True, exist_ok=True)
    with SNAPSHOT.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=COLUMNS)
        w.writeheader()
        w.writerows(rows)
    return len(rows)


def load() -> dict[str, dict]:
    """{slug: photo} from the snapshot; empty when it does not exist."""
    if not SNAPSHOT.exists():
        return {}
    snap = pd.read_csv(SNAPSHOT, dtype="string").astype(object).where(lambda d: d.notna(), None)
    photos = {}
    for r in snap.to_dict("records"):
        photos[r["slug"]] = {
            "url": r["thumb"],
            "width": int(r["width"]),
            "height": int(r["height"]),
            "author": r["author"],
            "license": r["license"],
            "license_url": r["license_url"],
            "page": r["page"],
        }
    return photos


if __name__ == "__main__":
    print(f"{refresh()} fighters with a photo -> {SNAPSHOT}")
