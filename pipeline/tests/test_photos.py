"""Photo matching rules (pipeline.photos.match) without network."""

import pandas as pd

from pipeline.photos import match

FIGHTERS = pd.DataFrame(
    {
        "fighter": ["Jon Jones", "Bruno Silva", "Bruno Silva", "José Aldo", "Max Holloway"],
        "fighter_slug": ["jon-jones", "bruno-silva", "bruno-silva-2", "jose-aldo", "max-holloway"],
    }
)
IMG = "http://commons.wikimedia.org/wiki/Special:FilePath/"


def test_match_rules():
    by_id = [{"item": "Q1", "ufc": "jon-jones", "img": IMG + "Jon%20Jones.jpg"}]
    by_name = [
        {"item": "Q2", "label": "Bruno Silva", "img": IMG + "Bruno.jpg"},  # homonym in our data
        {"item": "Q3", "label": "Jose Aldo", "img": IMG + "Aldo.jpg"},  # accent-insensitive
        {"item": "Q4", "label": "Max Holloway", "img": IMG + "Max.jpg", "ufc": "other-max"},  # other UFC id
        {"item": "Q5", "label": "Jon Jones", "img": IMG + "Other.jpg"},  # id match wins
    ]
    assert match(FIGHTERS, by_id, by_name) == {"jon-jones": "Jon Jones.jpg", "jose-aldo": "Aldo.jpg"}


def test_ambiguous_wikidata_label_is_skipped():
    by_name = [
        {"item": "Q3", "label": "José Aldo", "img": IMG + "A.jpg"},
        {"item": "Q9", "label": "Jose Aldo", "img": IMG + "B.jpg"},
    ]
    assert match(FIGHTERS, [], by_name) == {}
