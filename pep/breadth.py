"""% of S&P 500 members trading above their 200-day simple moving average.

Computed ourselves: constituents from Wikipedia, prices from Yahoo.
Note: uses *today's* constituents for the whole history (survivorship bias),
which is fine for a 1-year chart.
"""
import io
import json
from pathlib import Path

import pandas as pd
import requests
import yfinance as yf

WIKI = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"


def sp500_tickers(cache_path: Path) -> list[str]:
    try:
        html = requests.get(WIKI, headers={"User-Agent": "pep-cap-indicator/0.1"}, timeout=20).text
        table = pd.read_html(io.StringIO(html), attrs={"id": "constituents"})[0]
        tickers = sorted(table["Symbol"].str.replace(".", "-", regex=False).tolist())
        if len(tickers) < 450:
            raise ValueError(f"only {len(tickers)} tickers parsed")
        cache_path.write_text(json.dumps(tickers))
        return tickers
    except Exception:
        if cache_path.exists():
            return json.loads(cache_path.read_text())
        raise


def fetch_breadth(cache_path: Path, start: str, window: int = 200) -> dict:
    tickers = sp500_tickers(cache_path)
    # ~200 trading days of warm-up before `start` so the MA exists from day one
    dl_start = (pd.Timestamp(start) - pd.Timedelta(days=320)).date().isoformat()
    px = yf.download(tickers, start=dl_start, interval="1d", auto_adjust=True,
                     progress=False, threads=True)["Close"]
    px.index = pd.to_datetime(px.index).tz_localize(None).normalize()
    px = px.dropna(how="all")
    # Drop the last row if it's mostly empty (partial intraday data for many names)
    if px.iloc[-1].notna().sum() < 0.8 * px.shape[1]:
        px = px.iloc[:-1]

    sma = px.rolling(window, min_periods=window).mean()
    valid = sma.notna() & px.notna()
    above = (px > sma) & valid
    pct = (above.sum(axis=1) / valid.sum(axis=1).replace(0, pd.NA) * 100).dropna().astype(float)

    return {
        "pct_above": float(pct.iloc[-1]),
        "as_of": pct.index[-1].date().isoformat(),
        "n_counted": int(valid.iloc[-1].sum()),
        "n_total": len(tickers),
        "history": pct,
    }
