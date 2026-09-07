# Investment Time Machine

What would $X invested in a stock — or a basket of US and India stocks — on a
past date be worth today? Pick a stock, an amount, and a date; drag through
history and watch the value grow or shrink live, then build a real
multi-stock portfolio and see the actual line: the growth, the crash, the
recovery.

**Live: https://m83iyer.github.io/investment-time-machine/**

## What it shows

- Total invested, value today, total return, CAGR
- The worst drawdown the portfolio actually lived through, and how long it
  took to recover
- A combined line when you hold more than one stock, alongside each
  individual holding
- US and India stocks in one portfolio, converted to a single currency you
  choose

## How it's built

- `scripts/fetch_data.py` pulls full daily price history (dividend- and
  split-adjusted, i.e. total return) for a fixed universe of ~60 US and India
  stocks via `yfinance`, plus the USD/INR daily rate, and writes it to
  `docs/data/`.
- `docs/index.html` + `docs/app.js` + `docs/calc.js` are a single static
  page — no backend, no build step. `calc.js` holds the pure math (date
  alignment, currency conversion, drawdown/recovery) and is unit-tested
  directly under Node with zero dependencies: `node tests/test_calc.js`.
- `.github/workflows/refresh-data.yml` re-runs the fetch every week and
  commits the update automatically, so the data is never more than a week
  stale without anyone touching it.
- Hosted on GitHub Pages directly from `docs/`.

## Universe

See `scripts/universe.py` for the exact list (~32 US, ~29 India). It's a
fixed, named list — not "any ticker" — so every stock shown has a full,
reliable history. Tata Motors is excluded for now: its 2025 demerger left the
old NSE symbol unresolvable on Yahoo Finance.

## Run locally

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
python scripts/fetch_data.py   # populates docs/data/
python3 -m http.server 8000 --directory docs
node tests/test_calc.js
```

Past performance, not a forecast or advice.
