"""Belts (spec 11.1 row 7a) and the fighter-file size limit."""

import pandas as pd

from pipeline import export, validate

DIVISIONS = {"Lightweight", "Heavyweight"}
KNOWN = {"a", "b", "c"}


def _csv(*rows):
    return pd.DataFrame(rows, columns=["division", "slug", "interim", "since"])


def _errors(champions):
    errors: list[str] = []
    validate.check_champions(champions, KNOWN, DIVISIONS, errors.append)
    return errors


def _own():
    return pd.DataFrame(
        {
            "title_bout": [True, True, False],
            "result": ["W", "L", "W"],
            "weight_class": ["Lightweight", "Heavyweight", "Heavyweight"],
        }
    )


def test_belts_gold_silver_grey():
    champs = _csv(("Lightweight", "a", "false", ""), ("Lightweight", "b", "true", ""))
    assert export.belts_for("a", _own(), champs) == [{"division": "Lightweight", "kind": "champion"}]
    assert export.belts_for("b", _own(), champs)[0] == {"division": "Lightweight", "kind": "interim"}
    # Former: won a title bout in the division and is not current there.
    assert export.belts_for("c", _own(), champs) == [{"division": "Lightweight", "kind": "former"}]


def test_current_belt_wins_over_former_and_no_belts_is_empty():
    champs = _csv(("Lightweight", "c", "false", ""))
    assert export.belts_for("c", _own(), champs) == [{"division": "Lightweight", "kind": "champion"}]
    assert export.belts_for("z", _own().iloc[2:], _csv()) == []


def test_champions_csv_valid():
    assert _errors(_csv(("Lightweight", "a", "false", ""), ("Lightweight", "b", "true", ""))) == []


def test_champions_csv_rejects():
    assert _errors(_csv(("Lightweight", "nobody", "false", "")))
    assert _errors(_csv(("Strawweight", "a", "false", "")))
    assert _errors(_csv(("Lightweight", "a", "maybe", "")))
    assert _errors(_csv(("Lightweight", "a", "false", ""), ("Lightweight", "b", "false", "")))
    assert _errors(_csv(("Lightweight", "a", "true", ""), ("Lightweight", "b", "true", "")))


def test_oversized_fighter_file_fails():
    fights = pd.DataFrame(
        {
            "fight_id": ["f1", "f1"],
            "date": [pd.Timestamp("2020-01-01").date()] * 2,
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
    big = {"a": {"x": "y" * 51_000}, "b": {}}
    report = validate.validate(fights, fighters, slugs, slugs, index, big, {"fights": 1}, [])
    assert any("bytes" in e for e in report.errors)
