import math

import pandas as pd
import pytest

from pipeline import metrics


def fights(rows):
    cols = ["result", "method", "odds_decimal", "implied_prob_fair", "fight_time_s"]
    return pd.DataFrame(rows, columns=cols)


SAMPLE = fights(
    [
        ("W", "KO/TKO", 1.40, 0.70, 150),
        ("W", "SUB", 2.20, 0.45, 400),
        ("W", "DEC", 3.00, 0.33, 900),
        ("L", "DEC", 1.80, 0.55, 900),
        ("L", "KO/TKO", None, None, 1200),
        ("D", "DEC", 2.10, 0.48, 900),
        ("NC", "OTHER", 5.00, 0.20, 60),
    ]
)


def test_ufc_record():
    assert metrics.ufc_record(SAMPLE) == {"W": 3, "L": 2, "D": 1, "NC": 1}


def test_career_record_keeps_nulls():
    row = pd.Series({"wins": 10, "losses": 2, "draws": pd.NA})
    assert metrics.career_record(row) == {"wins": 10, "losses": 2, "draws": None}


def test_method_breakdown_wins_and_losses():
    assert metrics.method_breakdown(SAMPLE, "W") == {"KO/TKO": 1, "SUB": 1, "DEC": 1, "OTHER": 0}
    assert metrics.method_breakdown(SAMPLE, "L") == {"KO/TKO": 1, "SUB": 0, "DEC": 1, "OTHER": 0}


@pytest.mark.parametrize(
    ("result", "odds", "expected"),
    [("W", 2.5, 150.0), ("L", 2.5, -100), ("D", 2.5, 0.0), ("NC", 1.2, 0.0), ("W", None, None)],
)
def test_bet_return(result, odds, expected):
    assert metrics.bet_return(result, odds) == expected


@pytest.mark.parametrize(
    ("odds", "expected"),
    [
        (1.01, "Heavy favorite"),
        (1.49, "Heavy favorite"),
        (1.50, "Favorite"),
        (1.99, "Favorite"),
        (2.00, "Pick'em"),
        (2.49, "Pick'em"),
        (2.50, "Underdog"),
        (3.99, "Underdog"),
        (4.00, "Heavy underdog"),
        (12.0, "Heavy underdog"),
        (1.0, None),
        (None, None),
    ],
)
def test_odds_type_half_open_intervals(odds, expected):
    assert metrics.odds_type(odds) == expected


def test_implied_prob_fair_removes_margin():
    p = metrics.implied_prob_fair(1.5, 2.6)
    assert p == pytest.approx((1 / 1.5) / (1 / 1.5 + 1 / 2.6))
    assert p + metrics.implied_prob_fair(2.6, 1.5) == pytest.approx(1.0)
    assert metrics.implied_prob_fair(2.0, 2.0) == pytest.approx(0.5)
    assert metrics.implied_prob_fair(1.5, None) is None


def test_roi_total_and_by_type():
    out = metrics.roi(SAMPLE)
    # with odds: W 1.40 (+40), W 2.20 (+120), W 3.00 (+200), L 1.80 (-100), D (0), NC (0)
    assert out["total"]["n"] == 6
    assert out["total"]["profit"] == pytest.approx(260)
    assert out["total"]["roi_pct"] == pytest.approx(260 / 600 * 100, abs=0.01)
    assert out["total"]["coverage"] == pytest.approx(6 / 7, abs=1e-4)
    assert out["by_type"]["Heavy favorite"]["n"] == 1
    assert out["by_type"]["Heavy favorite"]["small_sample"] is True
    assert out["by_type"]["Heavy underdog"]["n"] == 1  # the NC at 5.00
    assert out["by_type"]["Heavy underdog"]["roi_pct"] == 0


def test_roi_no_data_when_no_odds():
    out = metrics.roi(fights([("W", "DEC", None, None, 900)]))
    assert out["total"]["no_data"] is True
    assert all(block["no_data"] for block in out["by_type"].values())


def test_expected_vs_actual_excludes_draws_and_nc():
    exp = metrics.roi(SAMPLE)["expected_vs_actual"]
    assert exp["n"] == 4
    assert exp["expected_wins"] == pytest.approx(0.70 + 0.45 + 0.33 + 0.55)
    assert exp["actual_wins"] == 3


def test_durations():
    out = metrics.durations(SAMPLE)
    assert [b["count"] for b in out["bins"]] == [2, 1, 3, 1, 0]
    assert out["decision_pct"] == pytest.approx(3 / 6 * 100, abs=0.1)


def test_percentile_rank_mid_rank():
    pct = metrics.percentile_rank(pd.Series([1.0, 2.0, 2.0, 4.0]))
    assert list(pct) == [12.5, 50.0, 50.0, 87.5]


def test_percentiles_population_and_inversion():
    base = {m: 1.0 for m in metrics.CAREER_METRICS}
    rows = []
    for i in range(4):
        rows.append({**base, "slpm": float(i), "sapm": float(i), "ufc_fights": 3, "weight_class": "Lightweight"})
    rows.append({**base, "ufc_fights": 2, "weight_class": "Lightweight"})  # too few fights
    rows.append({**base, "slpm": math.nan, "ufc_fights": 10, "weight_class": "Lightweight"})  # missing metric
    df = pd.DataFrame(rows)
    global_pct, division_pct = metrics.compute_percentiles(df)
    assert list(global_pct.index) == [0, 1, 2, 3]
    assert global_pct.loc[3, "slpm"] == 87.5
    assert global_pct.loc[3, "sapm"] == 12.5  # highest SApM -> lowest (inverted) percentile
    assert division_pct.loc[0, "slpm"] == 12.5


@pytest.mark.parametrize(
    ("slpm", "td", "expected"),
    [(70, 69.9, "Striker"), (69.9, 70, "Grappler"), (80, 80, "Balanced"), (50, 50, "Balanced"), (None, 10, None)],
)
def test_archetype(slpm, td, expected):
    assert metrics.archetype({"slpm": slpm, "td_avg": td}) == expected


def test_archetype_outside_population_is_null():
    assert metrics.archetype(None) is None
