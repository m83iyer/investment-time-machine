"""Fetch and write the datasets the Investment Time Machine reads.

Writes:
  data/universe.json        -- ticker metadata + coverage dates
  data/prices/<display>.json -- {date: total-return adjusted close} per ticker
  data/fx_usdinr.json        -- {date: USD-per-1-INR... see note below} FX series
  data/meta.json             -- when this run happened, for the "as of" footer

Prices are yfinance's auto-adjusted close: split- and dividend-adjusted, i.e.
a total-return series (dividends assumed reinvested on the ex-date), not a
raw price-only series. This is stated on the page, not just in this comment.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import yfinance as yf

ROOT = Path(__file__).resolve().parents[1]
# Written directly under docs/ so the same files are both the source of
# truth and what GitHub Pages serves -- one copy, not two kept in sync.
DATA_DIR = ROOT / "docs" / "data"
PRICES_DIR = DATA_DIR / "prices"

sys.path.insert(0, str(ROOT / "scripts"))
from universe import UNIVERSE  # noqa: E402


def fetch_series(ticker: str) -> dict[str, float]:
    hist = yf.Ticker(ticker).history(period="max", auto_adjust=True, actions=False)
    if hist.empty:
        raise RuntimeError(f"no history returned for {ticker}")
    series = {}
    for ts, row in hist.iterrows():
        close = row["Close"]
        if close is None or close != close:  # NaN check without importing math
            continue
        series[ts.strftime("%Y-%m-%d")] = round(float(close), 4)
    if not series:
        raise RuntimeError(f"history for {ticker} contained no usable rows")
    return series


def main() -> int:
    PRICES_DIR.mkdir(parents=True, exist_ok=True)
    universe_meta = []
    failures = []

    for entry in UNIVERSE:
        try:
            series = fetch_series(entry.ticker)
        except Exception as exc:  # noqa: BLE001 -- one bad ticker must not kill the run
            failures.append({"ticker": entry.ticker, "error": str(exc)})
            print(f"FAILED {entry.ticker}: {exc}", file=sys.stderr)
            continue

        out_path = PRICES_DIR / f"{entry.display}.json"
        out_path.write_text(json.dumps(series, separators=(",", ":")), encoding="utf-8")

        dates = sorted(series.keys())
        universe_meta.append({
            "ticker": entry.ticker,
            "display": entry.display,
            "name": entry.name,
            "market": entry.market,
            "currency": entry.currency,
            "first_date": dates[0],
            "last_date": dates[-1],
            "points": len(dates),
        })
        print(f"OK {entry.ticker}: {len(dates)} points, {dates[0]} to {dates[-1]}")

    if not universe_meta:
        print("No tickers fetched successfully; aborting without writing partial data.", file=sys.stderr)
        return 1

    # USD/INR daily rate via yfinance's FX ticker. Value is INR per 1 USD
    # (yfinance's own convention for "USDINR=X"), stated explicitly in the
    # written file so the frontend never has to guess the direction.
    fx = fetch_series("USDINR=X")
    (DATA_DIR / "fx_usdinr.json").write_text(
        json.dumps({"unit": "INR per 1 USD", "rates": fx}, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"OK USDINR=X: {len(fx)} points")

    (DATA_DIR / "universe.json").write_text(
        json.dumps(universe_meta, indent=2),
        encoding="utf-8",
    )

    (DATA_DIR / "meta.json").write_text(
        json.dumps({
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "tickers_ok": len(universe_meta),
            "tickers_failed": len(failures),
            "failures": failures,
            "source": "Yahoo Finance via yfinance; auto-adjusted (split- and dividend-adjusted) close",
        }, indent=2),
        encoding="utf-8",
    )

    if failures:
        print(f"\n{len(failures)} ticker(s) failed and were skipped; see data/meta.json.", file=sys.stderr)
    print(f"\nDone: {len(universe_meta)} tickers written to {PRICES_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
