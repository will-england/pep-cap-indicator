"""VIX and S&P 500 index levels from Yahoo Finance."""
import pandas as pd
import yfinance as yf


def _clean(df: pd.DataFrame) -> pd.DataFrame:
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    df.index = pd.to_datetime(df.index).tz_localize(None).normalize()
    return df.dropna(how="all")


def fetch_vix(start: str) -> pd.DataFrame:
    """Daily OHLC for ^VIX."""
    df = yf.download("^VIX", start=start, interval="1d", auto_adjust=False, progress=False)
    df = _clean(df)
    if df.empty:
        raise RuntimeError("No VIX data returned from Yahoo")
    return df[["High", "Close"]]


def fetch_spx(start: str) -> pd.Series:
    df = yf.download("^GSPC", start=start, interval="1d", auto_adjust=False, progress=False)
    df = _clean(df)
    return df["Close"]
