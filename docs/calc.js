/**
 * Pure calculation functions for the Investment Time Machine.
 *
 * No DOM, no fetch -- kept separate from app.js so it can be unit-tested
 * directly under Node (see tests/test_calc.js) with zero build step.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.ITMCalc = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /** First date in `dates` (sorted ascending, "YYYY-MM-DD" strings) that is >= target. */
  function firstDateOnOrAfter(dates, target) {
    for (var i = 0; i < dates.length; i++) {
      if (dates[i] >= target) return dates[i];
    }
    return null;
  }

  /**
   * Build a lookup that returns the carried-forward value for any date in
   * `unionDates`, given a sparse series (object date->value) whose own keys
   * are a subset of unionDates. Dates before the series' own first key
   * return null (holding not yet started / ticker not yet listed).
   */
  function carryForward(series, unionDates) {
    var out = {};
    var last = null;
    for (var i = 0; i < unionDates.length; i++) {
      var d = unionDates[i];
      if (Object.prototype.hasOwnProperty.call(series, d)) {
        last = series[d];
      }
      out[d] = last;
    }
    return out;
  }

  function unionSortedDates(arraysOfDates) {
    var set = {};
    arraysOfDates.forEach(function (arr) {
      arr.forEach(function (d) { set[d] = true; });
    });
    return Object.keys(set).sort();
  }

  /**
   * @param holdings [{ display, currency, amount, startDate, prices: {date: close} }]
   * @param fxRates  {date: INR-per-1-USD}
   * @param displayCurrency "USD" | "INR"
   * @returns {
   *   dates: [...],
   *   combined: [...],           // display-currency value of the whole portfolio, per date
   *   perHolding: { display: [...] },   // display-currency value per holding, per date
   *   resolvedStartDates: { display: actualStartDateUsed },
   *   totalInvested: number (in display currency, converted at each holding's own start date)
   * }
   */
  function buildCombinedSeries(holdings, fxRates, displayCurrency) {
    var fxDates = Object.keys(fxRates).sort();

    var perHoldingInfo = holdings.map(function (h) {
      var priceDates = Object.keys(h.prices).sort();
      var resolvedStart = firstDateOnOrAfter(priceDates, h.startDate);
      // A cross-currency holding can't be valued in the display currency
      // before FX history begins (e.g. USD/INR only goes back to 2003, but
      // an Indian stock's own price history goes back further) -- push the
      // effective start forward to whichever is later, rather than silently
      // dividing by a missing rate.
      if (resolvedStart && h.currency !== displayCurrency && fxDates.length) {
        var firstFx = fxDates[0];
        if (resolvedStart < firstFx) {
          resolvedStart = firstDateOnOrAfter(priceDates, firstFx);
        }
      }
      return {
        display: h.display,
        currency: h.currency,
        amount: h.amount,
        resolvedStart: resolvedStart,
        priceDates: priceDates,
      };
    });

    var allDateArrays = perHoldingInfo.map(function (h) {
      return h.priceDates.filter(function (d) { return d >= h.resolvedStart; });
    });
    var unionDates = unionSortedDates(allDateArrays.concat([fxDates]));
    // Only keep dates from the earliest resolved start onward -- no point
    // rendering years of empty portfolio before anyone invested anything.
    var earliestStart = perHoldingInfo.reduce(function (min, h) {
      return min === null || h.resolvedStart < min ? h.resolvedStart : min;
    }, null);
    unionDates = unionDates.filter(function (d) { return d >= earliestStart; });

    var fxCarried = carryForward(fxRates, unionDates);

    var perHolding = {};
    var resolvedStartDates = {};
    var totalInvested = 0;

    holdings.forEach(function (h, idx) {
      var info = perHoldingInfo[idx];
      resolvedStartDates[h.display] = info.resolvedStart;
      var pricesCarried = carryForward(h.prices, unionDates);
      var startPrice = h.prices[info.resolvedStart];
      var units = h.amount / startPrice;

      var series = unionDates.map(function (d) {
        var price = pricesCarried[d];
        if (price === null || d < info.resolvedStart) return null;
        var ownCcyValue = units * price;
        if (h.currency === displayCurrency) return ownCcyValue;
        var fx = fxCarried[d]; // INR per 1 USD
        if (fx === null) return null;
        if (h.currency === "INR" && displayCurrency === "USD") return ownCcyValue / fx;
        if (h.currency === "USD" && displayCurrency === "INR") return ownCcyValue * fx;
        return ownCcyValue;
      });
      perHolding[h.display] = series;

      // Convert the invested amount itself into display currency at the
      // holding's own start date, so "total invested" is apples-to-apples.
      var investedDisplay = h.amount;
      if (h.currency !== displayCurrency) {
        var fxAtStart = fxCarried[info.resolvedStart];
        // Should be unreachable now that resolvedStart is pushed past the
        // first FX date above -- guarded anyway rather than silently
        // dividing by a missing rate (a null/0 fx would otherwise produce
        // Infinity, poisoning every downstream stat with NaN).
        investedDisplay = (fxAtStart === null || fxAtStart === undefined)
          ? null
          : (h.currency === "INR" ? h.amount / fxAtStart : h.amount * fxAtStart);
      }
      if (investedDisplay !== null) totalInvested += investedDisplay;
    });

    var combined = unionDates.map(function (d, i) {
      var sum = 0;
      var any = false;
      holdings.forEach(function (h) {
        var v = perHolding[h.display][i];
        if (v !== null && v !== undefined) { sum += v; any = true; }
      });
      return any ? sum : null;
    });

    return {
      dates: unionDates,
      combined: combined,
      perHolding: perHolding,
      resolvedStartDates: resolvedStartDates,
      totalInvested: totalInvested,
    };
  }

  /**
   * @param dates [...] ascending
   * @param values [...] same length, may contain leading nulls
   * @returns { currentValue, totalReturnPct, cagr, maxDrawdownPct,
   *            peakDate, troughDate, recovered, recoveryDate, recoveryDays }
   */
  function computeStats(dates, values, totalInvested) {
    var firstIdx = values.findIndex(function (v) { return v !== null && v !== undefined; });
    if (firstIdx === -1) return null;

    var currentValue = values[values.length - 1];
    var totalReturnPct = ((currentValue - totalInvested) / totalInvested) * 100;

    var years = (new Date(dates[dates.length - 1]) - new Date(dates[firstIdx])) / (365.25 * 24 * 3600 * 1000);
    var cagr = years > 0 ? (Math.pow(currentValue / totalInvested, 1 / years) - 1) * 100 : null;

    // Max drawdown: largest peak-to-trough decline, tracked as we scan.
    var peak = values[firstIdx];
    var peakDateAtMax = dates[firstIdx];
    var maxDrawdownPct = 0;
    var drawdownPeakDate = dates[firstIdx];
    var drawdownTroughDate = dates[firstIdx];
    var worstTroughValue = peak;

    for (var i = firstIdx; i < values.length; i++) {
      var v = values[i];
      if (v === null || v === undefined) continue;
      if (v > peak) { peak = v; peakDateAtMax = dates[i]; }
      var dd = ((peak - v) / peak) * 100;
      if (dd > maxDrawdownPct) {
        maxDrawdownPct = dd;
        drawdownPeakDate = peakDateAtMax;
        drawdownTroughDate = dates[i];
        worstTroughValue = v;
      }
    }

    // Recovery: first date after the trough where value >= the pre-drawdown peak.
    var recovered = false;
    var recoveryDate = null;
    var recoveryDays = null;
    if (maxDrawdownPct > 0) {
      var peakValue = null;
      for (var j = 0; j < dates.length; j++) {
        if (dates[j] === drawdownPeakDate) { peakValue = values[j]; break; }
      }
      var troughIdx = dates.indexOf(drawdownTroughDate);
      for (var k = troughIdx; k < values.length; k++) {
        if (values[k] !== null && values[k] >= peakValue) {
          recovered = true;
          recoveryDate = dates[k];
          recoveryDays = Math.round((new Date(recoveryDate) - new Date(drawdownTroughDate)) / (24 * 3600 * 1000));
          break;
        }
      }
    }

    return {
      currentValue: currentValue,
      totalReturnPct: totalReturnPct,
      cagr: cagr,
      maxDrawdownPct: maxDrawdownPct,
      drawdownPeakDate: drawdownPeakDate,
      drawdownTroughDate: drawdownTroughDate,
      recovered: recovered,
      recoveryDate: recoveryDate,
      recoveryDays: recoveryDays,
    };
  }

  return {
    firstDateOnOrAfter: firstDateOnOrAfter,
    carryForward: carryForward,
    unionSortedDates: unionSortedDates,
    buildCombinedSeries: buildCombinedSeries,
    computeStats: computeStats,
  };
});
