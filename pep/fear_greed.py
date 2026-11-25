"""CNN Fear & Greed Index.

Live data: CNN's (unofficial) dataviz endpoint. There is no official API. If CNN
blocks us, we fall back to the last good response cached on disk and flag it stale.

History before CNN's real data starts (2021-01-22) comes from a community archive
(github.com/Benny2000/fear-greed-data, saved in data/). It matches CNN within
~0.7 pts on average where they overlap (2021-2023); pre-2021 values reflect CNN's
older version of the index and can't be verified against CNN directly.
"""
import json
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import requests

URL = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata/{start}"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    "Accept": "application/json",
    "Referer": "https://www.cnn.com/markets/fear-and-greed",
    "Origin": "https://www.cnn.com",
}
# CNN's endpoint fills Jul 2020 - Jan 21 2021 with a flat 50.0 placeholder.
CNN_REQUEST_START = "2021-01-01"


def _read_one(path: Path) -> pd.Series:
    if not path.exists():
        return pd.Series(dtype=float)
    df = pd.read_csv(path)
    s = pd.Series(df["Fear Greed"].astype(float).values,
                  index=pd.to_datetime(df["Date"], format="mixed")).sort_index()
    return s[~s.index.duplicated(keep="last")].dropna()


def load_archive(path: Path) -> pd.Series:
    """Primary archive, with holes filled from fng_archive_backup_*.csv if present
    (the primary is missing ~Jun 8 - Jul 8 2020; the backup has it)."""
    s = _read_one(path)
    for backup in sorted(path.parent.glob("fng_archive_backup_*.csv")):
        s = s.combine_first(_read_one(backup))
    return s


def strip_placeholder(s: pd.Series) -> pd.Series:
    """Drop the leading run of exact-50.0 filler values CNN returns for early dates."""
    real = s[s != 50.0]
    return s[s.index >= real.index[0]] if len(real) else s.iloc[0:0]


def fetch_fear_greed(cache_path: Path, archive_path: Path | None = None) -> dict:
    """Returns {score, rating, timestamp, history, stale, error, cnn_start, archive_until}."""
    raw, stale, error = None, False, None
    try:
        r = requests.get(URL.format(start=CNN_REQUEST_START), headers=HEADERS, timeout=20)
        if r.status_code >= 500:
            fallback = (date.today() - timedelta(days=400)).isoformat()
            r = requests.get(URL.format(start=fallback), headers=HEADERS, timeout=20)
        r.raise_for_status()
        raw = r.json()
        cache_path.write_text(json.dumps(raw))
    except Exception as e:  # network, 403, bad JSON...
        error = f"{type(e).__name__}: {e}"
        if cache_path.exists():
            raw, stale = json.loads(cache_path.read_text()), True

    archive = load_archive(archive_path) if archive_path else pd.Series(dtype=float)

    if raw is None:
        return {"score": None, "rating": None, "timestamp": None, "history": archive,
                "stale": True, "error": error, "cnn_start": None,
                "archive_until": archive.index[-1].date().isoformat() if len(archive) else None}

    now = raw["fear_and_greed"]
    hist = raw.get("fear_and_greed_historical", {}).get("data", [])
    cnn = pd.Series(
        {pd.to_datetime(p["x"], unit="ms").normalize(): float(p["y"]) for p in hist},
        dtype=float,
    ).sort_index()
    cnn = strip_placeholder(cnn[~cnn.index.duplicated(keep="last")])

    # Archive fills everything before CNN's first real value; CNN wins from then on.
    if len(cnn) and len(archive):
        older = archive[archive.index < cnn.index[0]]
        history = pd.concat([older, cnn])
        archive_until = older.index[-1].date().isoformat() if len(older) else None
    else:
        history = cnn if len(cnn) else archive
        archive_until = None

    return {
        "score": float(now["score"]),
        "rating": now.get("rating"),
        "timestamp": now.get("timestamp"),
        "previous_close": now.get("previous_close"),
        "previous_1_week": now.get("previous_1_week"),
        "previous_1_month": now.get("previous_1_month"),
        "previous_1_year": now.get("previous_1_year"),
        "history": history,
        "stale": stale,
        "error": error,
        "cnn_start": cnn.index[0].date().isoformat() if len(cnn) else None,
        "archive_until": archive_until,
    }
