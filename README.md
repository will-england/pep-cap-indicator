# Pep Capital Buy Signal

A tongue-in-cheek (but real) "buy the dip" indicator. Four signals each score 0–3 points; the total (0–12) maps to a tier from **Touch Grass** to **BACK UP THE TRUCK**.

| Signal | Source |
|---|---|
| VIX level / spike above 40 | Yahoo Finance `^VIX` |
| CNN Fear & Greed | CNN's unofficial dataviz endpoint from 2021-01-22 (cached fallback if blocked). Before that: community archives in `data/fng_archive_*.csv` ([Benny2000](https://github.com/Benny2000/fear-greed-data), gaps filled from [hackingthemarkets](https://github.com/hackingthemarkets/sentiment-fear-and-greed)), back to 2011 |
| % of S&P 500 above 200-day MA | Computed: Wikipedia constituents + Yahoo prices |
| Good companies at 200-week MA | Computed from the watchlist in `config.yaml` |

## Run it

Double-click **`update.bat`** (Windows). It sets up Python on first run, fetches everything (~1–2 min), and opens the dashboard.

Or manually:
```
.venv\Scripts\python update.py
```
then open `site/index.html`.

## Hosting

The live dashboard is published with GitHub Pages. `.github/workflows/update.yml` runs every weekday at 21:30 UTC (after the US close):
it runs `update.py`, commits the refreshed data, and redeploys `site/`. It also runs on every push to `main`,
and you can trigger it any time from the repo's **Actions** tab → *Update Pep Signal* → **Run workflow**.

## Tweak it

Everything arguable lives in **`config.yaml`**: thresholds, points, tier names/taglines, and the watchlist.

## Files

- `update.py`: fetches, scores, writes `site/data.js`, `data/latest.json`, `data/history.csv`
- `pep/`: one module per data source + scoring
- `site/`: static dashboard (no build step, no external libraries)

Not financial advice.
