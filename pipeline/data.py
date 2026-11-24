"""Cleaning, name normalization, slugs and source matching -> fights / fighters tables."""

from __future__ import annotations

import hashlib
import math
import re
import unicodedata
from dataclasses import dataclass

import pandas as pd

from pipeline.sources import Almanac

RESULT_CODES = {1: ("W", "L"), 2: ("L", "W"), 3: ("D", "D"), 4: ("NC", "NC")}
STANCES = {1: "Orthodox", 2: "Southpaw", 3: "Switch"}
STAT_COLUMNS = {
    "Knockdowns": "kd",
    "Knockdowns Against": "kd_against",
    "Sig Strikes Landed": "sig_landed",
    "Sig Strikes Attempted": "sig_attempted",
    "Sig Strikes Absorbed": "sig_absorbed",
    "Strikes Landed": "str_landed",
    "Strikes Attempted": "str_attempted",
    "Strikes Absorbed": "str_absorbed",
    "Takedowns": "td",
    "Takedown Attempts": "td_attempted",
    "Got Taken Down": "taken_down",
    "Submission Attempts": "sub_att",
    "Clinch Strikes": "clinch",
    "Clinch Strikes Taken": "clinch_taken",
    "Ground Strikes": "ground",
    "Ground Strikes Taken": "ground_taken",
}
CAREER_COLUMNS = {
    "SLpM": "slpm",
    "StrAcc": "str_acc",
    "SApM": "sapm",
    "StrDef": "str_def",
    "TDAvg": "td_avg",
    "TDAcc": "td_acc",
    "TDDef": "td_def",
    "SubAvg": "sub_avg",
}
CAREER_METRICS = list(CAREER_COLUMNS.values())

MEN_DIVISIONS = [
    ("Flyweight", 125),
    ("Bantamweight", 135),
    ("Featherweight", 145),
    ("Lightweight", 155),
    ("Welterweight", 170),
    ("Middleweight", 185),
    ("Light Heavyweight", 205),
    ("Heavyweight", 265),
]
WOMEN_DIVISIONS = [
    ("Women's Strawweight", 115),
    ("Women's Flyweight", 125),
    ("Women's Bantamweight", 135),
    ("Women's Featherweight", 145),
]
DIVISIONS = {name for name, _ in MEN_DIVISIONS + WOMEN_DIVISIONS}
ROUND_SECONDS = 300
MATCH_DAY_TOLERANCE = 1


# --- names, slugs, methods -------------------------------------------------------------


def text_or_none(value):
    """Source placeholders such as "NULL" or blanks become None."""
    if not isinstance(value, str):
        return None if pd.isna(value) else value
    value = value.strip()
    return None if value.upper() in {"", "NULL", "NONE", "N/A", "NAN"} else value


def normalize_name(name: str) -> str:
    """NFKD -> ASCII, lowercase, no punctuation, collapsed spaces. 'José Aldo' -> 'jose aldo'."""
    text = unicodedata.normalize("NFKD", str(name)).encode("ascii", "ignore").decode()
    text = re.sub(r"[-_/]", " ", text.lower())
    text = re.sub(r"[^a-z0-9 ]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def slugify(name: str) -> str:
    return normalize_name(name).replace(" ", "-")


def fight_id(date: pd.Timestamp, name_a: str, name_b: str) -> str:
    key = f"{date:%Y-%m-%d}|" + "|".join(sorted([normalize_name(name_a), normalize_name(name_b)]))
    return hashlib.sha1(key.encode()).hexdigest()[:12]


def group_method(method: str) -> str:
    text = str(method).lower()
    if text.startswith("decision"):
        return "DEC"
    if "ko" in text:  # "KO/TKO", "TKO - Doctor's Stoppage"
        return "KO/TKO"
    if text.startswith("submission"):
        return "SUB"
    return "OTHER"  # DQ, Overturned, Could Not Continue


def normalize_weight_class(value: object) -> str | None:
    """Map enrichment labels ('UFC Lightweight Title', 'Catch Weight', 'NULL') to a division."""
    if not isinstance(value, str) or value.strip().upper() in {"", "NULL", "NONE"}:
        return None
    text = value.strip()
    women = "women" in text.lower()
    for name, _ in sorted(MEN_DIVISIONS + WOMEN_DIVISIONS, key=lambda d: -len(d[0])):
        base = name.replace("Women's ", "")
        if base.lower() in text.lower() and (name.startswith("Women's") == women):
            return name
    if "catch" in text.lower():
        return "Catch Weight"
    if "open" in text.lower():
        return "Open Weight"
    return None


def infer_weight_class(weight_lbs: float | None, gender: str | None) -> str | None:
    """Smallest official division whose limit is >= the fighter's current weight."""
    if weight_lbs is None or pd.isna(weight_lbs):
        return None
    table = WOMEN_DIVISIONS if gender == "F" else MEN_DIVISIONS
    for name, limit in table:
        if weight_lbs <= limit:
            return name
    return table[-1][0]


def split_round(fight_time_s: float | None) -> tuple[int | None, int | None]:
    """Total elapsed seconds -> (round, seconds into that round). 5-minute rounds."""
    if fight_time_s is None or pd.isna(fight_time_s) or fight_time_s <= 0:
        return None, None
    rnd = math.ceil(fight_time_s / ROUND_SECONDS)
    return rnd, int(fight_time_s - ROUND_SECONDS * (rnd - 1))


def parse_clock(text: object) -> int | None:
    if not isinstance(text, str) or ":" not in text:
        return None
    minutes, seconds = text.split(":", 1)
    try:
        return int(minutes) * 60 + int(seconds)
    except ValueError:
        return None


# --- slugs ---------------------------------------------------------------------------------


def assign_slugs(keys: pd.DataFrame, frozen: pd.DataFrame | None) -> pd.DataFrame:
    """keys: fighter_key, name, first_fight. Returns fighter_key, slug (frozen rows kept)."""
    frozen = frozen if frozen is not None else pd.DataFrame(columns=["fighter_key", "slug"])
    taken = dict(zip(frozen["fighter_key"], frozen["slug"]))
    used = set(taken.values())
    new = keys[~keys["fighter_key"].isin(taken)].sort_values(["first_fight", "fighter_key"])
    for key, name in zip(new["fighter_key"], new["name"]):
        base = slugify(name) or "fighter"
        slug, n = base, 1
        while slug in used:
            n += 1
            slug = f"{base}-{n}"
        taken[key] = slug
        used.add(slug)
    out = pd.DataFrame({"fighter_key": list(taken), "slug": list(taken.values())})
    return out.sort_values("fighter_key").reset_index(drop=True)


# --- matching ------------------------------------------------------------------------------


def _pair_key(name_a: str, name_b: str) -> tuple[str, str]:
    a, b = normalize_name(name_a), normalize_name(name_b)
    return (a, b) if a <= b else (b, a)


def _index_source(rows: pd.DataFrame) -> dict[tuple, int]:
    index: dict[tuple, int] = {}
    for idx, date, n1, n2 in zip(rows.index, rows["date"], rows["name_1"], rows["name_2"]):
        index.setdefault((date.normalize(), *_pair_key(n1, n2)), idx)
    return index


def _lookup(index: dict[tuple, int], date: pd.Timestamp, pair: tuple[str, str]) -> int | None:
    for delta in [0] + [d for k in range(1, MATCH_DAY_TOLERANCE + 1) for d in (-k, k)]:
        hit = index.get((date + pd.Timedelta(days=delta), *pair))
        if hit is not None:
            return hit
    return None


def load_aliases(path) -> dict[str, str]:
    """pipeline/aliases.csv: almanac_name,enrichment_name (both raw names)."""
    try:
        aliases = pd.read_csv(path)
    except FileNotFoundError:
        return {}
    return {normalize_name(a): normalize_name(b) for a, b in zip(aliases["almanac_name"], aliases["enrichment_name"])}


@dataclass
class CleanData:
    fights: pd.DataFrame
    fighters: pd.DataFrame
    slugs: pd.DataFrame
    unmatched: pd.DataFrame


def build_tables(
    almanac: Almanac,
    enrichment: pd.DataFrame,
    frozen_slugs: pd.DataFrame | None = None,
    aliases: dict[str, str] | None = None,
) -> CleanData:
    aliases = aliases or {}
    alias = lambda name: aliases.get(normalize_name(name), normalize_name(name))  # noqa: E731

    results = almanac.results.copy()
    results["fight_id"] = [
        fight_id(d, a, b) for d, a, b in zip(results["Date"], results["Fighter 1"], results["Fighter 2"])
    ]

    jerzy = enrichment[enrichment["source"] == "jerzyszocik"]
    mdab = enrichment[enrichment["source"] == "mdabbert"]
    jerzy_index, mdab_index = _index_source(jerzy), _index_source(mdab)
    enrichment_end = jerzy["date"].max()

    # Homonyms: one normalized name with several UFCStats URLs in the enrichment.
    urls = pd.concat(
        [
            jerzy[["name_1", "url_1"]].set_axis(["name", "url"], axis=1),
            jerzy[["name_2", "url_2"]].set_axis(["name", "url"], axis=1),
        ]
    ).dropna()
    urls["norm"] = urls["name"].map(normalize_name)
    url_counts = urls.groupby("norm")["url"].nunique()
    homonyms = set(url_counts[url_counts > 1].index)

    rows, unmatched = [], []
    for fight in results.itertuples(index=False):
        date, f1, f2 = fight.Date, fight._1, fight._2
        pair = tuple(sorted([alias(f1), alias(f2)]))
        j_idx = _lookup(jerzy_index, date, pair)
        m_idx = _lookup(mdab_index, date, pair)
        j = jerzy.loc[j_idx] if j_idx is not None else None
        m = mdab.loc[m_idx] if m_idx is not None else None
        if j is None:
            reason = "after_enrichment" if date > enrichment_end else "no_enrichment_match"
            unmatched.append({"date": date, "fighter_1": f1, "fighter_2": f2, "reason": reason})
        outcomes = RESULT_CODES[int(fight.Result)]
        for side, (name, opp) in enumerate([(f1, f2), (f2, f1)]):
            row = {
                "fight_id": fight.fight_id,
                "date": date,
                "fighter": name,
                "opponent": opp,
                "result": outcomes[side],
                "method": group_method(fight.Method),
                "method_detail": fight.Method,
            }
            for src, key in (("j", j), ("m", m)):
                same = key is not None and alias(key["name_1"]) == alias(name)
                own, other = ("1", "2") if same else ("2", "1")
                row[f"{src}_odds"] = key[f"odds_{own}"] if key is not None else None
                row[f"{src}_opp_odds"] = key[f"odds_{other}"] if key is not None else None
                if src == "j":
                    row["url"] = key[f"url_{own}"] if key is not None else None
                    row["nickname"] = text_or_none(key[f"nickname_{own}"]) if key is not None else None
                    row["dob"] = key[f"dob_{own}"] if key is not None else None
            row["matched"] = j is not None
            # Title fight: mdabbert marks them (to its last event); jerzyszocik only in a few division labels.
            row["title_bout"] = any(k is not None and bool(k["title_bout"]) for k in (j, m))
            row["j_weight_class"] = normalize_weight_class(j["weight_class"]) if j is not None else None
            row["j_gender"] = j["gender"] if j is not None else None
            row["j_finish_round"] = j["finish_round"] if j is not None else None
            row["j_finish_time"] = parse_clock(j["finish_time"]) if j is not None else None
            rows.append(row)

    long = pd.DataFrame(rows)
    long["norm"] = long["fighter"].map(normalize_name)
    long["opp_norm"] = long["opponent"].map(normalize_name)

    # Stats per fighter and fight.
    stats = almanac.stats.rename(columns={"Name": "fighter", "Date": "date", "Time": "fight_time_s", **STAT_COLUMNS})
    stats = stats.drop_duplicates(["fighter", "date"])
    long = long.merge(stats, on=["fighter", "date"], how="left")
    long["round"], long["round_time_s"] = zip(*long["fight_time_s"].map(split_round))

    mismatch = long[
        long["j_finish_round"].notna() & long["round"].notna() & (long["j_finish_round"] != long["round"])
    ].drop_duplicates("fight_id")
    for row in mismatch.itertuples():
        unmatched.append(
            {"date": row.date, "fighter_1": row.fighter, "fighter_2": row.opponent, "reason": "finish_round_mismatch"}
        )

    # Identity: normalized name, or name + UFCStats URL for homonyms.
    long["ident"] = long["norm"]
    is_hom = long["norm"].isin(homonyms)
    long.loc[is_hom & long["url"].notna(), "ident"] = long["norm"] + "#" + long["url"].astype(str)
    long = _resolve_homonyms(long, homonyms)
    ident_of = dict(zip(zip(long["fight_id"], long["norm"]), long["ident"]))
    long["opp_ident"] = [ident_of[(f, o)] for f, o in zip(long["fight_id"], long["opp_norm"])]

    # Odds: same source for both sides of a fight.
    j_both = long["j_odds"].notna() & long["j_opp_odds"].notna()
    m_both = long["m_odds"].notna() & long["m_opp_odds"].notna()
    use_j = j_both | (~m_both & long["j_odds"].notna())
    use_m = ~use_j & (m_both | long["m_odds"].notna())
    long["odds_decimal"] = long["j_odds"].where(use_j, long["m_odds"].where(use_m))
    long["opp_odds_decimal"] = long["j_opp_odds"].where(use_j, long["m_opp_odds"].where(use_m))
    long["odds_source"] = pd.Series(None, index=long.index, dtype="string")
    long.loc[use_j, "odds_source"] = "jerzyszocik"
    long.loc[use_m, "odds_source"] = "mdabbert"
    both = long["odds_decimal"].notna() & long["opp_odds_decimal"].notna()
    inv, opp_inv = 1 / long["odds_decimal"], 1 / long["opp_odds_decimal"]
    long["implied_prob_fair"] = (inv / (inv + opp_inv)).where(both)

    # Profiles (Almanac career data), with homonym rows assigned by weight.
    profiles = _profiles(almanac.fighters, long, homonyms)

    # Division and gender, with inference for fights without enrichment.
    long = long.sort_values(["date", "fight_id", "fighter"], kind="stable").reset_index(drop=True)
    long["weight_class"] = long["j_weight_class"]
    long["gender"] = long["j_gender"]
    long["weight_class_inferred"] = False
    weights = profiles.set_index("ident")["weight_lbs"].to_dict()
    for ident, idx in long.groupby("ident", sort=False).groups.items():
        last_div, last_gender = None, None
        for i in idx:
            div, gender = long.at[i, "weight_class"], long.at[i, "gender"]
            if pd.notna(gender):
                last_gender = gender
            if isinstance(div, str):
                if div in DIVISIONS:
                    last_div = div
                continue
            long.at[i, "gender"] = last_gender
            long.at[i, "weight_class"] = last_div or infer_weight_class(weights.get(ident), last_gender)
            long.at[i, "weight_class_inferred"] = True

    # Keys and slugs.
    first = long.groupby("ident").agg(first_fight=("date", "min"), name=("fighter", "last")).reset_index()
    first["fighter_key"] = first["ident"].str.split("#").str[0] + "|" + first["first_fight"].dt.strftime("%Y-%m-%d")
    slugs = assign_slugs(first[["fighter_key", "name", "first_fight"]], frozen_slugs)
    first = first.merge(slugs, on="fighter_key", how="left")
    slug_of = dict(zip(first["ident"], first["slug"]))
    long["fighter_slug"] = long["ident"].map(slug_of)
    long["opponent_slug"] = long["opp_ident"].map(slug_of)

    fights = _fights_table(long)
    fighters = _fighters_table(long, profiles, first)
    unmatched_df = pd.DataFrame(unmatched, columns=["date", "fighter_1", "fighter_2", "reason"])
    unmatched_df = unmatched_df.sort_values(["date", "fighter_1", "reason"], kind="stable").reset_index(drop=True)
    return CleanData(fights=fights, fighters=fighters, slugs=slugs, unmatched=unmatched_df)


def _resolve_homonyms(long: pd.DataFrame, homonyms: set[str]) -> pd.DataFrame:
    """Assign homonym fights without URL to the identity whose matched fights are closest in time."""
    for norm in homonyms:
        known = long[(long["norm"] == norm) & long["url"].notna()]
        todo = long[(long["norm"] == norm) & long["url"].isna()].index
        for i in todo:
            gap = (known["date"] - long.at[i, "date"]).abs()
            long.at[i, "ident"] = known.loc[gap.idxmin(), "ident"]
    return long


def _profiles(raw: pd.DataFrame, long: pd.DataFrame, homonyms: set[str]) -> pd.DataFrame:
    prof = raw.rename(
        columns={
            "Name": "name",
            "Wins": "wins",
            "Losses": "losses",
            "Draws": "draws",
            "Height": "height_cm",
            "Weight": "weight_lbs",
            "Reach": "reach_in",
            "Stance": "stance",
            "Age": "age",
            **CAREER_COLUMNS,
        }
    ).copy()
    prof["norm"] = prof["name"].map(normalize_name)
    prof["reach_cm"] = (prof["reach_in"] * 2.54).round(1)
    prof["stance"] = prof["stance"].map(STANCES)
    # All eight career metrics at 0 means UFCStats has no data for the fighter.
    no_data = (prof[CAREER_METRICS] == 0).all(axis=1)
    prof.loc[no_data, CAREER_METRICS] = None
    prof["ident"] = prof["norm"]
    repeated = set(prof.loc[prof["norm"].duplicated(), "norm"]) | homonyms
    for norm in repeated:
        rows = prof[prof["norm"] == norm]
        prof.loc[rows.index, "ident"] = None
        idents = (
            long[long["norm"] == norm]
            .groupby("ident")["j_weight_class"]
            .agg(lambda s: s.dropna().iloc[-1] if s.notna().any() else None)
        )
        limits = dict(MEN_DIVISIONS + WOMEN_DIVISIONS)
        free = set(idents.index)
        for i in rows.index:
            if not free:
                break
            best = min(free, key=lambda ident: abs(limits.get(idents[ident], 999) - prof.at[i, "weight_lbs"]))
            prof.at[i, "ident"] = best
            free.discard(best)
    prof = prof[prof["ident"].isin(set(long["ident"]))]
    return prof.drop_duplicates("ident")


def _fights_table(long: pd.DataFrame) -> pd.DataFrame:
    cols = [
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
        "title_bout",
        *STAT_COLUMNS.values(),
    ]
    fights = long[cols].copy()
    for col in ["fight_time_s", "round", "round_time_s", *STAT_COLUMNS.values()]:
        fights[col] = fights[col].astype("Int64")
    for col in [
        "fighter",
        "fighter_slug",
        "opponent",
        "opponent_slug",
        "result",
        "method",
        "method_detail",
        "odds_source",
        "weight_class",
        "gender",
    ]:
        fights[col] = fights[col].astype("string")
    for col in ["odds_decimal", "opp_odds_decimal", "implied_prob_fair"]:
        fights[col] = fights[col].astype("Float64").round(6)
    fights["weight_class_inferred"] = fights["weight_class_inferred"].astype(bool)
    fights["title_bout"] = fights["title_bout"].astype(bool)
    fights["date"] = fights["date"].dt.date
    return fights.sort_values(["date", "fight_id", "fighter_slug"], kind="stable").reset_index(drop=True)


def _fighters_table(long: pd.DataFrame, profiles: pd.DataFrame, first: pd.DataFrame) -> pd.DataFrame:
    proper = long[long["weight_class"].isin(DIVISIONS)]
    agg = long.groupby("ident").agg(
        fighter=("fighter", "last"),
        ufc_fights=("fight_id", "nunique"),
        last_fight_date=("date", "max"),
        gender=("gender", lambda s: s.dropna().iloc[-1] if s.notna().any() else None),
    )
    agg["weight_class"] = proper.groupby("ident")["weight_class"].last()
    extra = (
        long.dropna(subset=["url"])
        .groupby("ident")
        .agg(
            nickname=("nickname", lambda s: s.dropna().iloc[-1] if s.notna().any() else None),
            dob=("dob", lambda s: s.dropna().iloc[-1] if s.notna().any() else None),
        )
    )
    out = agg.join(extra).join(first.set_index("ident")["slug"].rename("fighter_slug"))
    keep = ["ident", "age", "height_cm", "reach_cm", "weight_lbs", "stance", "wins", "losses", "draws", *CAREER_METRICS]
    out = out.join(profiles[keep].set_index("ident")).reset_index(drop=True)
    out["archetype"] = None
    out["dob"] = pd.to_datetime(out["dob"]).dt.date
    out["last_fight_date"] = out["last_fight_date"].dt.date
    for col in ["age", "wins", "losses", "draws", "weight_lbs"]:
        out[col] = out[col].astype("Int64")
    for col in ["height_cm", "reach_cm", *CAREER_METRICS]:
        out[col] = out[col].astype("Float64")
    for col in ["fighter", "fighter_slug", "nickname", "stance", "weight_class", "gender", "archetype"]:
        out[col] = out[col].astype("string")
    cols = [
        "fighter",
        "fighter_slug",
        "nickname",
        "dob",
        "age",
        "height_cm",
        "reach_cm",
        "weight_lbs",
        "stance",
        "wins",
        "losses",
        "draws",
        *CAREER_METRICS,
        "weight_class",
        "gender",
        "archetype",
        "ufc_fights",
        "last_fight_date",
    ]
    return out[cols].sort_values("fighter_slug").reset_index(drop=True)
