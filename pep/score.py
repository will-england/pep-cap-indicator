"""Turn raw signal values into points and a tier."""


def match_level(levels: list[dict], value, count=None) -> int:
    if value is None:
        return 0
    for lvl in levels:
        ok = True
        if "min" in lvl and not value >= lvl["min"]:
            ok = False
        if "max" in lvl and not value <= lvl["max"]:
            ok = False
        if "above" in lvl and not value > lvl["above"]:
            ok = False
        if "below" in lvl and not value < lvl["below"]:
            ok = False
        if "min_count" in lvl and not (count is not None and count >= lvl["min_count"]):
            ok = False
        if ok:
            return int(lvl["points"])
    return 0


def score_vix(cfg: dict, close, recent_high) -> tuple[int, bool]:
    pts = match_level(cfg["levels"], close)
    spike = recent_high is not None and recent_high >= cfg["spike"]["level"]
    if spike:
        pts = max(pts, int(cfg["spike"]["points"]))
    return pts, spike


def tier_for(tiers: list[dict], total: int) -> dict:
    for t in sorted(tiers, key=lambda t: -t["min"]):
        if total >= t["min"]:
            return t
    return tiers[-1]
