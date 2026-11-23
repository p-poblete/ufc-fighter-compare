# UFC Fighter Compare

Side-by-side comparison of two UFC fighters: profile, record, style radar, win/loss methods, fight history, fight duration and performance against the betting odds. Data refreshed weekly.

Work in progress — see [`docs/spec.md`](docs/spec.md).

## Data pipeline

```bash
python3.12 -m venv .venv
.venv/bin/pip install -r pipeline/requirements.txt
.venv/bin/python -m pipeline.build      # downloads UFC-Almanac, writes data/processed/ and web/public/data/
.venv/bin/pytest                         # metric and contract tests
.venv/bin/python -m pipeline.refresh_enrichment   # optional: refresh the Kaggle snapshot
```

`pipeline.build` refuses to write anything if the contract checks in `pipeline/validate.py` fail.

## Data sources and licenses

- [UFC-Almanac](https://github.com/Sam-Armstrong/UFC-Almanac) (MIT): fights, per-fight stats and career profiles.
- [UFC Data: Stats & Rankings & Betting Odds](https://www.kaggle.com/datasets/jerzyszocik/ufc-fight-forecast-complete-gold-modeling-dataset) by jerzyszocik (CC0 1.0): division, gender, odds, nickname, date of birth.
- [Ultimate UFC Dataset](https://www.kaggle.com/datasets/mdabbert/ultimate-ufc-dataset) by Matt Dabbert (CC BY 4.0): fallback odds.

Code under the [MIT License](LICENSE).
