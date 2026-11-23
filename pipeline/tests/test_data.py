import pandas as pd
import pytest

from pipeline import data
from pipeline.sources import american_to_decimal


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("José Aldo", "jose aldo"),
        ("JOSÉ  ALDO", "jose aldo"),
        ("Georges St-Pierre", "georges st pierre"),
        ("B.J. Penn", "bj penn"),
        ("Sean O'Malley", "sean omalley"),
        ("Jan Błachowicz", "jan bachowicz"),
    ],
)
def test_normalize_name(raw, expected):
    assert data.normalize_name(raw) == expected


def test_slugify():
    assert data.slugify("José Aldo") == "jose-aldo"


@pytest.mark.parametrize(
    ("method", "group"),
    [
        ("Decision - Unanimous", "DEC"),
        ("Decision - Split", "DEC"),
        ("KO/TKO", "KO/TKO"),
        ("TKO - Doctor's Stoppage", "KO/TKO"),
        ("Submission", "SUB"),
        ("DQ", "OTHER"),
        ("Overturned", "OTHER"),
        ("Could Not Continue", "OTHER"),
    ],
)
def test_group_method(method, group):
    assert data.group_method(method) == group


@pytest.mark.parametrize(
    ("seconds", "expected"),
    [(144, (1, 144)), (300, (1, 300)), (301, (2, 1)), (900, (3, 300)), (1500, (5, 300)), (None, (None, None))],
)
def test_split_round(seconds, expected):
    assert data.split_round(seconds) == expected


@pytest.mark.parametrize(
    ("label", "division"),
    [
        ("Lightweight", "Lightweight"),
        ("Light Heavyweight", "Light Heavyweight"),
        ("UFC Light Heavyweight Title", "Light Heavyweight"),
        ("Women's Flyweight", "Women's Flyweight"),
        ("Flyweight", "Flyweight"),
        ("Catch Weight", "Catch Weight"),
        ("NULL", None),
        (None, None),
    ],
)
def test_normalize_weight_class(label, division):
    assert data.normalize_weight_class(label) == division


@pytest.mark.parametrize(
    ("weight", "gender", "division"),
    [
        (155, "M", "Lightweight"),
        (156, None, "Welterweight"),
        (248, "M", "Heavyweight"),
        (115, "F", "Women's Strawweight"),
        (None, "M", None),
    ],
)
def test_infer_weight_class(weight, gender, division):
    assert data.infer_weight_class(weight, gender) == division


@pytest.mark.parametrize(("american", "decimal"), [(150, 2.5), (-200, 1.5), (100, 2.0), (None, None)])
def test_american_to_decimal(american, decimal):
    assert american_to_decimal(american) == decimal


def test_fight_id_is_order_independent():
    d = pd.Timestamp("2020-01-01")
    assert data.fight_id(d, "A B", "C D") == data.fight_id(d, "C D", "A B")


def test_assign_slugs_collisions_and_freeze():
    keys = pd.DataFrame(
        {
            "fighter_key": ["bruno silva|2021-06-19", "bruno silva|2016-01-01", "jose aldo|2011-01-01"],
            "name": ["Bruno Silva", "Bruno Silva", "José Aldo"],
            "first_fight": pd.to_datetime(["2021-06-19", "2016-01-01", "2011-01-01"]),
        }
    )
    slugs = data.assign_slugs(keys, None).set_index("fighter_key")["slug"]
    assert slugs["bruno silva|2016-01-01"] == "bruno-silva"  # oldest first fight keeps the bare slug
    assert slugs["bruno silva|2021-06-19"] == "bruno-silva-2"
    # A newer homonym with an older first fight must not steal a frozen slug.
    frozen = slugs.reset_index()
    more = pd.concat(
        [
            keys,
            pd.DataFrame(
                {
                    "fighter_key": ["bruno silva|2010-05-05"],
                    "name": ["Bruno Silva"],
                    "first_fight": pd.to_datetime(["2010-05-05"]),
                }
            ),
        ]
    )
    again = data.assign_slugs(more, frozen).set_index("fighter_key")["slug"]
    assert again["bruno silva|2016-01-01"] == "bruno-silva"
    assert again["bruno silva|2010-05-05"] == "bruno-silva-3"
