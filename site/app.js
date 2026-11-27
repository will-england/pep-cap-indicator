(function () {
  "use strict";
  const D = window.PEP_DATA;

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
  const fmtNum = (v, dp = 2) => v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

  const tiersAsc = [...D.tiers].sort((a, b) => a.min - b.min);
  const tierColor = (t) => `var(--heat-${tiersAsc.findIndex((x) => x.name === t.name)})`;
  const tierFor = (score) => [...tiersAsc].reverse().find((t) => score >= t.min) || tiersAsc[0];
  const tierLabel = (t) => (t.emoji ? `${t.emoji} ` : "") + t.name;
  const H = D.history || {};

  // ---------- command bar ----------
  const gen = new Date(D.generated_at);
  $("#asof").textContent = "AS OF " + gen.toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" }) + " ET";
  const tick = () => { $("#clock").textContent = new Date().toLocaleTimeString("en-US", { hour12: false, timeZone: "America/New_York" }) + " NY"; };
  tick(); setInterval(tick, 1000);
  $("#warnings").innerHTML = (D.warnings || []).map((w) => `<div class="warn">WARNING: ${esc(w)}</div>`).join("");

  // ---------- 01 score ----------
  const tier = D.tier;
  const tc = tierColor(tier);
  // segmented meter: one block per point; every lit block takes today's tier color
  $("#meter").innerHTML = Array.from({ length: D.max_total }, (_, i) =>
    `<i class="${i < D.total ? "on" : ""}" style="--c:${tc}"></i>`).join("");
  $("#total").textContent = D.total;
  $("#tier-name").textContent = tierLabel(tier);
  $("#tier-name").style.color = tc;
  $("#tier-tagline").textContent = tier.tagline;
  $("#ladder").innerHTML = tiersAsc.map((t, i) => {
    const next = tiersAsc[i + 1];
    const range = next ? `${t.min}-${next.min - 1}` : `${t.min}-${D.max_total}`;
    return `<span class="${t.name === tier.name ? "on" : ""}" style="--c:${tierColor(t)}">${range} ${esc(tierLabel(t))}</span>`;
  }).join("");

  // ---------- signal definitions ----------
  const SIG = {
    vix:        { code: "VIX",        key: "vix",     fmt: (v) => v.toFixed(2), unit: "",          yMin: 0, yMax: (h) => Math.max(50, ...h.filter((v) => v != null)) },
    fear_greed: { code: "FEAR/GREED", key: "fng",     fmt: (v) => v.toFixed(0), unit: " / 100",    yMin: 0, yMax: () => 100 },
    breadth:    { code: "%SPX>200D",  key: "breadth", fmt: (v) => v.toFixed(1) + "%", unit: "",   yMin: 0, yMax: () => 100 },
    wma200:     { code: "PEP LIST<200W", key: "wma",     fmt: (v) => v.toFixed(1) + "%", unit: " OF LIST", yMin: 0, yMax: (h) => Math.max(60, ...h.filter((v) => v != null)) },
  };
  const levelVal = (l) => l.min ?? l.max ?? l.below ?? l.above;
  const levelText = (l) => {
    if (l.min_count != null) return `≥${l.min_count} name${l.min_count > 1 ? "s" : ""}`;
    if (l.min != null) return `≥${l.min}`;
    if (l.max != null) return `≤${l.max}`;
    if (l.below != null) return `<${l.below}`;
    return `>${l.above}`;
  };
  const pipsHtml = (p) => `<span class="pips" aria-label="${p} of 3 points">${[1, 2, 3].map((k) => `<i class="${p >= k ? "on" : ""}"></i>`).join("")}<b>+${p}</b></span>`;
  const spark = (arr, w = 120, h = 22) => {
    const v = (arr || []).filter((x) => x != null);
    if (v.length < 2) return "";
    const lo = Math.min(...v), hi = Math.max(...v);
    const d = v.map((x, i) => `${i ? "L" : "M"}${((i / (v.length - 1)) * w).toFixed(1)},${(h - 2 - ((x - lo) / (hi - lo || 1)) * (h - 4)).toFixed(1)}`).join("");
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="var(--series)" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
  };

  // ---------- 02 signal monitor ----------
  $("#monitor").innerHTML = `<tr><th>SIGNAL</th><th class="num">LAST</th><th>RULE</th><th>PTS</th><th>1Y</th></tr>` +
    Object.entries(D.signals).map(([k, s]) => {
      const c = SIG[k];
      const hitL = s.levels.find((l) => l.points === s.points && s.points > 0);
      let rule = s.spike ? `SPIKE≥${s.spike_rule.level}` : hitL ? levelText(hitL) : "—";
      return `<tr><td class="lbl-cell">${c.code}</td>
        <td class="num">${s.value == null ? "N/A" : c.fmt(s.value)}</td>
        <td>${s.points ? `<span class="hit">${esc(rule)}</span>` : `<span class="dim">${esc(rule)}</span>`}</td>
        <td>${pipsHtml(s.points)}</td>
        <td class="spark">${spark((H[c.key] || []).slice(-252))}</td></tr>`;
    }).join("") +
    `<tr class="base"><td class="lbl-cell">TOTAL</td><td></td><td></td><td class="mono">${D.total} / ${D.max_total}</td><td class="spark">${spark((H.score || []).slice(-252))}</td></tr>`;

  // ---------- line chart (inline SVG, hover crosshair + tooltip, click to pick) ----------
  function lineChart(el, opts) {
    let o, dates, vals, n;
    const tip = document.createElement("div");
    tip.className = "tip"; tip.hidden = true;
    let geo = null;

    function draw() {
      if (!n) { el.innerHTML = `<p class="note">No data in this range.</p>`; geo = null; return; }
      const W = el.clientWidth, Hh = el.clientHeight;
      const m = { l: 40, r: 8, t: 8, b: 20 };
      const finite = vals.filter((v) => v != null);
      const y0 = o.yMin ?? Math.min(...finite), y1 = o.yMax ?? Math.max(...finite);
      const x = (i) => m.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - m.l - m.r));
      const y = (v) => m.t + (1 - (Math.max(y0, Math.min(y1, v)) - y0) / (y1 - y0)) * (Hh - m.t - m.b);
      geo = { x, y, m, W, H: Hh };
      let s = "";

      (o.bands || []).forEach((b) => {
        const top = y(Math.min(y1, b.to)), bot = y(Math.max(y0, b.from));
        s += `<rect x="${m.l}" y="${top}" width="${W - m.l - m.r}" height="${Math.max(0, bot - top)}" fill="${b.fill || "var(--zone)"}" ${b.opacity ? `fill-opacity="${b.opacity}"` : 'class="zone"'}/>`;
      });

      (o.ticks || [y0, (y0 + y1) / 2, y1]).forEach((t) => {
        const yy = y(t), th = (o.thresholds || []).includes(t);
        s += `<line class="${th ? "thresh" : "grid-line"}" x1="${m.l}" x2="${W - m.r}" y1="${yy}" y2="${yy}"/>`;
        s += `<text x="${m.l - 6}" y="${yy + 3}" text-anchor="end">${o.tickFmt ? o.tickFmt(t) : t}</text>`;
      });

      const yearly = n > 600, starts = [];
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
          : d.getMonth() === 0 ? `JAN '${String(d.getFullYear()).slice(2)}` : MONTHS[d.getMonth()].toUpperCase();
        s += `<text x="${x(i)}" y="${Hh - 4}" text-anchor="middle">${lbl}</text>`;
      });

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
        if (li >= 0 && li < n) s += `<line class="pin" x1="${x(li)}" x2="${x(li)}" y1="${m.t}" y2="${Hh - m.b}"/>`;
      }
      s += `<line class="cross" id="cx" x1="0" x2="0" y1="${m.t}" y2="${Hh - m.b}" visibility="hidden"/>`;
      s += `<circle class="dot" id="cd" r="4" visibility="hidden"/>`;
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
      tip.innerHTML = `<b>${o.fmt(vals[i], i)}</b> <span>· ${fmtDate(dates[i]).toUpperCase()}</span>`;
      tip.hidden = false;
      tip.style.left = Math.max(80, Math.min(geo.W - 80, X)) + "px";
      tip.style.top = Math.max(30, Y) + "px";
    }
    function leave() {
      tip.hidden = true;
      el.querySelectorAll("#cx,#cd").forEach((e) => e.setAttribute("visibility", "hidden"));
    }
    function set(newOpts) {
      o = newOpts; dates = o.dates; vals = o.values; n = vals.length;
      el.style.cursor = o.onPick ? "crosshair" : "";
      leave(); draw();
    }
    el.addEventListener("pointermove", hover);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("click", (ev) => { const i = idxAt(ev); if (i >= 0 && o.onPick) o.onPick(i + (o.offset || 0)); });
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
  const charts = [];

  function sliceFor(months) {
    const dates = H.dates || [];
    if (!dates.length || !months) return { from: 0 };
    const end = parseDate(dates[dates.length - 1]);
    const cut = new Date(end.getFullYear(), end.getMonth() - months, end.getDate());
    return { from: Math.max(0, dates.findIndex((d) => parseDate(d) >= cut)) };
  }
  const sub = (arr, sl) => (arr || []).slice(sl.from);
  function registerChart(el, build) { charts.push({ chart: lineChart(el, build(sliceFor(rangeMonths))), build }); }
  function setRange(months) {
    rangeMonths = months;
    try { localStorage.setItem("pep-range", String(months)); } catch (e) {}
    const sl = sliceFor(months);
    charts.forEach((c) => c.chart.set(c.build(sl)));
    document.querySelectorAll("#range button").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.m === months)));
  }
  $("#range").innerHTML = RANGES.map(([l, m]) => `<button type="button" data-m="${m}" aria-pressed="${m === rangeMonths}">${l}</button>`).join("");
  $("#range").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setRange(+b.dataset.m); });

  // ---------- 03 signal panels ----------
  const sigEl = $("#signals");
  Object.entries(D.signals).forEach(([id, s], idx) => {
    const cfg = SIG[id];
    const panel = document.createElement("section");
    panel.className = "panel sig";
    let rules = s.levels.map((l) => `<span class="rule ${s.points && l.points === s.points ? "hit" : ""}">${esc(levelText(l))} → +${l.points}</span>`).join("");
    if (s.spike_rule) rules += `<span class="rule ${s.spike ? "hit" : ""}">SPIKE ≥${s.spike_rule.level} IN ${s.spike_rule.lookback_days}D → +${s.spike_rule.points}</span>`;
    const badges = (s.spike ? `<span class="badge">SPIKE</span>` : "") + (s.stale ? `<span class="badge stale">STALE</span>` : "");
    panel.innerHTML = `
      <h2>03${"ABCD"[idx]}) ${esc(s.label)} <small>${pipsHtml(s.points)}</small></h2>
      <div class="body">
        <div class="top"><div class="value">${s.value == null ? "N/A" : cfg.fmt(s.value)}<small>${cfg.unit}</small>${badges}</div></div>
        <div class="detail">${esc(s.detail || "")}</div>
        <div class="chart"></div>
        <div class="rules">${rules}</div>
        <p class="blurb">${esc(s.blurb)}</p>
      </div>`;
    sigEl.appendChild(panel);

    const series = H[cfg.key];
    const chartEl = panel.querySelector(".chart");
    if (!series || !series.some((v) => v != null)) { chartEl.innerHTML = `<p class="note">No history available.</p>`; return; }
    const strong = s.levels.find((l) => l.points === 2 && l.min_count == null);
    const thresholds = [...new Set(s.levels.filter((l) => l.min_count == null).map(levelVal))];
    registerChart(chartEl, (sl) => {
      const vals = sub(series, sl), yMax = cfg.yMax(vals), bands = [];
      if (strong) {
        if (strong.min != null || strong.above != null) bands.push({ from: levelVal(strong), to: yMax });
        else bands.push({ from: 0, to: levelVal(strong) });
      }
      return { dates: sub(H.dates, sl), values: vals, yMin: cfg.yMin, yMax, bands, thresholds,
        ticks: [0, ...thresholds].sort((a, b) => a - b), label: s.label, fmt: (v) => cfg.fmt(v) };
    });
  });

  // ---------- 04 history + "if you'd bought" ----------
  const FWD = [["1M", 21], ["3M", 63], ["6M", 126], ["1Y", 252]];
  const spxAt = (i) => (H.spx || [])[i];
  const fwdRet = (i, k) => { const a = spxAt(i), b = spxAt(i + k); return a != null && b != null ? b / a - 1 : null; };
  const worstDip = (i, k = 252) => {
    const a = spxAt(i); if (a == null) return null;
    let lo = a;
    for (let j = i + 1; j <= Math.min(i + k, H.spx.length - 1); j++) if (H.spx[j] != null && H.spx[j] < lo) lo = H.spx[j];
    return lo / a - 1;
  };
  const pct = (r, dp = 1) => r == null ? "—" : `${r >= 0 ? "▲+" : "▼"}${(r * 100).toFixed(dp)}%`;
  const cls = (r) => r == null ? "" : r >= 0 ? "pos" : "neg";

  let pinned = null;
  if (H.score && H.score.length) {
    const max = Math.max(...H.score.filter((v) => v != null));
    pinned = H.score.findIndex((v) => v === max);
  }
  const pickOpts = (sl) => ({ offset: sl.from, marker: pinned, onPick: pick });
  function pick(i) { pinned = i; renderPick(); setRange(rangeMonths); }

  function renderPick() {
    if (pinned == null || !H.dates) return;
    const i = pinned, last = H.dates.length - 1, sc = H.score[i], t = tierFor(sc);
    const tiles = FWD.map(([l, k]) => [`${l} LATER`, fwdRet(i, k)])
      .concat([["TO TODAY", i < last ? spxAt(last) / spxAt(i) - 1 : null], ["WORST DIP NEXT 1Y", worstDip(i)]]);
    $("#pick").innerHTML = `
      <div class="pick-head">IF YOU'D BOUGHT THE S&amp;P 500 ON ${fmtDate(H.dates[i]).toUpperCase()}
        <span class="pill" style="--c:${tierColor(t)}">SCORE ${sc} · ${esc(tierLabel(t))}</span>
        <span class="dim">@ ${fmtNum(spxAt(i), 0)}</span></div>
      <div class="tiles">${tiles.map(([l, r]) => `<div class="tile"><span>${l}</span><b class="${cls(r)}">${pct(r)}</b></div>`).join("")}</div>
      <p class="note">Click any day on the score or S&amp;P chart to pick a different date. "—" means not enough time has passed yet.</p>`;
  }

  // ---------- 05 returns breakdown ----------
  const STATS_VIEWS = [["tiers", "By tier"], ["score", "Score 0-12"], ["vix", "VIX"], ["fear_greed", "F&G"], ["breadth", "Breadth"], ["wma200", "200W MA"]];
  let statsView = "tiers";
  try { const v = localStorage.getItem("pep-stats-view"); if (STATS_VIEWS.some(([k]) => k === v)) statsView = v; } catch (e) {}
  { const v = new URLSearchParams(location.search).get("stats"); if (STATS_VIEWS.some(([k]) => k === v)) statsView = v; }

  function statsGroups(view) {
    if (view === "tiers") {
      return { series: H.score, head: "TIER WHEN BOUGHT",
        hint: "Average S&P 500 return after buying on a day in each Pep tier, compared with buying on any day.",
        groups: tiersAsc.map((t, gi) => ({ label: tierLabel(t), c: tierColor(t),
          test: (s) => s >= t.min && (!tiersAsc[gi + 1] || s < tiersAsc[gi + 1].min) })).reverse() };
    }
    if (view === "score") {
      const groups = [];
      for (let s = D.max_total; s >= 0; s--) { const t = tierFor(s); groups.push({ label: `${s}/12 · ${tierLabel(t)}`, c: tierColor(t), test: (v) => v === s }); }
      return { series: H.score, head: "SCORE WHEN BOUGHT", hint: "Average S&P 500 return after buying on a day with each total Pep Score.", groups };
    }
    const sig = D.signals[view];
    const groups = [3, 2, 1, 0].map((p) => {
      const lvl = sig.levels.find((l) => l.points === p);
      let rule = lvl ? levelText(lvl) : "no rule hit";
      if (view === "vix" && p === sig.spike_rule?.points) rule += ` or spike ≥${sig.spike_rule.level} in ${sig.spike_rule.lookback_days}d`;
      return { label: `+${p} · ${rule}`, c: `var(--heat-${p})`, test: (v) => v === p };
    });
    return { series: H["pts_" + view], head: `${SIG[view].code} PTS WHEN BOUGHT`,
      hint: `Average S&P 500 return after buying on a day when ${sig.label} scored each level, on its own (ignoring the other three signals).`, groups };
  }

  function renderStats() {
    const el = $("#stats");
    if (!H.score) return;
    $("#stats-by").innerHTML = STATS_VIEWS.map(([k, l]) => `<button type="button" data-v="${k}" aria-pressed="${k === statsView}">${esc(l)}</button>`).join("");
    const view = statsGroups(statsView);
    $("#stats-hint").textContent = view.hint;
    const series = view.series;
    if (!series) { el.innerHTML = `<p class="note">No per-signal history yet. Run update.py to generate it.</p>`; return; }
    const n = series.length;
    const groups = view.groups.concat([{ label: "ANY DAY (BASELINE)", c: "var(--text-2)", test: () => true, base: true }]);
    const rows = groups.map((g) => {
      const idx = [];
      for (let i = 0; i < n; i++) if (series[i] != null && g.test(series[i])) idx.push(i);
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
    el.innerHTML = `<table><thead><tr><th>${esc(view.head)}</th><th class="num">DAYS</th>
      ${FWD.map(([l]) => `<th class="num">AVG ${l}</th>`).join("")}
      <th class="num">1Y WIN%</th><th class="num">1Y N</th></tr></thead><tbody>${rows}</tbody></table>`;
    $("#stats-note").textContent = `S&P 500 price returns (no dividends), every trading day since ${fmtDate(H.dates[0])}. ` +
      `Days in a row overlap heavily, so a handful of selloffs drive the high tiers. ` +
      (D.fng_archive_until ? `Fear & Greed before ${fmtDate(D.fng_cnn_start)} comes from an unofficial community archive of CNN's older index. ` : "") +
      `Breadth uses today's S&P 500 members for every year (survivorship bias). Not financial advice.`;
  }

  if (H.dates) {
    registerChart($("#score-chart"), (sl) => ({
      ...pickOpts(sl),
      dates: sub(H.dates, sl), values: sub(H.score, sl), yMin: 0, yMax: D.max_total, step: true, label: "Pep score history",
      ticks: tiersAsc.map((t) => t.min).concat(D.max_total),
      bands: tiersAsc.map((t, i) => ({ from: t.min, to: tiersAsc[i + 1] ? tiersAsc[i + 1].min : D.max_total, fill: tierColor(t), opacity: 0.14 })),
      fmt: (v) => `${v}/12 ${esc(tierLabel(tierFor(v)))}`,
    }));
    registerChart($("#spx-chart"), (sl) => {
      const vals = sub(H.spx, sl), spx = vals.filter((v) => v != null);
      const lo = Math.min(...spx), hi = Math.max(...spx), pad = (hi - lo) * 0.08;
      const span = hi - lo + 2 * pad, mag = Math.pow(10, Math.floor(Math.log10(span)));
      const tickSet = (st) => { const a = []; for (let t = Math.ceil((lo - pad) / st) * st; t <= hi + pad; t += st) a.push(t); return a; };
      const step = [10, 5, 2.5, 2, 1, 0.5, 0.25, 0.2, 0.1].map((m) => m * mag).find((st) => tickSet(st).length >= 3);
      return { ...pickOpts(sl), dates: sub(H.dates, sl), values: vals, yMin: lo - pad, yMax: hi + pad, label: "S&P 500",
        ticks: tickSet(step), tickFmt: (v) => (v / 1000).toFixed(1) + "K", fmt: (v) => fmtNum(v, 0) };
    });
    $("#history-hint").textContent = `Same rules as today, back to ${fmtDate(H.dates[0])}. Click a day to see what buying then returned.` +
      (D.fng_archive_until ? ` Fear & Greed before ${fmtDate(D.fng_cnn_start)} is from an unofficial archive.` : "");
    renderPick();
    renderStats();
    $("#stats-by").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      statsView = b.dataset.v;
      try { localStorage.setItem("pep-stats-view", statsView); } catch (e2) {}
      renderStats();
    });
  }

  // ---------- 06 the Pep List ----------
  const near = D.near_pct, knife = D.knife_pct ?? 20;
  const DMIN = -40, DMAX = 80;
  const pos = (v) => ((Math.max(DMIN, Math.min(DMAX, v)) - DMIN) / (DMAX - DMIN)) * 100;
  const STATUS = {
    knife: { t: `KNIFE? (>${knife}% BELOW)`, c: "var(--heat-3)" },
    below: { t: "BELOW 200W", c: "var(--heat-3)" },
    at: { t: `AT (≤${near}% ABOVE)`, c: "var(--heat-2)" },
    above: { t: "ABOVE", c: "var(--heat-0)" },
    "too young": { t: "TOO YOUNG (<200W)", c: "var(--track)" },
    "no data": { t: "NO DATA", c: "var(--track)" },
  };
  const isHit = (r) => ["knife", "below", "at"].includes(r.status);
  const hits = D.watchlist.filter(isHit);
  const knives = hits.filter((r) => r.status === "knife").length;
  const elig = D.watchlist.filter((r) => r.dist_pct != null);
  $("#wl-count").textContent = `${hits.length}/${elig.length} AT OR BELOW`;
  $("#wl-summary").textContent = `${hits.length} of ${elig.length} names are below or within ${near}% of their 200-week moving average` +
    (knives ? `, including ${knives} more than ${knife}% below (possible falling knives: they still count toward the score, but check the story before buying).` : ".") +
    ` Bars are clipped at ${DMIN}% / +${DMAX}%.`;

  let sectorFilter = "All";
  const sectorStats = {};
  D.watchlist.forEach((r) => {
    const s = r.sector || "Other";
    sectorStats[s] = sectorStats[s] || { n: 0, elig: 0, hits: 0 };
    sectorStats[s].n++;
    if (r.dist_pct != null) sectorStats[s].elig++;
    if (isHit(r)) sectorStats[s].hits++;
  });
  const sectorNames = Object.keys(sectorStats).sort((a, b) => sectorStats[b].n - sectorStats[a].n || a.localeCompare(b));
  function renderChips() {
    $("#sector-chips").innerHTML =
      `<button type="button" data-s="All" aria-pressed="${sectorFilter === "All"}">ALL<b>${hits.length}/${elig.length}</b></button>` +
      sectorNames.map((s) => `<button type="button" data-s="${esc(s)}" aria-pressed="${sectorFilter === s}" title="${sectorStats[s].hits} of ${sectorStats[s].elig} at or below the 200-week MA">${esc(s)}<b>${sectorStats[s].hits}/${sectorStats[s].elig}</b></button>`).join("");
  }
  $("#sector-chips").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    sectorFilter = b.dataset.s; renderChips(); renderTable();
  });
  renderChips();

  function renderTable() {
    const only = $("#only-near").checked;
    const rows = (only ? hits : D.watchlist).filter((r) => sectorFilter === "All" || (r.sector || "Other") === sectorFilter);
    $("#watchlist tbody").innerHTML = rows.map((r) => {
      const st = STATUS[r.status] || STATUS["no data"];
      let bar = `<span class="dim">—</span>`;
      if (r.dist_pct != null) {
        const z = pos(0), p = pos(r.dist_pct);
        const clipped = r.dist_pct > DMAX || r.dist_pct < DMIN;
        const lbl = `${r.dist_pct > 0 ? "+" : ""}${r.dist_pct.toFixed(1)}%${clipped ? " ›" : ""}`;
        const lblStyle = r.dist_pct >= 0 ? `left:calc(${Math.min(p, 84)}% + 6px)` : `right:calc(${100 - p}% + 6px)`;
        bar = `<div class="dbar">
          <div class="nearband" style="left:${z}%;width:${pos(near) - z}%"></div>
          <div class="fill" style="left:${Math.min(z, p)}%;width:${Math.abs(p - z)}%;background:${st.c}"></div>
          <div class="axis" style="left:${z}%"></div>
          <div class="lbl ${r.dist_pct < 0 ? "neg" : ""}" style="${lblStyle}">${lbl}</div></div>`;
      }
      return `<tr>
        <td class="tk">${esc(r.ticker)} <span>US</span></td>
        <td class="sector">${esc(r.sector || "Other")}</td>
        <td class="num">${r.price != null ? fmtNum(r.price) : "—"}</td>
        <td class="num">${r.wma200 != null ? fmtNum(r.wma200) : "—"}</td>
        <td class="bar-col">${bar}</td>
        <td><span class="st" style="--c:${st.c}">${st.t}</span></td></tr>`;
    }).join("");
  }
  $("#only-near").addEventListener("change", renderTable);
  renderTable();

  // ---------- ticker tape ----------
  const sp = (H.spx || []).filter((x) => x != null);
  const items = [];
  if (sp.length > 1) {
    const d1 = sp[sp.length - 1] / sp[sp.length - 2] - 1;
    items.push(`SPX ${fmtNum(sp[sp.length - 1], 0)} <b class="${d1 >= 0 ? "pos" : "neg"}">${d1 >= 0 ? "▲" : "▼"}${(d1 * 100).toFixed(2)}%</b>`);
  }
  const sv = D.signals;
  if (sv.vix.value != null) items.push(`VIX ${sv.vix.value.toFixed(2)}${sv.vix.spike ? ' <b class="neg">SPIKE</b>' : ""}`);
  if (sv.fear_greed.value != null) items.push(`FEAR/GREED ${sv.fear_greed.value.toFixed(0)} <b class="neg">${esc((sv.fear_greed.rating || "").toUpperCase())}</b>`);
  if (sv.breadth.value != null) items.push(`%SPX>200D ${sv.breadth.value.toFixed(1)}%`);
  items.push(`PEP SCORE ${D.total}/12 <b style="color:${tc}">${esc(tierLabel(tier))}</b>`);
  hits.slice(0, 10).forEach((r) => items.push(`${esc(r.ticker)} ${fmtNum(r.price)} <b class="${r.dist_pct < 0 ? "neg" : "pos"}">${r.dist_pct > 0 ? "+" : ""}${r.dist_pct.toFixed(1)}% VS 200W</b>`));
  $("#tape").innerHTML = items.map((x) => `<i>${x}</i>`).join("·");

  // ---------- 99 help ----------
  const tierLines = tiersAsc.map((t, i) => {
    const next = tiersAsc[i + 1];
    return `<li><b>${next ? `${t.min}–${next.min - 1}` : `${t.min}–${D.max_total}`} ${esc(tierLabel(t))}</b>: ${esc(t.tagline)}</li>`;
  }).join("");
  $("#help").innerHTML = `
    <h3>What this is</h3>
    <p>A tongue-in-cheek (but real) "buy the fear" indicator. Four signals each score <b>0–3 points</b>, for a total of <b>0–12</b>. The higher the score, the more panic there is in the market.</p>
    <h3>The four signals</h3>
    <ul>
      <li><b>VIX</b>: Wall Street's fear gauge. High readings, or a spike above 40, score points.</li>
      <li><b>CNN Fear &amp; Greed</b>: extreme fear (below 25) scores points.</li>
      <li><b>% of S&amp;P 500 above its 200-day MA</b>: when 30% or fewer are, the selling is broad.</li>
      <li><b>The Pep List at its 200-week MA</b>: how much of our hand-picked watchlist is trading at, or below, its 4-year average.</li>
    </ul>
    <h3>Tiers</h3><ul>${tierLines}</ul>
    <h3>Data</h3>
    <p>Updated every weekday after the US close from Yahoo Finance, CNN and Wikipedia. Last update: <b>${esc(gen.toLocaleString())}</b>.</p>
    <p><b>Not financial advice.</b> Pep Capital is not a registered anything.</p>`;

  // F1 jumps to help, Esc goes back to the top
  document.addEventListener("keydown", (e) => {
    if (e.target.closest && e.target.closest("input, textarea")) return;
    if (e.key === "F1") { e.preventDefault(); location.hash = "#p-help"; }
    if (e.key === "Escape") { window.scrollTo({ top: 0, behavior: "smooth" }); }
  });
})();
