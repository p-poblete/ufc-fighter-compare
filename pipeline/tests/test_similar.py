"""`similar` (spec 12.1 #8, CA34): closest style within the same gender and division."""

import json

import pandas as pd
import pytest

from pipeline.data import CAREER_METRICS
from pipeline.export import similar_fighters
from pipeline.paths import WEB_DATA


def _frame(rows):
    """rows: (slug, gender, division, ufc_fights, base percentile)."""
    fighters = pd.DataFrame(
        [
            {"fighter_slug": s, "fighter": s.title(), "gender": g, "weight_class": d, "ufc_fights": n}
            for s, g, d, n, _ in rows
        ],
        index=range(10, 10 + len(rows)),
    )
    pct = pd.DataFrame({m: [float(b) for *_, b in rows] for m in CAREER_METRICS}, index=fighters.index)
    return fighters, pct


def _slugs(result, slug):
    return [r["slug"] for r in result[slug]]


def test_order_distance_then_fights_then_slug():
    fighters, pct = _frame(
        [
            ("me", "M", "Lightweight", 5, 50),
            ("near", "M", "Lightweight", 4, 51),
            ("tie-b", "M", "Lightweight", 9, 54),  # same distance as tie-a, more fights -> first
            ("tie-a", "M", "Lightweight", 3, 46),  # |46-50| = |54-50|
            ("tie-c", "M", "Lightweight", 3, 46),  # same distance and fights as tie-a -> slug
            ("far", "M", "Lightweight", 20, 90),
        ]
    )
    res = similar_fighters(fighters, pct)
    assert _slugs(res, "me") == ["near", "tie-b", "tie-a", "tie-c", "far"]
    assert res["me"][0] == {"slug": "near", "name": "Near"}


def test_caps_at_five_and_excludes_self():
    fighters, pct = _frame([(f"f{i}", "M", "Flyweight", 3, 10 + i) for i in range(8)])
    res = similar_fighters(fighters, pct)
    assert len(res["f0"]) == 5
    assert all("f0" != s for s in _slugs(res, "f0"))


def test_same_gender_and_division_only_and_zero_candidates():
    fighters, pct = _frame(
        [
            ("solo", "M", "Lightweight", 3, 50),
            ("woman", "F", "Lightweight", 3, 50),
            ("heavy", "M", "Heavyweight", 3, 50),
        ]
    )
    res = similar_fighters(fighters, pct)
    assert res == {"solo": [], "woman": [], "heavy": []}


def test_outside_population_or_without_division_percentile_has_no_entry():
    fighters, pct = _frame(
        [("a", "M", "Lightweight", 3, 50), ("b", "M", "Lightweight", 3, 52), ("out", "M", "Lightweight", 1, 51)]
    )
    res = similar_fighters(fighters, pct.drop(index=fighters.index[2]))
    assert "out" not in res
    assert _slugs(res, "a") == ["b"]


BUILT = (WEB_DATA / "index.json").exists()


@pytest.mark.skipif(not BUILT, reason="run `python -m pipeline.build` first")
def test_built_similar_slugs_exist():
    known = {r["slug"] for r in json.loads((WEB_DATA / "index.json").read_text())}
    checked = 0
    for path in (WEB_DATA / "fighters").glob("*.json"):
        f = json.loads(path.read_text())
        if "similar" not in f:
            assert f["percentiles"]["division"] is None or f["gender"] is None  # no gender: no "same gender"
            continue
        assert f["percentiles"]["division"] is not None
        assert len(f["similar"]) <= 5 and f["slug"] not in {s["slug"] for s in f["similar"]}
        assert {s["slug"] for s in f["similar"]} <= known
        checked += 1
    assert checked > 0
