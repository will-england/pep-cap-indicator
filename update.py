"""Pep Capital Buy Signal — fetch all signals, score them, write the dashboard data.

Usage:  .venv\\Scripts\\python update.py
Writes: site/data.js (loaded by site/index.html), data/latest.json, data/history.csv
"""
import json
import math
import traceback
from datetime import datetime
from pathlib import Path

import pandas as pd
import yaml

from pep.breadth import fetch_breadth
from pep.fear_greed import fetch_fear_greed
from pep.market import fetch_spx, fetch_vix
from pep.score import match_level, score_vix, tier_for
from pep.wma200 import fetch_wma

ROOT = Path(__file__).parent
DATA = ROOT / "data"
SITE = ROOT / "site"
DATA.mkdir(exist_ok=True)
SITE.mkdir(exist_ok=True)


def clean(x):
    """Make values JSON-safe (NaN -> None, numpy -> python)."""
    if isinstance(x, dict):
        return {k: clean(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [clean(v) for v in x]
    if hasattr(x, "item"):
        x = x.item()
    if isinstance(x, float) and (math.isnan(x) or math.isinf(x)):
        return None
    return x


def step(name, fn, warnings):
    print(f"  - {name}...", flush=True)
    try:
        return fn()
    except Exception as e:
        traceback.print_exc()
        warnings.append(f"{name} failed: {type(e).__name__}: {e}")
        return None


def main():
    cfg = yaml.safe_load((ROOT / "config.yaml").read_text(encoding="utf-8"))
    sc = cfg["signals"]
    watchlist = list(dict.fromkeys(cfg["watchlist"]))
    warnings: list[str] = []
    hist_start = pd.Timestamp(str(cfg.get("history_start", "2021-01-04")))
    hs = hist_start.date().isoformat()
    pre = (hist_start - pd.Timedelta(days=30)).date().isoformat()

    print(f"Fetching signals (history from {hs}):")
    vix = step("VIX", lambda: fetch_vix(pre), warnings)
    spx = step("S&P 500 index", lambda: fetch_spx(pre), warnings)
    fng = step("CNN Fear & Greed", lambda: fetch_fear_greed(DATA / "cache_fear_greed.json",
                                                             DATA / "fng_archive_2011_2023.csv"), warnings)
    br = step("S&P 500 breadth (~500 tickers)", lambda: fetch_breadth(DATA / "cache_sp500_tickers.json", hs), warnings)
    wma = step(f"200-week MAs ({len(watchlist)} tickers)",
               lambda: fetch_wma(watchlist, sc["wma200"]["near_pct"], hs,
                                 sc["wma200"].get("knife_pct", 20)), warnings)

    if fng and fng.get("stale"):
        warnings.append(f"Fear & Greed is from cache (live fetch failed: {fng.get('error')})")

    # ---------- current readings ----------
    signals = {}

    lb = sc["vix"]["spike"]["lookback_days"]
    if vix is not None:
        v_close = float(vix["Close"].iloc[-1])
        v_high = float(vix["High"].iloc[-lb:].max())
        pts, spike = score_vix(sc["vix"], v_close, v_high)
        signals["vix"] = dict(value=v_close, points=pts, spike=spike, recent_high=v_high,
                              as_of=vix.index[-1].date().isoformat(),
                              detail=f"{lb}-day high {v_high:.1f}" + (" — SPIKE!" if spike else ""))
    else:
        signals["vix"] = dict(value=None, points=0)

    if fng and fng.get("score") is not None:
        signals["fear_greed"] = dict(
            value=fng["score"], points=match_level(sc["fear_greed"]["levels"], fng["score"]),
            rating=fng["rating"], stale=fng["stale"], as_of=(fng["timestamp"] or "")[:10],
            detail=f"{(fng['rating'] or '').title()} · 1w ago {fng['previous_1_week']:.0f} · 1m ago {fng['previous_1_month']:.0f}"
            if fng.get("previous_1_week") is not None else (fng["rating"] or ""))
    else:
        signals["fear_greed"] = dict(value=None, points=0)

    if br:
        signals["breadth"] = dict(value=br["pct_above"], points=match_level(sc["breadth"]["levels"], br["pct_above"]),
                                  as_of=br["as_of"], detail=f"{br['n_counted']} of {br['n_total']} members counted")
    else:
        signals["breadth"] = dict(value=None, points=0)

    if wma:
        signals["wma200"] = dict(value=wma["pct_hits"],
                                 points=match_level(sc["wma200"]["levels"], wma["pct_hits"], wma["n_hits"]),
                                 count=wma["n_hits"], eligible=wma["n_eligible"], as_of=wma["as_of"],
                                 knives=wma["n_knives"],
                                 detail=f"{wma['n_hits']} of {wma['n_eligible']} names within {sc['wma200']['near_pct']}% or below"
                                        + (f" · {wma['n_knives']} 🔪 >{sc['wma200'].get('knife_pct', 20)}% below" if wma["n_knives"] else ""))
    else:
        signals["wma200"] = dict(value=None, points=0)

    for k, s in signals.items():
        s.update(label=sc[k]["label"], blurb=sc[k]["blurb"], levels=sc[k]["levels"])
    signals["vix"]["spike_rule"] = sc["vix"]["spike"]

    total = sum(s["points"] for s in signals.values())
    tier = tier_for(cfg["tiers"], total)

    # ---------- daily score history ----------
    hist = {}
    if vix is not None:
        idx = vix.index[vix.index >= hist_start]
        h = pd.DataFrame(index=idx)
        h["vix"] = vix["Close"].reindex(idx)
        h["vix_hi"] = vix["High"].rolling(lb, min_periods=1).max().reindex(idx)
        # ffill only within the F&G data range — never back-fill before CNN's first date
        h["fng"] = fng["history"].reindex(idx, method="ffill", limit=5) if fng and not fng["history"].empty else None
        h["breadth"] = br["history"].reindex(idx, method="ffill") if br else None
        if wma:
            h["wma"] = wma["history"].reindex(idx, method="ffill")
            h["wma_n"] = wma["history_counts"].reindex(idx, method="ffill")
        else:
            h["wma"] = h["wma_n"] = None
        h["spx"] = spx.reindex(idx, method="ffill") if spx is not None else None

        def row_score(r):
            p = score_vix(sc["vix"], r.vix, r.vix_hi)[0]
            p += match_level(sc["fear_greed"]["levels"], None if pd.isna(r.fng) else r.fng)
            p += match_level(sc["breadth"]["levels"], None if pd.isna(r.breadth) else r.breadth)
            p += match_level(sc["wma200"]["levels"], None if pd.isna(r.wma) else r.wma,
                             None if pd.isna(r.wma_n) else r.wma_n)
            return p

        h["score"] = h.apply(row_score, axis=1)
        h.iloc[-1, h.columns.get_loc("score")] = total  # today uses the freshest readings
        hist = {"dates": [d.date().isoformat() for d in h.index]}
        for col in ["score", "vix", "fng", "breadth", "wma", "spx"]:
            hist[col] = [None if pd.isna(v) else round(float(v), 2) for v in h[col]]

    out = clean({
        "generated_at": datetime.now().astimezone().isoformat(timespec="minutes"),
        "total": total,
        "max_total": 12,
        "tier": tier,
        "tiers": cfg["tiers"],
        "signals": signals,
        "near_pct": sc["wma200"]["near_pct"],
        "knife_pct": sc["wma200"].get("knife_pct", 20),
        "fng_archive_until": fng.get("archive_until") if fng else None,
        "fng_cnn_start": fng.get("cnn_start") if fng else None,
        "watchlist": wma["rows"] if wma else [],
        "history": hist,
        "warnings": warnings,
    })

    (DATA / "latest.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    (SITE / "data.js").write_text("window.PEP_DATA = " + json.dumps(out) + ";\n", encoding="utf-8")

    # Append today's snapshot to a running log (one row per date)
    log = DATA / "history.csv"
    today = pd.DataFrame([{
        "date": datetime.now().date().isoformat(), "total": total, "tier": tier["name"],
        **{f"{k}_value": s.get("value") for k, s in signals.items()},
        **{f"{k}_points": s["points"] for k, s in signals.items()},
    }])
    if log.exists():
        old = pd.read_csv(log)
        today = pd.concat([old[old["date"] != today["date"][0]], today])
    today.to_csv(log, index=False)

    print(f"\nPep Score: {total}/12 -> {tier['emoji']} {tier['name']}")
    for k, s in signals.items():
        v = "n/a" if s["value"] is None else f"{s['value']:.1f}"
        print(f"  {s['label']:<36} {v:>7}   +{s['points']}")
    for w in warnings:
        print(f"  ! {w}")
    print(f"\nOpen site/index.html to view the dashboard.")


if __name__ == "__main__":
    main()
