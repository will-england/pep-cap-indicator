# Pep Capital Buy Signal

**Live dashboard: https://will-england.github.io/pep-cap-indicator/**

A tongue-in-cheek (but real) "buy the fear" indicator, styled as a trading terminal. Four signals each score 0–3 points. The total (0–12) maps to a tier:

| Score | Tier |
|---|---|
| 0–2 | Touch Grass |
| 3–5 | Pep Talk |
| 6–8 | Pep Rally |
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
| **The Pep List at 200-week MA** | ≥50% of the list → +3, ≥25% → +2, ≥3 names → +1 | Computed from the `watchlist` in `config.yaml` |

### The Pep List

Our hand-picked watchlist (the `watchlist` in `config.yaml`).

- **About 113 names across all 11 sectors.** Each gets a sector tag, looked up from Yahoo and cached.
- **What counts as a hit:** price **below** its 200-week MA, or **within 5%** above it.
- **Falling knives:** names more than **20% below** are flagged *KNIFE?* in the table. They still count toward the score.
- **Too young:** names with less than 200 weeks of trading history (e.g. RDDT, GEV, ARM, SNDK, CRCL, NBIS, CRWV) show as *TOO YOUNG* and are skipped until they have enough.
- **+1 needs at least 3 names.** With a list this size, at least one name is almost always near its 200-week MA.

## Dashboard tour

The page is laid out like a trading terminal ("Midnight Wire" theme): navy panels with blue header strips, amber values, IBM Plex Sans for labels and IBM Plex Mono for numbers.

**Top bar**
- **Command bar** with a live New York clock.
- **Function keys:** `1) SCORE … 99) HELP` jump to each section and stay pinned while you scroll.
- **Range picker** (6M / 1Y / 2Y / 5Y / 10Y / All): sets the range for every chart.
- **Ticker tape:** scrolls SPX, VIX, Fear & Greed, breadth, the Pep Score and the names nearest their 200-week MA.
- **Keyboard:** **F1** opens help, **Esc** scrolls back to the top.

**Panels**
| Panel | What it shows |
|---|---|
| **01) Pep Score** | A 12-segment meter, today's score, tier and tagline, and the tier ladder |
| **02) Signal monitor** | Each signal's last value, the rule it's hitting, its points and a 1-year sparkline |
| **03A–D) Signals** | One panel per signal: current value, a history chart with threshold lines, its scoring rules (the hit rule highlighted) and a short explanation |
| **04) Pep Score history** | Daily score back to January 2011, with the S&P 500 underneath. **Click any day** to see what buying the S&P then returned: 1M, 3M, 6M and 1Y later, to today, and the worst dip in the following year |
| **05) Does buying the fear work?** | Average forward S&P returns, day count and 1-year win rate. Switch views: **by tier**, **by total score (0–12)**, or **by each signal's points** (+3/+2/+1/0) |
| **06) The Pep List** | Every Pep List name with sector, price, 200-week MA, a distance bar and status. **Sector chips** show hits per sector (e.g. "Health Care 4/11") and filter the table; a checkbox shows only names at or below |
| **99) Help** | Plain-English explanation of the scoring, tiers and data |

**Link options:** add these to the URL to open on a specific view:
- `?range=5Y` (or `6M`, `1Y`, `2Y`, `10Y`, `All`)
- `?stats=vix` (or `tiers`, `score`, `fear_greed`, `breadth`, `wma200`)

For example: `https://will-england.github.io/pep-cap-indicator/?range=All&stats=score`

## How it runs (GitHub Pages + Actions)

`.github/workflows/update.yml` has two jobs:
1. **build**: runs every **weekday at 21:30 UTC** (4:30pm ET in winter, 5:30pm ET in summer), on **every push to `main`**, and on demand.
   - Runs `update.py` to fetch, score and write the data files.
   - Commits the refreshed data back to `main` as `github-actions[bot]`.
   - Packages `site/` for Pages.
2. **deploy**: publishes the packaged site to GitHub Pages.

**Manual refresh:** repo → **Actions** → *Update Pep Signal* → **Run workflow**.

**If the "Updated" time on the site stops changing:** GitHub can disable scheduled workflows in public repos after 60 days without activity. Check the Actions tab and re-enable the workflow if needed.

**If the site shows this README instead of the dashboard:** the Pages source got reset to "Deploy from a branch". This happens if the repo is made private and then public again. Fix it in either place, then run the workflow:
- **Website:** repo **Settings → Pages → Build and deployment → Source: GitHub Actions**
- **Command line:** `gh api -X PUT repos/will-england/pep-cap-indicator/pages -f build_type=workflow`

**Friends not seeing a change?** Browsers cache the page. A hard refresh fixes it (Ctrl+F5, or pull-to-refresh on a phone).

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
- tier names, emoji (blank except 🚛) and taglines
- the watchlist. Sector tags are looked up automatically and cached in `data/cache_sectors.json`; fix any wrong one under `sector_overrides`.
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

- `update.py`: orchestrates the fetchers, scores everything (including each signal's daily points), and writes `site/data.js`, `data/latest.json` and `data/history.csv`
- `pep/market.py`: VIX and S&P 500 index
- `pep/fear_greed.py`: CNN live data, merged with the archives
- `pep/breadth.py`: % of S&P 500 above the 200-day MA
- `pep/wma200.py`: watchlist vs 200-week MA
- `pep/sectors.py`: sector tags for the watchlist (cached, with config overrides)
- `pep/score.py`: rules → points → tier
- `site/`: static dashboard (plain HTML/CSS/JS, no build step, no JS libraries; fonts load from Google Fonts)
- `data/cache_*.json`: last good CNN, S&P-constituent and sector responses, used as a fallback if a source blocks the bot. Committed on purpose.
- `data/fng_archive_*.csv`: historical Fear & Greed archives

## Data caveats

- **Fear & Greed before 2021-01-22 is unofficial.** CNN's endpoint only has real data from that date (earlier dates return a flat 50 placeholder).
  - Earlier values come from [Benny2000/fear-greed-data](https://github.com/Benny2000/fear-greed-data), with a June 2020 gap filled from [hackingthemarkets](https://github.com/hackingthemarkets/sentiment-fear-and-greed).
  - Where the archive overlaps CNN (2021–2023), it matches within ~0.7 points on average.
  - Before 2021 it reflects CNN's older version of the index and can't be checked against CNN directly.
- **Breadth uses today's S&P 500 members for every year** (survivorship bias). It gets less accurate the further back you go.
- **The watchlist is today's list applied to every year.** Names that went bad and were dropped aren't in the history, which flatters the 200-week signal.
- **Moving averages use dividend-adjusted prices.** They can sit slightly below what charting sites show, which use split-adjusted prices only (e.g. NVDA's 200-week MA: 124.51 here vs 124.78 on TradingView). The gap is bigger for high-dividend stocks.
- **Weekly bars are grouped into calendar weeks.** Yahoo sometimes dates one ticker's weekly bars on a different weekday, so the code groups everything by week before averaging.
- **The returns table is a small sample:** about 6 real selloffs since 2011 drive the top tier, and consecutive days overlap heavily. The thresholds were also chosen with hindsight.
  - Looked at signal by signal, **Fear & Greed is the weakest on its own**; VIX, breadth and the 200-week MA carry most of the signal.
