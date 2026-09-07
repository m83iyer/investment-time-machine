(function () {
  "use strict";

  var COLORS = ["#1E7A6F", "#C08A1E", "#6B4C9A", "#3B6EA5", "#C0472E", "#8C6A4F", "#4F8C6A"];
  var COMBINED_COLOR = "#0B1929";

  var state = {
    universe: [],
    universeByDisplay: {},
    fxRates: {},
    priceCache: {},
    holdings: [],
    displayCurrency: "USD",
    selectedEntry: null,
    lastResult: null,
    lastStats: null,
  };

  var el = {};

  function $(id) { return document.getElementById(id); }

  function fmtMoney(value, currency) {
    var symbol = currency === "INR" ? "₹" : "$";
    var abs = Math.abs(value);
    var out;
    if (currency === "INR") {
      if (abs >= 1e7) out = (value / 1e7).toFixed(2) + "Cr";
      else if (abs >= 1e5) out = (value / 1e5).toFixed(2) + "L";
      else if (abs >= 1e3) out = (value / 1e3).toFixed(1) + "K";
      else out = value.toFixed(0);
    } else {
      if (abs >= 1e9) out = (value / 1e9).toFixed(2) + "B";
      else if (abs >= 1e6) out = (value / 1e6).toFixed(2) + "M";
      else if (abs >= 1e3) out = (value / 1e3).toFixed(1) + "K";
      else out = value.toFixed(0);
    }
    return symbol + out;
  }

  function fmtMoneyFull(value, currency) {
    var symbol = currency === "INR" ? "₹" : "$";
    return symbol + Math.round(value).toLocaleString("en-US");
  }

  // ---------- data loading ----------

  function loadJSON(path) {
    return fetch(path).then(function (r) {
      if (!r.ok) throw new Error("failed to load " + path);
      return r.json();
    });
  }

  function ensurePriceSeries(display) {
    if (state.priceCache[display]) return Promise.resolve(state.priceCache[display]);
    return loadJSON("data/prices/" + display + ".json").then(function (series) {
      state.priceCache[display] = series;
      return series;
    });
  }

  // ---------- search / add holding ----------

  function setupSearch() {
    var input = el.tickerSearch;
    var results = el.searchResults;

    input.addEventListener("input", function () {
      var q = input.value.trim().toLowerCase();
      state.selectedEntry = null;
      el.addBtn.disabled = true;
      if (!q) { results.style.display = "none"; return; }
      var matches = state.universe.filter(function (u) {
        return u.display.toLowerCase().indexOf(q) === 0 || u.name.toLowerCase().indexOf(q) !== -1;
      }).slice(0, 12);
      if (!matches.length) { results.style.display = "none"; return; }
      results.innerHTML = "";
      matches.forEach(function (u) {
        var row = document.createElement("div");
        row.textContent = u.display + " — " + u.name + " (" + (u.market === "us" ? "US" : "India") + ")";
        row.addEventListener("click", function () { selectEntry(u); });
        results.appendChild(row);
      });
      results.style.display = "block";
    });

    document.addEventListener("click", function (e) {
      if (!el.searchWrap.contains(e.target)) results.style.display = "none";
    });
  }

  function selectEntry(u) {
    state.selectedEntry = u;
    el.tickerSearch.value = u.display + " — " + u.name;
    el.searchResults.style.display = "none";
    el.dateInput.min = u.first_date;
    el.dateInput.max = u.last_date;
    if (!el.dateInput.value || el.dateInput.value < u.first_date || el.dateInput.value > u.last_date) {
      el.dateInput.value = u.first_date;
    }
    el.coverageHint.textContent = u.name + " (" + u.currency + "): data available " + u.first_date + " to " + u.last_date + ".";
    el.addBtn.disabled = false;

    el.livePreview.style.display = "none";
    ensurePriceSeries(u.display).then(function (series) {
      state.previewDates = Object.keys(series).sort();
      el.dateSlider.max = state.previewDates.length - 1;
      var dateIdx = state.previewDates.indexOf(el.dateInput.value);
      el.dateSlider.value = dateIdx >= 0 ? dateIdx : 0;
      el.livePreview.style.display = "block";
      updateLivePreview();
    });
  }

  function onSliderMove() {
    var idx = parseInt(el.dateSlider.value, 10);
    var d = state.previewDates[idx];
    if (d) el.dateInput.value = d;
    updateSliderFill();
    updateLivePreview();
  }

  function onDateTyped() {
    if (!state.previewDates || !state.previewDates.length) return;
    var idx = window.ITMCalc.firstDateOnOrAfter(state.previewDates, el.dateInput.value);
    var pos = idx ? state.previewDates.indexOf(idx) : state.previewDates.length - 1;
    if (pos >= 0) { el.dateSlider.value = pos; updateSliderFill(); }
    updateLivePreview();
  }

  function updateSliderFill() {
    var pct = (el.dateSlider.value / el.dateSlider.max) * 100;
    el.dateSlider.style.background = "linear-gradient(90deg, var(--teal) " + pct + "%, var(--border) " + pct + "%)";
  }

  function updateLivePreview() {
    var u = state.selectedEntry;
    var amount = parseFloat(el.amountInput.value) || 0;
    if (!u || !state.previewDates || !amount) return;
    var series = state.priceCache[u.display];
    var idx = parseInt(el.dateSlider.value, 10);
    var startDate = state.previewDates[idx];
    var startPrice = series[startDate];
    var lastDate = state.previewDates[state.previewDates.length - 1];
    var lastPrice = series[lastDate];
    var units = amount / startPrice;
    var valueToday = units * lastPrice;
    var ratio = valueToday / amount;

    // Area-proportional bubble sizing (sqrt of ratio) so a 4x gain reads as
    // ~2x the diameter, not a wildly exaggerated jump. Clamped to stay on-panel.
    var minPx = 20, maxPx = 150;
    var px = Math.max(minPx, Math.min(maxPx, minPx * Math.sqrt(Math.max(ratio, 0.05))));
    el.previewBubble.style.width = px + "px";
    el.previewBubble.style.height = px + "px";
    var growing = ratio >= 1;
    el.previewBubble.classList.toggle("shrinking", !growing);
    el.previewValueLine.classList.toggle("shrinking", !growing);

    el.previewAmountLine.textContent = fmtMoneyFull(amount, u.currency) + " in " + u.display + " on " + startDate;
    el.previewValueLine.textContent = fmtMoneyFull(valueToday, u.currency) + " today";
    var pct = ((ratio - 1) * 100);
    el.previewSubLine.textContent = (pct >= 0 ? "+" : "") + pct.toFixed(0) + "% since then";
  }

  function addHolding() {
    var u = state.selectedEntry;
    var amount = parseFloat(el.amountInput.value);
    var date = el.dateInput.value;
    if (!u || !amount || amount <= 0 || !date) return;
    if (state.holdings.some(function (h) { return h.display === u.display && h.startDate === date; })) return;

    el.addBtn.disabled = true;
    el.addBtn.textContent = "…";
    ensurePriceSeries(u.display).then(function () {
      state.holdings.push({
        display: u.display, name: u.name, market: u.market, currency: u.currency,
        amount: amount, startDate: date,
      });
      el.tickerSearch.value = "";
      el.amountInput.value = "";
      state.selectedEntry = null;
      state.previewDates = null;
      el.livePreview.style.display = "none";
      el.addBtn.textContent = "Add";
      renderHoldingsTable();
      recompute();
    });
  }

  function removeHolding(idx) {
    state.holdings.splice(idx, 1);
    renderHoldingsTable();
    recompute();
  }

  function renderHoldingsTable() {
    if (!state.holdings.length) {
      el.holdingsList.innerHTML = "";
      el.emptyHoldings.style.display = "block";
      el.resultsPanel.style.display = "none";
      return;
    }
    el.emptyHoldings.style.display = "none";
    el.holdingsList.innerHTML = "";
    state.holdings.forEach(function (h, i) {
      var color = COLORS[i % COLORS.length];
      var chip = document.createElement("div");
      chip.className = "holding-chip";
      chip.innerHTML =
        '<span class="swatch" style="background:' + color + '"></span>' +
        h.display + ' <span class="amt">' + fmtMoney(h.amount, h.currency) + " since " + h.startDate + "</span>" +
        '<button class="remove-btn" data-idx="' + i + '">✕</button>';
      el.holdingsList.appendChild(chip);
    });
    Array.prototype.forEach.call(el.holdingsList.querySelectorAll(".remove-btn"), function (btn) {
      btn.addEventListener("click", function () { removeHolding(parseInt(btn.dataset.idx, 10)); });
    });
  }

  // ---------- compute + render ----------

  function recompute() {
    if (!state.holdings.length) return;
    var holdingsWithPrices = state.holdings.map(function (h) {
      return Object.assign({}, h, { prices: state.priceCache[h.display] });
    });
    var result = window.ITMCalc.buildCombinedSeries(holdingsWithPrices, state.fxRates, state.displayCurrency);
    var stats = window.ITMCalc.computeStats(result.dates, result.combined, result.totalInvested);
    state.lastResult = result;
    state.lastStats = stats;
    el.resultsPanel.style.display = "block";
    renderStats(stats, result.totalInvested);
    renderChart(result);
  }

  function renderStats(stats, totalInvested) {
    if (!stats) { el.statGrid.innerHTML = ""; return; }
    var ccy = state.displayCurrency;
    var positive = stats.totalReturnPct >= 0;
    var hasDrawdown = stats.maxDrawdownPct > 0.5;
    var ddDetail = hasDrawdown ? stats.drawdownPeakDate + " → " + stats.drawdownTroughDate : "";
    var ddValue = hasDrawdown ? "-" + stats.maxDrawdownPct.toFixed(1) + "%" : "none";
    var recoveryText = !hasDrawdown ? "—" : (stats.recovered ? stats.recoveryDays + "d" : "not yet");

    var cards = [
      { label: "Total invested", value: fmtMoney(totalInvested, ccy) },
      { label: "Value today", value: fmtMoney(stats.currentValue, ccy) },
      { label: "Total return", value: (positive ? "+" : "") + stats.totalReturnPct.toFixed(1) + "%", cls: positive ? "positive" : "negative" },
      { label: "CAGR", value: stats.cagr !== null ? stats.cagr.toFixed(1) + "%" : "n/a" },
      { label: "Worst drawdown", value: ddValue, cls: "negative", detail: ddDetail },
      { label: "Recovered in", value: recoveryText },
    ];
    el.statGrid.innerHTML = cards.map(function (c) {
      return '<div class="stat ' + (c.cls || "") + '"><div class="value">' + c.value + '</div>' +
        (c.detail ? '<div class="detail">' + c.detail + '</div>' : '') +
        '<div class="label">' + c.label + "</div></div>";
    }).join("");

    el.dataAsOf.textContent = state.lastResult ? state.lastResult.dates[state.lastResult.dates.length - 1] : "–";
  }

  function renderChart(result) {
    var canvas = el.chart;
    var wrap = el.chartWrap;
    var dpr = window.devicePixelRatio || 1;
    var cssWidth = wrap.clientWidth;
    var cssHeight = 420;
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    canvas.style.width = cssWidth + "px";
    canvas.style.height = cssHeight + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    var padding = { top: 16, right: 16, bottom: 34, left: 64 };
    var plotW = cssWidth - padding.left - padding.right;
    var plotH = cssHeight - padding.top - padding.bottom;

    var series = [];
    state.holdings.forEach(function (h, i) {
      series.push({ label: h.display, color: COLORS[i % COLORS.length], values: result.perHolding[h.display] });
    });
    var showCombined = state.holdings.length > 1;
    if (showCombined) series.push({ label: "Combined", color: COMBINED_COLOR, values: result.combined, bold: true });

    var allVals = [];
    series.forEach(function (s) { s.values.forEach(function (v) { if (v !== null && v !== undefined) allVals.push(v); }); });
    var minY = 0;
    var maxY = Math.max.apply(null, allVals) * 1.08;

    var n = result.dates.length;
    function xAt(i) { return padding.left + (i / (n - 1)) * plotW; }
    function yAt(v) { return padding.top + plotH - ((v - minY) / (maxY - minY)) * plotH; }

    // gridlines + Y labels
    ctx.strokeStyle = "#D3E3CE";
    ctx.fillStyle = "#55645B";
    ctx.font = "11px -apple-system, sans-serif";
    ctx.textAlign = "right";
    var gridLines = 5;
    for (var g = 0; g <= gridLines; g++) {
      var v = minY + (g / gridLines) * (maxY - minY);
      var y = yAt(v);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(cssWidth - padding.right, y);
      ctx.stroke();
      ctx.fillText(fmtMoney(v, state.displayCurrency), padding.left - 8, y + 4);
    }

    // X labels (evenly spaced dates)
    ctx.textAlign = "center";
    var xLabelCount = Math.min(6, n);
    for (var xl = 0; xl < xLabelCount; xl++) {
      var idx = Math.round((xl / (xLabelCount - 1)) * (n - 1));
      ctx.fillText(result.dates[idx], xAt(idx), cssHeight - padding.bottom + 18);
    }

    // lines
    series.forEach(function (s) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.bold ? 2.6 : 1.6;
      ctx.beginPath();
      var started = false;
      for (var i = 0; i < n; i++) {
        var v = s.values[i];
        if (v === null || v === undefined) { started = false; continue; }
        var x = xAt(i), y = yAt(v);
        if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
      }
      ctx.stroke();
    });

    renderLegend(series);
    wireHover(canvas, result, series, xAt, padding, plotW, n);
  }

  function renderLegend(series) {
    el.legend.innerHTML = series.map(function (s) {
      return '<span class="item"><span class="swatch" style="background:' + s.color + '"></span>' + s.label + "</span>";
    }).join("");
  }

  function wireHover(canvas, result, series, xAt, padding, plotW, n) {
    canvas.onmousemove = function (e) {
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var rel = (mx - padding.left) / plotW;
      var idx = Math.round(rel * (n - 1));
      if (idx < 0 || idx >= n) { el.tooltip.style.display = "none"; return; }

      var lines = [result.dates[idx]];
      series.forEach(function (s) {
        var v = s.values[idx];
        if (v !== null && v !== undefined) {
          lines.push(s.label + ": " + fmtMoneyFull(v, state.displayCurrency));
        }
      });
      el.tooltip.innerHTML = lines.join("<br>");
      el.tooltip.style.display = "block";
      el.tooltip.style.left = Math.min(xAt(idx) + 14, canvas.clientWidth - 160) + "px";
      el.tooltip.style.top = "20px";
    };
    canvas.onmouseleave = function () { el.tooltip.style.display = "none"; };
  }

  // ---------- init ----------

  function init() {
    el = {
      tickerSearch: $("ticker-search"), searchResults: $("search-results"), searchWrap: $("search-wrap"),
      amountInput: $("amount-input"), dateInput: $("date-input"), addBtn: $("add-holding-btn"),
      coverageHint: $("coverage-hint"), holdingsList: $("holdings-list"),
      emptyHoldings: $("empty-holdings"), resultsPanel: $("results-panel"), statGrid: $("stat-grid"),
      chart: $("chart"), chartWrap: $("chart-wrap"), tooltip: $("tooltip"), legend: $("legend"),
      dataAsOf: $("data-as-of"), currencyToggle: $("currency-toggle"),
      livePreview: $("live-preview"), dateSlider: $("date-slider"), previewBubble: $("preview-bubble"),
      previewAmountLine: $("preview-amount-line"), previewValueLine: $("preview-value-line"), previewSubLine: $("preview-sub-line"),
    };

    setupSearch();
    el.addBtn.addEventListener("click", addHolding);
    el.dateSlider.addEventListener("input", onSliderMove);
    el.dateInput.addEventListener("input", onDateTyped);
    el.amountInput.addEventListener("input", updateLivePreview);
    Array.prototype.forEach.call(el.currencyToggle.querySelectorAll("button"), function (btn) {
      btn.addEventListener("click", function () {
        Array.prototype.forEach.call(el.currencyToggle.querySelectorAll("button"), function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        state.displayCurrency = btn.dataset.ccy;
        recompute();
      });
    });
    window.addEventListener("resize", function () { if (state.lastResult) renderChart(state.lastResult); });

    Promise.all([loadJSON("data/universe.json"), loadJSON("data/fx_usdinr.json")]).then(function (r) {
      state.universe = r[0];
      state.fxRates = r[1].rates;
      state.universe.forEach(function (u) { state.universeByDisplay[u.display] = u; });
    }).catch(function (e) {
      el.coverageHint.textContent = "Could not load market data: " + e.message;
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
