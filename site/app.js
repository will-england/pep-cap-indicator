(function () {
  "use strict";
  const D = window.PEP_DATA;

  // ---------- theme toggle ----------
  const root = document.documentElement;
  try { const t = localStorage.getItem("pep-theme"); if (t) root.dataset.theme = t; } catch (e) {}
  document.getElementById("theme").addEventListener("click", () => {
    const dark = root.dataset.theme ? root.dataset.theme === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("pep-theme", root.dataset.theme); } catch (e) {}
  });

  if (!D) {
    document.querySelector("main").hidden = true;
    document.getElementById("no-data").hidden = false;
    return;
  }

  // ---------- helpers ----------
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const parseDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const fmtDate = (s) => { const d = parseDate(s); return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; };

  const tiersAsc = [...D.tiers].sort((a, b) => a.min - b.min);
  const tierColor = (t) => `var(--heat-${tiersAsc.findIndex((x) => x.name === t.name)})`;
  const tierFor = (score) => [...tiersAsc].reverse().find((t) => score >= t.min) || tiersAsc[0];

  // ---------- header / warnings ----------
  const gen = new Date(D.generated_at);
  $("#updated").textContent = "Updated " + gen.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  $("#warnings").innerHTML = (D.warnings || []).map((w) => `<div class="warn">⚠️ ${esc(w)}</div>`).join("");

  // ---------- hero ----------
  const tier = D.tier;
  $("#total").textContent = D.total;
  $("#tier-name").textContent = `${tier.emoji} ${tier.name}`;
  $("#tier-name").style.color = tierColor(tier);
  $("#tier-tagline").textContent = tier.tagline;
  $("#ladder").innerHTML = tiersAsc.map((t, i) => {
    const next = tiersAsc[i + 1];
    const range = next ? `${t.min}–${next.min - 1}` : `${t.min}–${D.max_total}`;
    return `<li style="--c:${tierColor(t)}" class="${t.name === tier.name ? "on" : ""}"><b>${esc(t.emoji)} ${esc(t.name)}</b>${range} pts</li>`;
  }).join("");
  drawGauge();

  function drawGauge() {
    const cx = 120, cy = 118, r = 92, max = D.max_total, gap = 0.12;
    const pt = (v) => { const a = Math.PI - (v / max) * Math.PI; return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; };
    const arc = (v0, v1) => { const [x0, y0] = pt(v0), [x1, y1] = pt(v1); return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 0 1 ${x1.toFixed(2)},${y1.toFixed(2)}`; };
    let s = "";
    tiersAsc.forEach((t, i) => {
      const a = t.min + (i ? gap : 0), b = (tiersAsc[i + 1] ? tiersAsc[i + 1].min : max) - (tiersAsc[i + 1] ? gap : 0);
      s += `<path d="${arc(a, b)}" stroke="${tierColor(t)}" stroke-opacity=".22" stroke-width="20" fill="none"/>`;
      const fillTo = Math.min(b, D.total);
      if (fillTo > a) s += `<path d="${arc(a, fillTo)}" stroke="${tierColor(t)}" stroke-width="20" fill="none"/>`;
    });
    const [mx, my] = pt(Math.max(0.05, Math.min(max - 0.05, D.total)));
    s += `<circle cx="${mx}" cy="${my}" r="9" fill="var(--surface)" stroke="var(--text)" stroke-width="3"/>`;
    [0, 3, 6, 9, 12].forEach((v) => {
      const a = Math.PI - (v / max) * Math.PI, rr = r + 20;
      s += `<text x="${cx + rr * Math.cos(a)}" y="${cy - rr * Math.sin(a) + 4}" text-anchor="middle" font-size="10" fill="var(--text-2)">${v}</text>`;
    });
    $("#gauge").innerHTML = s;
  }

  // ---------- line chart (inline SVG, hover crosshair + tooltip) ----------
  function lineChart(el, opts) {
    let o, dates, vals, n;
    const tip = document.createElement("div");
    tip.className = "tip"; tip.hidden = true;
    let geo = null;

    function draw() {
      if (!n) { el.innerHTML = `<p class="hint">No data in this range.</p>`; geo = null; return; }
      const W = el.clientWidth, H = el.clientHeight;
      const m = { l: 38, r: 8, t: 8, b: 22 };
      const finite = vals.filter((v) => v != null);
      const y0 = o.yMin ?? Math.min(...finite), y1 = o.yMax ?? Math.max(...finite);
      const x = (i) => m.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - m.l - m.r));
      const y = (v) => m.t + (1 - (Math.max(y0, Math.min(y1, v)) - y0) / (y1 - y0)) * (H - m.t - m.b);
      geo = { x, y, m, W, H };
      let s = "";

      (o.bands || []).forEach((b) => {
        const top = y(Math.min(y1, b.to)), bot = y(Math.max(y0, b.from));
        s += `<rect x="${m.l}" y="${top}" width="${W - m.l - m.r}" height="${Math.max(0, bot - top)}" fill="${b.fill || "var(--zone)"}" ${b.opacity ? `fill-opacity="${b.opacity}"` : 'class="zone"'}/>`;
      });

      const ticks = o.ticks || [y0, (y0 + y1) / 2, y1];
      ticks.forEach((t) => {
        const yy = y(t), th = (o.thresholds || []).includes(t);
        s += `<line class="${th ? "thresh" : "grid-line"}" x1="${m.l}" x2="${W - m.r}" y1="${yy}" y2="${yy}"/>`;
        s += `<text x="${m.l - 6}" y="${yy + 4}" text-anchor="end">${o.tickFmt ? o.tickFmt(t) : t}</text>`;
      });

      // x labels: month starts (or year starts for long ranges), thinned to fit
      const yearly = n > 600;
      const starts = [];
      for (let i = 1; i < n; i++) {
        const a = yearly ? dates[i].slice(0, 4) : dates[i].slice(5, 7);
        const b = yearly ? dates[i - 1].slice(0, 4) : dates[i - 1].slice(5, 7);
        if (a !== b) starts.push(i);
      }
      const every = Math.max(1, Math.ceil(starts.length / Math.max(2, Math.floor((W - m.l) / 70))));
      starts.forEach((i, k) => {
        if (k % every) return;
        const d = parseDate(dates[i]);
        const lbl = yearly ? String(d.getFullYear())
          : d.getMonth() === 0 ? `${MONTHS[0]} '${String(d.getFullYear()).slice(2)}` : MONTHS[d.getMonth()];
        s += `<text x="${x(i)}" y="${H - 4}" text-anchor="middle">${lbl}</text>`;
      });

      // line (gaps where null; optional step)
      let d = "", pen = false;
      for (let i = 0; i < n; i++) {
        if (vals[i] == null) { pen = false; continue; }
        if (!pen) { d += `M${x(i).toFixed(1)},${y(vals[i]).toFixed(1)}`; pen = true; }
        else if (o.step) d += `H${x(i).toFixed(1)}V${y(vals[i]).toFixed(1)}`;
        else d += `L${x(i).toFixed(1)},${y(vals[i]).toFixed(1)}`;
      }
      s += `<path class="line" d="${d}"/>`;
      if (o.marker != null) {
        const li = o.marker - (o.offset || 0);
        if (li >= 0 && li < n) s += `<line class="pin" x1="${x(li)}" x2="${x(li)}" y1="${m.t}" y2="${H - m.b}"/>`;
      }
      s += `<line class="cross" id="cx" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" visibility="hidden"/>`;
      s += `<circle class="dot" id="cd" r="4.5" visibility="hidden"/>`;

      el.innerHTML = `<svg role="img" aria-label="${esc(o.label || "chart")}">${s}</svg>`;
      el.appendChild(tip);
    }

    function idxAt(ev) {
      if (!geo) return -1;
      const px = ev.clientX - el.getBoundingClientRect().left;
      let i = Math.round(((px - geo.m.l) / (geo.W - geo.m.l - geo.m.r)) * (n - 1));
      i = Math.max(0, Math.min(n - 1, i));
      while (i > 0 && vals[i] == null) i--;
      return vals[i] == null ? -1 : i;
    }

    function hover(ev) {
      const i = idxAt(ev);
      if (i < 0) return leave();
      const X = geo.x(i), Y = geo.y(vals[i]);
      const svg = el.querySelector("svg");
      const cx = svg.querySelector("#cx"), cd = svg.querySelector("#cd");
      cx.setAttribute("x1", X); cx.setAttribute("x2", X); cx.setAttribute("visibility", "visible");
      cd.setAttribute("cx", X); cd.setAttribute("cy", Y); cd.setAttribute("visibility", "visible");
      tip.innerHTML = `<b>${o.fmt(vals[i], i)}</b> <span>· ${fmtDate(dates[i])}</span>`;
      tip.hidden = false;
      tip.style.left = Math.max(70, Math.min(geo.W - 70, X)) + "px";
      tip.style.top = Math.max(30, Y) + "px";
    }
    function leave() {
      tip.hidden = true;
      el.querySelectorAll("#cx,#cd").forEach((e) => e.setAttribute("visibility", "hidden"));
    }

    function set(newOpts) {
      o = newOpts; dates = o.dates; vals = o.values; n = vals.length;
      el.style.cursor = o.onPick ? "pointer" : "";
      leave(); draw();
    }

    el.addEventListener("pointermove", hover);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("click", (ev) => {
      const i = idxAt(ev);
      if (i >= 0 && o.onPick) o.onPick(i + (o.offset || 0));
    });
    set(opts);
    new ResizeObserver(draw).observe(el);
    return { set };
  }

  // ---------- range picker (controls every chart) ----------
  const RANGES = [["6M", 6], ["1Y", 12], ["2Y", 24], ["5Y", 60], ["10Y", 120], ["All", 0]];
  let rangeMonths = 12;
  try { const r = localStorage.getItem("pep-range"); if (r != null && RANGES.some(([, m]) => m === +r)) rangeMonths = +r; } catch (e) {}
  const urlRange = RANGES.find(([l]) => l.toLowerCase() === (new URLSearchParams(location.search).get("range") || "").toLowerCase());
  if (urlRange) rangeMonths = urlRange[1];
  const charts = []; // { chart, build(slice) }

  function sliceFor(months) {
    const H = D.history || {}, dates = H.dates || [];
    if (!dates.length) return { from: 0 };
    if (!months) return { from: 0 };
    const end = parseDate(dates[dates.length - 1]);
    const cut = new Date(end.getFullYear(), end.getMonth() - months, end.getDate());
    const from = dates.findIndex((d) => parseDate(d) >= cut);
    return { from: Math.max(0, from) };
  }
  function sub(arr, sl) { return (arr || []).slice(sl.from); }

  function registerChart(el, build) {
    const chart = lineChart(el, build(sliceFor(rangeMonths)));
    charts.push({ chart, build });
  }
  function setRange(months) {
    rangeMonths = months;
    try { localStorage.setItem("pep-range", String(months)); } catch (e) {}
    const sl = sliceFor(months);
    charts.forEach((c) => c.chart.set(c.build(sl)));
    document.querySelectorAll("#range button").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.m === months)));
  }
  $("#range").innerHTML = RANGES.map(([l, m]) => `<button type="button" data-m="${m}" aria-pressed="${m === rangeMonths}">${l}</button>`).join("");
  $("#range").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setRange(+b.dataset.m); });

  // ---------- signal cards ----------
  const H = D.history || {};
  const SIG = {
    vix:        { key: "vix",     fmt: (v) => v.toFixed(1), unit: "",  yMin: 0, yMax: (h) => Math.max(50, ...h.filter((v) => v != null)) },
    fear_greed: { key: "fng",     fmt: (v) => v.toFixed(0), unit: "/100", yMin: 0, yMax: () => 100 },
    breadth:    { key: "breadth", fmt: (v) => v.toFixed(1) + "%", unit: "", yMin: 0, yMax: () => 100 },
    wma200:     { key: "wma",     fmt: (v) => v.toFixed(1) + "%", unit: " of list", yMin: 0, yMax: (h) => Math.max(60, ...h.filter((v) => v != null)) },
  };

  const levelVal = (l) => l.min ?? l.max ?? l.below ?? l.above;
  const levelText = (l) => {
    if (l.min_count != null) return `≥${l.min_count} name${l.min_count > 1 ? "s" : ""}`;
    if (l.min != null) return `≥${l.min}`;
    if (l.max != null) return `≤${l.max}`;
    if (l.below != null) return `<${l.below}`;
    return `>${l.above}`;
  };

  const sigEl = $("#signals");
  Object.entries(D.signals).forEach(([id, s]) => {
    const cfg = SIG[id];
    const card = document.createElement("div");
    card.className = "card sig";
    const pips = [1, 2, 3].map((p) => `<span class="pip ${s.points >= p ? "on" : ""}"></span>`).join("");
    let rules = s.levels.map((l) => `<span class="rule ${s.points && l.points === s.points ? "hit" : ""}">${levelText(l)} → +${l.points}</span>`).join("");
    if (s.spike_rule) rules += `<span class="rule ${s.spike ? "hit" : ""}">Spike ≥${s.spike_rule.level} in ${s.spike_rule.lookback_days}d → +${s.spike_rule.points}</span>`;
    const badges = (s.spike ? `<span class="badge">SPIKE</span> ` : "") + (s.stale ? `<span class="badge stale">STALE</span>` : "");
    card.innerHTML = `
      <div class="row">
        <span class="label">${esc(s.label)} ${badges}</span>
        <span class="pips" aria-label="${s.points} of 3 points">${pips}<b>+${s.points}</b></span>
      </div>
      <div class="value">${s.value == null ? "n/a" : cfg.fmt(s.value)}<small>${cfg.unit}</small></div>
      <div class="detail">${esc(s.detail || "")}</div>
      <div class="chart"></div>
      <div class="rules">${rules}</div>
      <p class="blurb">${esc(s.blurb)}</p>`;
    sigEl.appendChild(card);

    const series = H[cfg.key];
    const chartEl = card.querySelector(".chart");
    if (!series || !series.some((v) => v != null)) { chartEl.innerHTML = `<p class="hint">No history available.</p>`; return; }

    const strong = s.levels.find((l) => l.points === 2 && l.min_count == null);
    const thresholds = [...new Set(s.levels.filter((l) => l.min_count == null).map(levelVal))];
    registerChart(chartEl, (sl) => {
      const vals = sub(series, sl);
      const yMax = cfg.yMax(vals);
      // shaded zone = where this signal scores 2+ points
      const bands = [];
      if (strong) {
        if (strong.min != null || strong.above != null) bands.push({ from: levelVal(strong), to: yMax });
        else bands.push({ from: 0, to: levelVal(strong) });
      }
      return {
        dates: sub(H.dates, sl), values: vals, yMin: cfg.yMin, yMax, bands, thresholds,
        ticks: [0, ...thresholds].sort((a, b) => a - b), label: s.label,
        fmt: (v) => cfg.fmt(v),
      };
    });
  });

  // ---------- score history + S&P ----------
  // ---------- "if you'd bought" ----------
  const FWD = [["1 month", 21], ["3 months", 63], ["6 months", 126], ["1 year", 252]];
  const spxAt = (i) => (H.spx || [])[i];
  const fwdRet = (i, k) => {
    const a = spxAt(i), b = spxAt(i + k);
    return a != null && b != null ? b / a - 1 : null;
  };
  const worstDip = (i, k = 252) => {
    const a = spxAt(i); if (a == null) return null;
    let lo = a;
    for (let j = i + 1; j <= Math.min(i + k, H.spx.length - 1); j++) if (H.spx[j] != null && H.spx[j] < lo) lo = H.spx[j];
    return lo / a - 1;
  };
  const pct = (r, digits = 1) => r == null ? "—" : `${r >= 0 ? "▲ +" : "▼ "}${(r * 100).toFixed(digits)}%`;
  const cls = (r) => r == null ? "" : r >= 0 ? "pos" : "neg";

  let pinned = null;
  if (H.score && H.score.length) {
    const max = Math.max(...H.score.filter((v) => v != null));
    pinned = H.score.findIndex((v) => v === max);
  }
  const pickOpts = (sl) => ({ offset: sl.from, marker: pinned, onPick: pick });

  function pick(i) {
    pinned = i;
    renderPick();
    setRange(rangeMonths);
  }

  function renderPick() {
    const el = $("#pick");
    if (!el || pinned == null || !H.dates) return;
    const i = pinned, last = H.dates.length - 1;
    const sc = H.score[i], t = tierFor(sc);
    const tiles = FWD.map(([label, k]) => [label + " later", fwdRet(i, k)])
      .concat([["To today", i < last ? spxAt(last) / spxAt(i) - 1 : null], ["Worst dip in next year", worstDip(i)]]);
    el.innerHTML = `
      <div class="pick-head">If you'd bought the S&amp;P 500 on <b>${fmtDate(H.dates[i])}</b>
        <span class="pill" style="--c:${tierColor(t)}">Pep Score ${sc} · ${esc(t.emoji)} ${esc(t.name)}</span>
        <span class="hint">at ${spxAt(i).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
      <div class="tiles">${tiles.map(([l, r]) => `<div class="tile"><span>${l}</span><b class="${cls(r)}">${pct(r)}</b></div>`).join("")}</div>
      <p class="hint">Click any day on the score or S&amp;P chart to pick a different date. "—" means not enough time has passed yet.</p>`;
  }

  function renderStats() {
    const el = $("#stats");
    if (!el || !H.score) return;
    const n = H.score.length;
    const groups = tiersAsc.map((t, gi) => ({
      label: `${t.emoji} ${t.name}`, c: tierColor(t),
      test: (s) => s >= t.min && (!tiersAsc[gi + 1] || s < tiersAsc[gi + 1].min),
    })).reverse();
    groups.push({ label: "Any day (baseline)", c: "var(--text-2)", test: () => true, base: true });

    const rows = groups.map((g) => {
      const idx = [];
      for (let i = 0; i < n; i++) if (H.score[i] != null && g.test(H.score[i])) idx.push(i);
      const cells = FWD.map(([, k]) => {
        const rs = idx.map((i) => fwdRet(i, k)).filter((r) => r != null);
        return rs.length ? { avg: rs.reduce((a, b) => a + b, 0) / rs.length, n: rs.length, win: rs.filter((r) => r > 0).length / rs.length } : null;
      });
      const yr = cells[cells.length - 1];
      return `<tr class="${g.base ? "base" : ""}">
        <td><span class="st" style="--c:${g.c}">${esc(g.label)}</span></td>
        <td class="num">${idx.length}</td>
        ${cells.map((c) => `<td class="num ${c ? cls(c.avg) : ""}">${c ? pct(c.avg) : "—"}</td>`).join("")}
        <td class="num">${yr ? Math.round(yr.win * 100) + "%" : "—"}</td>
        <td class="num">${yr ? yr.n : 0}</td></tr>`;
    }).join("");

    el.innerHTML = `<table>
      <thead><tr><th>Score on the day you bought</th><th class="num">Days</th>
        ${FWD.map(([l]) => `<th class="num">Avg ${l}</th>`).join("")}
        <th class="num">1-year winners</th><th class="num">1-year samples</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
    const first = H.dates[0];
    $("#stats-note").textContent = `S&P 500 price returns (no dividends), every trading day since ${fmtDate(first)}. ` +
      `Days in a row overlap heavily, so a handful of selloffs drive the high tiers. ` +
      (D.fng_archive_until ? `Fear & Greed before ${fmtDate(D.fng_cnn_start)} comes from an unofficial community archive of CNN's older index. ` : "") +
      `Breadth uses today's S&P 500 members for every year (survivorship bias). Not financial advice.`;
  }

  if (H.dates) {
    registerChart($("#score-chart"), (sl) => ({
      ...pickOpts(sl),
      dates: sub(H.dates, sl), values: sub(H.score, sl), yMin: 0, yMax: D.max_total, step: true, label: "Pep score history",
      ticks: tiersAsc.map((t) => t.min).concat(D.max_total),
      bands: tiersAsc.map((t, i) => ({ from: t.min, to: tiersAsc[i + 1] ? tiersAsc[i + 1].min : D.max_total, fill: tierColor(t), opacity: 0.12 })),
      fmt: (v) => { const t = tierFor(v); return `${v}/12 ${t.emoji} ${esc(t.name)}`; },
    }));
    registerChart($("#spx-chart"), (sl) => {
      const vals = sub(H.spx, sl), spx = vals.filter((v) => v != null);
      const lo = Math.min(...spx), hi = Math.max(...spx), pad = (hi - lo) * 0.08;
      // evenly spaced "nice" ticks (1/2/5 x 10^n) inside the padded range
      const span = hi - lo + 2 * pad, mag = Math.pow(10, Math.floor(Math.log10(span)));
      const tickSet = (step) => { const a = []; for (let t = Math.ceil((lo - pad) / step) * step; t <= hi + pad; t += step) a.push(t); return a; };
      // largest "nice" step that still yields at least 3 ticks
      const step = [10, 5, 2.5, 2, 1, 0.5, 0.25, 0.2, 0.1].map((m) => m * mag).find((s) => tickSet(s).length >= 3);
      const ticks = tickSet(step);
      return {
        ...pickOpts(sl),
        dates: sub(H.dates, sl), values: vals, yMin: lo - pad, yMax: hi + pad, label: "S&P 500",
        ticks,
        tickFmt: (v) => (v / 1000).toFixed(1) + "k",
        fmt: (v) => v.toLocaleString(undefined, { maximumFractionDigits: 0 }),
      };
    });
    const first = H.dates[0];
    $("#score-chart").closest(".card").querySelector(".hint").textContent =
      `Same rules as today, back to ${fmtDate(first)}. Click a day to see what buying then returned.` +
      (D.fng_archive_until ? ` Fear & Greed before ${fmtDate(D.fng_cnn_start)} is from an unofficial archive.` : "");
    renderPick();
    renderStats();
  }

  // ---------- watchlist ----------
  const near = D.near_pct;
  const DMIN = -40, DMAX = 80;
  const pos = (v) => ((Math.max(DMIN, Math.min(DMAX, v)) - DMIN) / (DMAX - DMIN)) * 100;
  const knife = D.knife_pct ?? 20;
  const STATUS = {
    knife: { t: `🔪 Falling knife? (>${knife}% below)`, c: "var(--heat-3)" },
    below: { t: "Below 200WMA 🔥", c: "var(--heat-3)" },
    at: { t: `Within ${near}% of 200WMA`, c: "var(--heat-2)" },
    above: { t: "Above", c: "var(--heat-0)" },
    "too young": { t: "Too young (<200 wks)", c: "var(--track)" },
    "no data": { t: "No data", c: "var(--track)" },
  };
  const hits = D.watchlist.filter((r) => ["knife", "below", "at"].includes(r.status));
  const knives = hits.filter((r) => r.status === "knife").length;
  const elig = D.watchlist.filter((r) => r.dist_pct != null);
  $("#wl-summary").textContent = `${hits.length} of ${elig.length} names are below or within ${near}% of their 200-week moving average` +
    (knives ? `, including ${knives} more than ${knife}% below (🔪 possible falling knives: they still count toward the score, but check the story before buying).` : ".") +
    ` Bars are clipped at ${DMIN}% / +${DMAX}%.`;

  function renderTable() {
    const only = $("#only-near").checked;
    const rows = only ? hits : D.watchlist;
    $("#watchlist tbody").innerHTML = rows.map((r) => {
      const st = STATUS[r.status] || STATUS["no data"];
      let bar = "—";
      if (r.dist_pct != null) {
        const z = pos(0), p = pos(r.dist_pct);
        const left = Math.min(z, p), width = Math.abs(p - z);
        const clipped = r.dist_pct > DMAX || r.dist_pct < DMIN;
        const lbl = `${r.dist_pct > 0 ? "+" : ""}${r.dist_pct.toFixed(1)}%${clipped ? " ›" : ""}`;
        const lblStyle = r.dist_pct >= 0 ? `left:calc(${Math.min(p, 84)}% + 6px)` : `right:calc(${100 - p}% + 6px)`;
        bar = `<div class="dbar">
          <div class="nearband" style="left:${z}%;width:${pos(near) - z}%"></div>
          <div class="fill" style="left:${left}%;width:${width}%;background:${st.c}"></div>
          <div class="axis" style="left:${z}%"></div>
          <div class="lbl" style="${lblStyle}">${lbl}</div></div>`;
      }
      return `<tr>
        <td class="tk">${esc(r.ticker)}</td>
        <td class="num">${r.price != null ? "$" + r.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}</td>
        <td class="num">${r.wma200 != null ? "$" + r.wma200.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}</td>
        <td class="bar-col">${bar}</td>
        <td><span class="st" style="--c:${st.c}">${st.t}</span></td></tr>`;
    }).join("");
  }
  $("#only-near").addEventListener("change", renderTable);
  renderTable();
})();
