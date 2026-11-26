"""Sector tags for watchlist tickers.

Looked up from Yahoo once per ticker and cached in data/cache_sectors.json, so
daily runs only hit Yahoo for newly added names. Config overrides win.
"""
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import yfinance as yf

# Yahoo's sector names -> the GICS-style names people know
RENAME = {
    "Financial Services": "Financials",
    "Basic Materials": "Materials",
    "Consumer Cyclical": "Consumer Discretionary",
    "Consumer Defensive": "Consumer Staples",
    "Healthcare": "Health Care",
}


def _lookup(ticker: str) -> str | None:
    try:
        s = yf.Ticker(ticker).info.get("sector")
        return RENAME.get(s, s) if s else None
    except Exception:
        return None


def get_sectors(tickers: list[str], cache_path: Path, overrides: dict | None = None) -> dict[str, str]:
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    missing = [t for t in tickers if not cache.get(t)]
    if missing:
        with ThreadPoolExecutor(8) as ex:
            for t, s in zip(missing, ex.map(_lookup, missing)):
                if s:
                    cache[t] = s
        cache_path.write_text(json.dumps(dict(sorted(cache.items())), indent=1))
    out = {t: cache.get(t) or "Other" for t in tickers}
    out.update({t: s for t, s in (overrides or {}).items() if t in out})
    return out
