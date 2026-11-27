"""Contract of the versioned outputs (spec 6.3) and of validate() itself."""

import json
from datetime import date

import pandas as pd
import pytest

from pipeline import validate
from pipeline.paths import PROCESSED, WEB_DATA

BUILT = (PROCESSED / "fights.parquet").exists() and (WEB_DATA / "index.json").exists()
needs_build = pytest.mark.skipif(not BUILT, reason="run `python -m pipeline.build` first")

FIGHT_COLUMNS = {
    "title_bout",
    "fight_id",
    "date",
    "fighter",
    "fighter_slug",
    "opponent",
    "opponent_slug",
    "result",
    "method",
    "method_detail",
    "fight_time_s",
    "round",
    "round_time_s",
    "odds_source",
    "weight_class",
    "gender",
    "weight_class_inferred",
    "odds_decimal",
    "opp_odds_decimal",
    "implied_prob_fair",
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
}


@pytest.fixture(scope="module")
def built():
    fights = pd.read_parquet(PROCESSED / "fights.parquet")
    fighters = pd.read_parquet(PROCESSED / "fighters.parquet")
    slugs = pd.read_csv(PROCESSED / "slugs.csv")
    index = json.loads((WEB_DATA / "index.json").read_text())
    payloads = {p.stem: None for p in (WEB_DATA / "fighters").glob("*.json")}
    meta = json.loads((WEB_DATA / "meta.json").read_text())
    return fights, fighters, slugs, index, payloads, meta


@needs_build
def test_built_outputs_pass_validation(built):
    fights, fighters, slugs, index, payloads, meta = built
    report = validate.validate(fights, fighters, slugs, slugs, index, payloads, meta, [])
    assert report.errors == []


@needs_build
def test_fights_schema_and_non_nulls(built):
    fights = built[0]
    assert set(fights.columns) == FIGHT_COLUMNS
    for col in ["fight_id", "date", "fighter", "fighter_slug", "opponent", "opponent_slug", "result", "method"]:
        assert fights[col].notna().all(), col
    assert set(fights["result"]) <= {"W", "L", "D", "NC"}
    assert set(fights["method"]) <= {"KO/TKO", "SUB", "DEC", "OTHER"}
    assert set(fights["odds_source"].dropna()) <= {"jerzyszocik", "mdabbert"}
    # weight_class may only be null on fights without enrichment
    assert fights.loc[fights["weight_class"].isna(), "weight_class_inferred"].all()


@needs_build
def test_fighters_non_nulls(built):
    fighters = built[1]
    for col in ["fighter", "fighter_slug", "ufc_fights", "last_fight_date"]:
        assert fighters[col].notna().all(), col
    assert set(fighters["stance"].dropna()) <= {"Orthodox", "Southpaw", "Switch"}
    assert set(fighters["archetype"].dropna()) <= {"Striker", "Grappler", "Balanced"}


@needs_build
def test_index_covers_every_fighter_once(built):
    fights, fighters, _, index, payloads, meta = built
    slugs = [r["slug"] for r in index]
    assert len(slugs) == len(set(slugs)) == len(fighters)
    assert set(slugs) == set(fights["fighter_slug"]) == set(payloads)
    assert meta["fights"] == fights["fight_id"].nunique()
    assert meta["data_through"] == str(fights["date"].max())


@needs_build
def test_every_opponent_link_resolves(built):
    """CA6b: every history link opens a valid comparison."""
    fights, _, _, index, _, _ = built
    assert set(fights["opponent_slug"]) <= {r["slug"] for r in index}


def _tiny():
    fights = pd.DataFrame(
        {
            "fight_id": ["f1", "f1"],
            "date": [date(2020, 1, 1)] * 2,
            "fighter_slug": ["a", "b"],
            "opponent_slug": ["b", "a"],
            "result": ["W", "L"],
            "implied_prob_fair": [0.6, 0.4],
            "odds_decimal": [1.5, 2.6],
            "opp_odds_decimal": [2.6, 1.5],
        }
    )
    fighters = pd.DataFrame({"fighter_slug": ["a", "b"], **{c: [50.0, 60.0] for c in validate.PERCENT_COLUMNS}})
    slugs = pd.DataFrame({"fighter_key": ["a|2020", "b|2020"], "slug": ["a", "b"]})
    index = [{"slug": "a"}, {"slug": "b"}]
    return fights, fighters, slugs, index, {"a": {}, "b": {}}


def test_validate_accepts_tiny_dataset():
    fights, fighters, slugs, index, payloads = _tiny()
    assert validate.validate(fights, fighters, slugs, slugs, index, payloads, {"fights": 1}, ["a"]).ok


@pytest.mark.parametrize(
    "breakage",
    [
        "non_complementary",
        "missing_opponent",
        "frozen_slug_changed",
        "bad_prob",
        "volume_drop",
        "featured_missing",
        "future_date",
    ],
)
def test_validate_rejects(breakage):
    fights, fighters, slugs, index, payloads = _tiny()
    frozen, meta, featured = slugs.copy(), {"fights": 1}, ["a"]
    if breakage == "non_complementary":
        fights.loc[1, "result"] = "W"
    elif breakage == "missing_opponent":
        fights.loc[0, "opponent_slug"] = "zzz"
    elif breakage == "frozen_slug_changed":
        slugs.loc[0, "slug"] = "a-2"
    elif breakage == "bad_prob":
        fights.loc[0, "implied_prob_fair"] = 1.2
    elif breakage == "volume_drop":
        meta = {"fights": 1000}
    elif breakage == "featured_missing":
        featured = ["nobody"]
    elif breakage == "future_date":
        fights["date"] = [date(2999, 1, 1)] * 2
    assert not validate.validate(fights, fighters, slugs, frozen, index, payloads, meta, featured).ok


def test_config_slugs(tmp_path):
    cfg = tmp_path / "config.ts"
    cfg.write_text("export const FEATURED = { a: \"jose-aldo\", b: 'conor-mcgregor' };\n")
    assert validate.config_slugs(cfg) == ["jose-aldo", "conor-mcgregor"]
    assert validate.config_slugs(tmp_path / "missing.ts") == []


# --- directory.json (spec 11.1 row 4) --------------------------------------------------------


def _load(name):
    return json.loads((WEB_DATA / name).read_text(encoding="utf-8"))


@needs_build
def test_directory_one_entry_per_index_fighter():
    index, directory = _load("index.json"), _load("directory.json")
    assert [r["s"] for r in directory] == [r["slug"] for r in index]
    for entry, row in zip(directory, index, strict=True):
        assert entry["n"] == row["name"] and entry["r"] == row["record"]
        assert len(entry["rf"]) <= 5


@needs_build
def test_directory_index_is_mean_of_the_eight_percentiles():
    for entry in _load("directory.json"):
        pct = _load(f"fighters/{entry['s']}.json")["percentiles"]
        own = (pct["division"] or pct["global"]) if pct else None
        if own is None:
            assert "ix" not in entry
        else:
            assert len(own) == 8
            assert entry["ix"] == pytest.approx(sum(own.values()) / 8, abs=0.051)


@needs_build
def test_directory_gzip_under_limit():
    import gzip

    assert len(gzip.compress((WEB_DATA / "directory.json").read_bytes(), 9)) < validate.MAX_DIRECTORY_GZIP


@needs_build
def test_directory_belts_follow_the_contract():
    for entry in _load("directory.json"):
        fighter = _load(f"fighters/{entry['s']}.json")
        assert entry["belts"] == fighter["belts"]
        for belt in entry["belts"]:
            assert set(belt) == {"division", "kind"} and belt["kind"] in {"champion", "interim", "former"}
