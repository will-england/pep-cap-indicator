"""Distance of each watchlist name from its 200-week simple moving average."""
import pandas as pd
import yfinance as yf

WEEKS = 200


def status_for(d: float, near_pct: float, knife_pct: float) -> str:
    if d <= -knife_pct:
        return "knife"   # far below: counts as a hit, but flagged as a possible falling knife
    if d <= 0:
        return "below"
    return "at" if d <= near_pct else "above"


HIT_STATUSES = ("knife", "below", "at")


def fetch_wma(tickers: list[str], near_pct: float, start: str, knife_pct: float = 20) -> dict:
    # 200 weeks of warm-up before `start` (plus a buffer)
    dl_start = (pd.Timestamp(start) - pd.Timedelta(weeks=WEEKS + 10)).date().isoformat()
    px = yf.download(tickers, start=dl_start, interval="1wk", auto_adjust=True,
                     progress=False, threads=True)["Close"]
    if isinstance(px, pd.Series):
        px = px.to_frame(tickers[0])
    px.index = pd.to_datetime(px.index).tz_localize(None).normalize()
    # Yahoo sometimes anchors one ticker's weekly bars on a different weekday
    # (e.g. Tuesdays), which interleaves rows and breaks the rolling window.
    # Collapse everything onto one row per calendar week (Mon-Sun).
    px = px.groupby(px.index.to_period("W-SUN")).last()
    px.index = px.index.start_time
    px = px.dropna(how="all")

    wma = px.rolling(WEEKS, min_periods=WEEKS).mean()

    rows = []
    for t in tickers:
        if t not in px.columns or px[t].dropna().empty:
            rows.append({"ticker": t, "price": None, "wma200": None, "dist_pct": None,
                         "weeks": 0, "status": "no data"})
            continue
        s = px[t].dropna()
        w = wma[t].dropna()
        price = float(s.iloc[-1])
        if w.empty:
            rows.append({"ticker": t, "price": round(price, 2), "wma200": None, "dist_pct": None,
                         "weeks": int(len(s)), "status": "too young"})
            continue
        m = float(w.iloc[-1])
        d = (price / m - 1) * 100
        rows.append({
            "ticker": t,
            "price": round(price, 2),
            "wma200": round(m, 2),
            "dist_pct": round(d, 2),
            "weeks": int(len(s)),
            "status": status_for(d, near_pct, knife_pct),
        })

    # Weekly history of "% of eligible names at/below 200WMA" for the trend chart
    dist = (px / wma - 1) * 100
    eligible = dist.notna()
    hits = (dist <= near_pct) & eligible
    pct_hist = (hits.sum(axis=1) / eligible.sum(axis=1).replace(0, pd.NA) * 100).dropna().astype(float)

    eligible_rows = [r for r in rows if r["dist_pct"] is not None]
    hit_rows = [r for r in eligible_rows if r["status"] in HIT_STATUSES]
    return {
        "rows": sorted(rows, key=lambda r: (r["dist_pct"] is None, r["dist_pct"] if r["dist_pct"] is not None else 0)),
        "n_eligible": len(eligible_rows),
        "n_hits": len(hit_rows),
        "n_knives": sum(r["status"] == "knife" for r in hit_rows),
        "pct_hits": (len(hit_rows) / len(eligible_rows) * 100) if eligible_rows else 0.0,
        "history": pct_hist,
        "history_counts": hits.sum(axis=1).loc[pct_hist.index],
        "as_of": px.index[-1].date().isoformat(),
    }
