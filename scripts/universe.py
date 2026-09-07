"""The curated ticker universe for the Investment Time Machine.

A fixed, named list — not "any ticker" — so the tool never silently serves
a thin or unreliable history. Add a ticker here, re-run the fetch, and it
is available; this file is the single source of truth for what the tool
supports, and it prints in the UI as "supported tickers" rather than being
hidden.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class UniverseEntry:
    ticker: str  # yfinance-resolvable symbol, e.g. "AAPL" or "RELIANCE.NS"
    display: str  # short symbol shown in the UI, e.g. "AAPL" or "RELIANCE"
    name: str
    market: str  # "us" or "in"
    currency: str  # "USD" or "INR"


US_ENTRIES = [
    ("AAPL", "Apple"),
    ("MSFT", "Microsoft"),
    ("GOOGL", "Alphabet"),
    ("AMZN", "Amazon"),
    ("NVDA", "NVIDIA"),
    ("META", "Meta Platforms"),
    ("TSLA", "Tesla"),
    ("BRK-B", "Berkshire Hathaway"),
    ("JPM", "JPMorgan Chase"),
    ("V", "Visa"),
    ("MA", "Mastercard"),
    ("JNJ", "Johnson & Johnson"),
    ("WMT", "Walmart"),
    ("PG", "Procter & Gamble"),
    ("XOM", "Exxon Mobil"),
    ("HD", "Home Depot"),
    ("DIS", "Disney"),
    ("NFLX", "Netflix"),
    ("KO", "Coca-Cola"),
    ("PEP", "PepsiCo"),
    ("COST", "Costco"),
    ("MCD", "McDonald's"),
    ("ADBE", "Adobe"),
    ("CRM", "Salesforce"),
    ("INTC", "Intel"),
    ("AMD", "AMD"),
    ("ORCL", "Oracle"),
    ("BA", "Boeing"),
    ("NKE", "Nike"),
    ("SBUX", "Starbucks"),
    ("SPY", "S&P 500 (SPY ETF)"),
    ("QQQ", "Nasdaq 100 (QQQ ETF)"),
]

# NSE main-board tickers; yfinance resolves these with a ".NS" suffix.
# Tata Motors is deliberately excluded: its 2025 demerger into separate
# commercial- and passenger-vehicle listings left the old NSE symbol
# unresolvable on Yahoo Finance (confirmed 404, not a transient fetch
# failure). It will be added back once the new listings have a long
# enough continuous history to be worth showing.
IN_ENTRIES = [
    ("RELIANCE", "Reliance Industries"),
    ("TCS", "Tata Consultancy Services"),
    ("HDFCBANK", "HDFC Bank"),
    ("INFY", "Infosys"),
    ("ICICIBANK", "ICICI Bank"),
    ("HINDUNILVR", "Hindustan Unilever"),
    ("SBIN", "State Bank of India"),
    ("BHARTIARTL", "Bharti Airtel"),
    ("KOTAKBANK", "Kotak Mahindra Bank"),
    ("LT", "Larsen & Toubro"),
    ("ITC", "ITC"),
    ("AXISBANK", "Axis Bank"),
    ("BAJFINANCE", "Bajaj Finance"),
    ("ASIANPAINT", "Asian Paints"),
    ("MARUTI", "Maruti Suzuki"),
    ("SUNPHARMA", "Sun Pharmaceutical"),
    ("TITAN", "Titan Company"),
    ("WIPRO", "Wipro"),
    ("ULTRACEMCO", "UltraTech Cement"),
    ("NESTLEIND", "Nestle India"),
    ("ONGC", "Oil & Natural Gas Corp"),
    ("TATASTEEL", "Tata Steel"),
    ("POWERGRID", "Power Grid Corp"),
    ("NTPC", "NTPC"),
    ("ADANIENT", "Adani Enterprises"),
    ("HCLTECH", "HCL Technologies"),
    ("M&M", "Mahindra & Mahindra"),
    ("BAJAJFINSV", "Bajaj Finserv"),
    ("DRREDDY", "Dr. Reddy's Laboratories"),
]


def build_universe() -> list[UniverseEntry]:
    entries = []
    for ticker, name in US_ENTRIES:
        entries.append(UniverseEntry(ticker=ticker, display=ticker, name=name, market="us", currency="USD"))
    for ticker, name in IN_ENTRIES:
        # NSE symbols are used as-is (e.g. "M&M" is the real, literal NSE
        # symbol for Mahindra & Mahindra) -- only the ".NS" suffix is added.
        entries.append(UniverseEntry(ticker=f"{ticker}.NS", display=ticker, name=name, market="in", currency="INR"))
    return entries


UNIVERSE = build_universe()

if __name__ == "__main__":
    for e in UNIVERSE:
        print(e.ticker, e.display, e.name, e.market, e.currency)
    print(f"\n{len(UNIVERSE)} tickers total ({len(US_ENTRIES)} US, {len(IN_ENTRIES)} India)")
