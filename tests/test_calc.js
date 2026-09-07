/**
 * Node-only tests for docs/calc.js -- no framework, just `node tests/test_calc.js`.
 * Every fixture is synthetic and hand-computed so failures are diagnosable.
 */
const assert = require("assert");
const calc = require("../docs/calc.js");

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log("ok -", name);
  } catch (e) {
    console.error("FAIL -", name, "\n   ", e.message);
    process.exitCode = 1;
  }
}

check("firstDateOnOrAfter finds exact match", () => {
  assert.strictEqual(calc.firstDateOnOrAfter(["2020-01-01", "2020-01-02"], "2020-01-01"), "2020-01-01");
});

check("firstDateOnOrAfter skips weekend to next trading day", () => {
  // Sat/Sun missing; picking Sat should resolve to Monday.
  assert.strictEqual(calc.firstDateOnOrAfter(["2020-01-03", "2020-01-06"], "2020-01-04"), "2020-01-06");
});

check("firstDateOnOrAfter returns null past the end of history", () => {
  assert.strictEqual(calc.firstDateOnOrAfter(["2020-01-01"], "2021-01-01"), null);
});

check("carryForward fills gaps with the last known value", () => {
  const out = calc.carryForward({ "2020-01-01": 100, "2020-01-03": 110 }, ["2020-01-01", "2020-01-02", "2020-01-03"]);
  assert.deepStrictEqual(out, { "2020-01-01": 100, "2020-01-02": 100, "2020-01-03": 110 });
});

check("carryForward returns null before the series starts", () => {
  const out = calc.carryForward({ "2020-01-02": 100 }, ["2020-01-01", "2020-01-02"]);
  assert.strictEqual(out["2020-01-01"], null);
  assert.strictEqual(out["2020-01-02"], 100);
});

check("single US holding: units and value are exact", () => {
  const holdings = [{
    display: "AAPL", currency: "USD", amount: 1000, startDate: "2020-01-01",
    prices: { "2020-01-01": 100, "2020-01-02": 150 },
  }];
  const result = calc.buildCombinedSeries(holdings, {}, "USD");
  assert.strictEqual(result.resolvedStartDates.AAPL, "2020-01-01");
  // 1000 / 100 = 10 units; 10 * 150 = 1500
  assert.strictEqual(result.perHolding.AAPL[1], 1500);
  assert.strictEqual(result.combined[1], 1500);
  assert.strictEqual(result.totalInvested, 1000);
});

check("India holding converts to USD display using the FX rate on each date", () => {
  const holdings = [{
    display: "RELIANCE", currency: "INR", amount: 100000, startDate: "2020-01-01",
    prices: { "2020-01-01": 1000, "2020-01-02": 1100 },
  }];
  // 80 INR per 1 USD both days, for a clean hand-check.
  const fx = { "2020-01-01": 80, "2020-01-02": 80 };
  const result = calc.buildCombinedSeries(holdings, fx, "USD");
  // units = 100000 / 1000 = 100; value day2 = 100 * 1100 = 110000 INR = 1375 USD
  assert.strictEqual(result.perHolding.RELIANCE[1], 1375);
  // invested displayed in USD: 100000 / 80 = 1250
  assert.strictEqual(result.totalInvested, 1250);
});

check("mixed US+India portfolio combines correctly in USD", () => {
  const holdings = [
    { display: "AAPL", currency: "USD", amount: 1000, startDate: "2020-01-01",
      prices: { "2020-01-01": 100, "2020-01-02": 110 } },
    { display: "RELIANCE", currency: "INR", amount: 80000, startDate: "2020-01-01",
      prices: { "2020-01-01": 800, "2020-01-02": 880 } },
  ];
  const fx = { "2020-01-01": 80, "2020-01-02": 80 };
  const result = calc.buildCombinedSeries(holdings, fx, "USD");
  // AAPL: 10 units * 110 = 1100 USD
  // RELIANCE: 100 units * 880 = 88000 INR = 1100 USD
  assert.strictEqual(result.perHolding.AAPL[1], 1100);
  assert.strictEqual(result.perHolding.RELIANCE[1], 1100);
  assert.strictEqual(result.combined[1], 2200);
  assert.strictEqual(result.totalInvested, 2000); // 1000 + (80000/80)
});

check("computeStats: total return, CAGR sign, and a clean drawdown/recovery", () => {
  const dates = ["2020-01-01", "2020-02-01", "2020-03-01", "2021-01-01"];
  // invested 1000 -> rose to 2000 -> crashed to 500 -> recovered to 3000
  const values = [1000, 2000, 500, 3000];
  const stats = calc.computeStats(dates, values, 1000);
  assert.strictEqual(stats.currentValue, 3000);
  assert.strictEqual(stats.totalReturnPct, 200);
  assert.ok(stats.cagr > 0, "cagr should be positive for a 3x over ~1 year");
  // peak 2000 -> trough 500 = 75% drawdown
  assert.strictEqual(Math.round(stats.maxDrawdownPct), 75);
  assert.strictEqual(stats.drawdownPeakDate, "2020-02-01");
  assert.strictEqual(stats.drawdownTroughDate, "2020-03-01");
  assert.strictEqual(stats.recovered, true);
  assert.strictEqual(stats.recoveryDate, "2021-01-01");
});

check("computeStats: unrecovered drawdown reports recovered=false", () => {
  const dates = ["2020-01-01", "2020-02-01", "2020-03-01"];
  const values = [1000, 2000, 1500]; // never gets back to 2000
  const stats = calc.computeStats(dates, values, 1000);
  assert.strictEqual(stats.recovered, false);
  assert.strictEqual(stats.recoveryDate, null);
});

check("holding starting before FX history exists does not produce Infinity/NaN (regression)", () => {
  // Real bug found 2026-09-07: AAPL since 1980 + RELIANCE since 1996, but
  // USD/INR data only starts 2003-12-01 -- RELIANCE's own resolved start
  // (1996) predated FX history, so `amount / null` produced Infinity and
  // poisoned totalInvested for the whole portfolio.
  const holdings = [
    { display: "AAPL", currency: "USD", amount: 5000, startDate: "1980-12-12",
      prices: { "1980-12-12": 1, "2026-09-04": 100 } },
    { display: "RELIANCE", currency: "INR", amount: 500000, startDate: "1996-01-01",
      prices: { "1996-01-01": 100, "2003-12-01": 200, "2026-09-07": 3000 } },
  ];
  const fx = { "2003-12-01": 80, "2026-09-07": 88 };
  const result = calc.buildCombinedSeries(holdings, fx, "USD");
  assert.ok(Number.isFinite(result.totalInvested), "totalInvested must be a finite number, got " + result.totalInvested);
  assert.notStrictEqual(result.resolvedStartDates.RELIANCE, "1996-01-01", "RELIANCE's start should be pushed to on/after the first FX date");
  assert.strictEqual(result.resolvedStartDates.RELIANCE, "2003-12-01");
  const combinedHasNaN = result.combined.some((v) => v !== null && Number.isNaN(v));
  assert.strictEqual(combinedHasNaN, false, "combined series must never contain NaN");
});

console.log(`\n${passed} test(s) passed`);
