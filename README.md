# Pep Capital Buy Signal

**Live dashboard: https://will-england.github.io/pep-cap-indicator/**

A tongue-in-cheek (but real) "buy the fear" indicator. Four signals each score 0–3 points. The total (0–12) maps to a tier:

| Score | Tier |
|---|---|
| 0–2 | 🌱 Touch Grass |
| 3–5 | 🗣️ Pep Talk |
| 6–8 | 📣 Pep Rally |
| 9–12 | 🚛 BACK UP THE TRUCK |

Not financial advice.

---

## ⚠️ Before you change anything: `git pull`

A GitHub Actions bot commits fresh data to `main` **every weekday**. Your local copy falls behind daily, so always start with:

```
git pull
```

If a push gets rejected ("fetch first"), run `git pull --rebase` and push again.

---

## The signals

| Signal | Scoring (default) | Source |
|---|---|---|
| **VIX** | ≥40 → +3, ≥30 → +2, ≥25 → +1. An intraday **spike** ≥40 in the last 5 days also scores +3 (the higher rule wins; max is 3) | Yahoo Finance `^VIX` |
| **CNN Fear & Greed** | <10 → +3, <25 → +2, ≤45 → +1 | CNN's unofficial endpoint from 2021-01-22, with a cached fallback if blocked. Before that, community archives back to 2011 (see below) |
| **% of S&P 500 above 200-day MA** | ≤30% → +3, ≤40% → +2, ≤50% → +1 | Computed: constituents from Wikipedia, prices from Yahoo |
| **Good companies at 200-week MA** | ≥50% of the list → +3, ≥25% → +2, ≥1 name → +1 | Computed from the `watchlist` in `config.yaml` |

**Good companies details:**
- A name counts if its price is **below** its 200-week MA, or **within 5%** above it.
- Names more than **20% below** are flagged 🔪 *falling knife?* in the table. They still count toward the score.
- Names with less than 200 weeks of trading history (e.g. RDDT, GEV, ARM) show as *too young* and are skipped.

## Dashboard features

- **Gauge and tier:** today's score and verdict.
- **Signal cards:** the current value, its points, which rule it's hitting, and a history chart.
- **Range picker** (6M / 1Y / 2Y / 5Y / 10Y / All): sets the range for every chart. Add `?range=All` (or `5Y`, etc.) to the URL to open on a given range.
- **Pep Score history** with the S&P 500 underneath, back to January 2011.
- **"If you'd bought…":** click any day on the score or S&P chart to see the S&P 500's return 1 month, 3 months, 6 months and 1 year later, to today, and its worst dip in the following year.
- **"Does buying the fear actually work?":** average forward S&P returns by tier, compared with buying on any day.
- **Shopping list:** every watchlist name's distance from its 200-week MA.
- **Light and dark mode:** follows your system setting, with a toggle in the top right.

## How it runs (GitHub Pages + Actions)

`.github/workflows/update.yml`:
1. Runs every **weekday at 21:30 UTC** (4:30pm ET in winter, 5:30pm ET in summer), on **every push to `main`**, and on demand.
2. Runs `update.py` to fetch, score and write the data files.
3. Commits the refreshed data back to `main` as `github-actions[bot]`.
4. Deploys `site/` to GitHub Pages.

**Manual refresh:** repo → **Actions** → *Update Pep Signal* → **Run workflow**.

**If the "Updated" time on the site stops changing:** GitHub can disable scheduled workflows in public repos after 60 days without activity. Check the Actions tab and re-enable the workflow if needed.

**If the site shows this README instead of the dashboard:** the Pages source got reset to "Deploy from a branch". This happens if the repo is made private and then public again. Fix it in either place, then run the workflow:
- **Website:** repo **Settings → Pages → Build and deployment → Source: GitHub Actions**
- **Command line:** `gh api -X PUT repos/will-england/pep-cap-indicator/pages -f build_type=workflow`

## Making changes

```
git pull                      # always first
# edit config.yaml / code
git add -A
git commit -m "Add XYZ to watchlist"
git push                      # the site rebuilds and redeploys in about a minute
```

Everything arguable lives in **`config.yaml`**:
- signal thresholds and points
- `near_pct` (5%) and `knife_pct` (20%) for the 200-week rule
- tier names, emoji and taglines
- the watchlist
- `history_start` (how far back the history goes)

## Run it locally

Double-click **`update.bat`** (Windows). It sets up a Python venv on first run, fetches everything (about 1 minute) and opens the dashboard.

Or manually:
```
py -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python update.py
```
then open `site/index.html`.

A local run changes the files in `data/` and `site/data.js`. You don't need to commit them, because the bot regenerates them. If you do commit them, `git pull` first.

## Files

- `update.py`: orchestrates the fetchers, scores everything, and writes `site/data.js`, `data/latest.json` and `data/history.csv`
- `pep/market.py`: VIX and S&P 500 index
- `pep/fear_greed.py`: CNN live data, merged with the archives
- `pep/breadth.py`: % of S&P 500 above the 200-day MA
- `pep/wma200.py`: watchlist vs 200-week MA
- `pep/score.py`: rules → points → tier
- `site/`: static dashboard (plain HTML/CSS/JS, no build step, no external libraries)
- `data/cache_*.json`: last good CNN and S&P-constituent responses, used as a fallback if a source blocks the bot. Committed on purpose.
- `data/fng_archive_*.csv`: historical Fear & Greed archives

## Data caveats

- **Fear & Greed before 2021-01-22 is unofficial.** CNN's endpoint only has real data from that date (earlier dates return a flat 50 placeholder).
  - Earlier values come from [Benny2000/fear-greed-data](https://github.com/Benny2000/fear-greed-data), with a June 2020 gap filled from [hackingthemarkets](https://github.com/hackingthemarkets/sentiment-fear-and-greed).
  - Where the archive overlaps CNN (2021–2023), it matches within ~0.7 points on average.
  - Before 2021 it reflects CNN's older version of the index and can't be checked against CNN directly.
- **Breadth uses today's S&P 500 members for every year** (survivorship bias). It gets less accurate the further back you go.
- **Moving averages use dividend-adjusted prices.** They can sit slightly below what charting sites show, which use split-adjusted prices only (e.g. NVDA's 200-week MA: 124.51 here vs 124.78 on TradingView). The gap is bigger for high-dividend stocks.
- **Weekly bars are grouped into calendar weeks.** Yahoo sometimes dates one ticker's weekly bars on a different weekday, so the code groups everything by week before averaging.
- **The returns table is a small sample:** about 6 real selloffs since 2011 drive the top tier, and consecutive days overlap heavily. The thresholds were also chosen with hindsight.
