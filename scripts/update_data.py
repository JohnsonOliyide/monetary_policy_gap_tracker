"""
Starter data pipeline for the Monetary Policy Gap Tracker dashboard.

This file is intentionally conservative. It documents the data architecture and
provides helper functions for converting public time series into the JSON format
used by the dashboard. It does not yet implement every source parser because
some provider spreadsheets have non-standard layouts that should be inspected
before final automation.

Run from the project root:

    python scripts/update_data.py

The current version writes data/sample_data.json unless you complete the TODO
sections and set USE_LIVE_DATA = True.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
import datetime as dt
import json
import math
import random

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
OUTPUT_FILE = DATA_DIR / "sample_data.json"

USE_LIVE_DATA = False

SOURCE_URLS = {
    "kc_rstar_csv": "https://kcresearch-share.kansascityfed.org/kc-mbnr/KCFed_ModelBased_Rstar_Ustar.csv",
    "lw_xlsx": "https://www.newyorkfed.org/medialibrary/media/research/economists/williams/data/Laubach_Williams_current_estimates.xlsx",
    "hlw_xlsx": "https://www.newyorkfed.org/medialibrary/media/research/economists/williams/data/Holston_Laubach_Williams_current_estimates.xlsx",
    "lubik_matthes_xlsx": "https://www.richmondfed.org/-/media/RichmondFedOrg/research/economists/bios/data/lubik_matthes_natural_rate_interest.xlsx",
    "fred_csv_template": "https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}",
}

FRED_SERIES = {
    "effr": "EFFR",
    "treasury_1y": "DGS1",
    "core_pce_price_index": "PCEPILFE",
    "headline_pce_price_index": "PCEPI",
    "core_cpi_price_index": "CPILFESL",
    "headline_cpi_price_index": "CPIAUCSL",
    "michigan_1y": "MICH",
}


def fred_csv(series_id: str) -> pd.Series:
    """Download a FRED series with no API key using the graph CSV endpoint."""
    url = SOURCE_URLS["fred_csv_template"].format(series_id=series_id)
    df = pd.read_csv(url)
    date_col = df.columns[0]
    value_col = df.columns[1]
    out = df[[date_col, value_col]].copy()
    out[date_col] = pd.to_datetime(out[date_col])
    out[value_col] = pd.to_numeric(out[value_col], errors="coerce")
    out = out.dropna()
    return out.set_index(date_col)[value_col].sort_index()


def month_end_index(s: pd.Series) -> pd.Series:
    """Convert a dated series to month-end frequency using monthly averages."""
    return s.resample("ME").mean()


def quarter_end_index(s: pd.Series) -> pd.Series:
    """Convert a dated series to quarter-end frequency using quarterly averages."""
    return s.resample("QE").mean()


def monthly_annualized_inflation(index_series: pd.Series) -> pd.Series:
    """Annualized month-over-month inflation rate from a price index."""
    return ((index_series / index_series.shift(1)) ** 12 - 1) * 100


def quarterly_annualized_inflation(index_series: pd.Series) -> pd.Series:
    """Annualized quarter-over-quarter inflation rate from a quarterly price index."""
    return ((index_series / index_series.shift(1)) ** 4 - 1) * 100


def moving_average_expectation_proxy(inflation: pd.Series, window: int) -> pd.Series:
    """
    Adaptive expected-inflation proxy.

    The current period is excluded, so the expectation for t uses information
    through t-1. For monthly data, use window=12. For quarterly data, use window=4.
    """
    return inflation.shift(1).rolling(window=window, min_periods=window).mean()


def build_live_data() -> dict:
    """
    TODO: Complete live data ingestion.

    Suggested steps:
    1. Fetch FRED policy rates and price indexes.
    2. Construct monthly and quarterly moving-average proxies for core PCE,
       headline PCE, core CPI and headline CPI.
    3. Fetch KC r*, LW/HLW, and Lubik-Matthes spreadsheets.
    4. Add DKW and 10Y10Y TIPS after final source selection.
    5. Calculate SEP-implied r* from FOMC longer-run nominal rate minus 2%.
    6. Write JSON with the same structure as sample_data.json.
    """
    raise NotImplementedError("Live data parser still needs source-specific spreadsheet mapping.")


def build_illustrative_data() -> dict:
    """Generate deterministic sample data for UI development."""
    random.seed(42)

    def month_end(year: int, month: int) -> dt.date:
        if month == 12:
            next_month = dt.date(year + 1, 1, 1)
        else:
            next_month = dt.date(year, month + 1, 1)
        return next_month - dt.timedelta(days=1)

    def q_label(date: dt.date) -> str:
        return f"{date.year} Q{((date.month - 1) // 3) + 1}"

    months = []
    y, m = 2020, 1
    while (y, m) <= (2026, 6):
        d = month_end(y, m)
        t = len(months)
        effr = 0.08 + 0.02 * math.sin(t / 4)
        if t >= 24:
            effr += min(5.25, (t - 24) * 0.24)
        if t >= 45:
            effr = 5.28 - (t - 45) * 0.03
        effr = max(0.05, effr)
        treasury_1y = effr + 0.15 * math.sin(t / 5) + (0.35 if 28 <= t <= 44 else 0.05) - (0.25 if t > 52 else 0)

        core_pce = 1.85 + 0.05 * math.sin(t / 6) + (1.7 / (1 + math.exp(-(t - 25) / 4))) - (0.045 * max(0, t - 45))
        headline_pce = core_pce + 0.25 * math.sin(t / 3) + (0.55 if 28 <= t <= 37 else 0) - (0.25 if 45 <= t <= 55 else 0)
        core_cpi = core_pce + 0.35 + 0.1 * math.sin(t / 5)
        headline_cpi = headline_pce + 0.45 + 0.2 * math.sin(t / 2.8)
        cleveland = 2.05 + 0.08 * math.sin(t / 7) + (0.6 / (1 + math.exp(-(t - 25) / 5))) - 0.016 * max(0, t - 50)
        michigan = 2.8 + 0.15 * math.sin(t / 3) + (1.7 if 28 <= t <= 42 else 0.6 if 43 <= t <= 55 else 0)
        nyfed = 2.6 + 0.08 * math.sin(t / 4) + (1.2 if 28 <= t <= 40 else 0.45 if 41 <= t <= 54 else 0)

        kc = 0.65 + 0.25 * math.sin(t / 14) + 0.009 * t + (0.35 / (1 + math.exp(-(t - 42) / 5))) + random.uniform(-0.04, 0.04)
        dkw = 0.85 + 0.45 * math.sin((t - 5) / 18) + 0.006 * t - 0.28 / (1 + math.exp(-(t - 42) / 4)) + random.uniform(-0.05, 0.05)
        tips = -0.75 + 0.3 * math.sin(t / 11) + 0.03 * max(0, t - 23) - 0.02 * max(0, t - 51) + random.uniform(-0.06, 0.06)

        months.append({
            "date": d.isoformat(),
            "period": d.strftime("%b %Y"),
            "quarter": q_label(d),
            "policy": {"effr": round(effr, 3), "treasury_1y": round(treasury_1y, 3)},
            "inflation": {
                "core_pce_ma": round(core_pce, 3),
                "headline_pce_ma": round(headline_pce, 3),
                "core_cpi_ma": round(core_cpi, 3),
                "headline_cpi_ma": round(headline_cpi, 3),
                "cleveland_1y": round(cleveland, 3),
                "michigan_1y": round(michigan, 3),
                "nyfed_sce_1y": round(nyfed, 3),
            },
            "rstar": {"kc_fed": round(kc, 3), "dkw": round(dkw, 3), "tips_10y10y": round(tips, 3)},
        })
        m += 1
        if m == 13:
            m = 1
            y += 1

    quarters = []
    for q in sorted({x["quarter"] for x in months}, key=lambda s: (int(s.split()[0]), int(s[-1]))):
        ms = [x for x in months if x["quarter"] == q]
        if len(ms) < 3:
            continue
        t = len(quarters)
        policy = {k: sum(x["policy"][k] for x in ms) / len(ms) for k in ["effr", "treasury_1y"]}
        inflation = {k: sum(x["inflation"][k] for x in ms) / len(ms) for k in ["core_pce_ma", "headline_pce_ma", "core_cpi_ma", "headline_cpi_ma", "cleveland_1y", "michigan_1y", "nyfed_sce_1y"]}
        inflation["spf_1y"] = 2.15 + 0.05 * math.sin(t / 4) + (0.65 / (1 + math.exp(-(t - 9) / 2))) - 0.025 * max(0, t - 17)
        quarters.append({
            "date": ms[-1]["date"],
            "period": q,
            "quarter": q,
            "policy": {k: round(v, 3) for k, v in policy.items()},
            "inflation": {k: round(v, 3) for k, v in inflation.items()},
            "rstar": {
                "hlw": round(0.6 + 0.12 * math.sin(t / 4) + 0.012 * t - 0.20 / (1 + math.exp(-(t - 13) / 2)), 3),
                "lw": round(0.85 + 0.10 * math.sin(t / 5) + 0.006 * t - 0.16 / (1 + math.exp(-(t - 13) / 2)), 3),
                "lubik_matthes": round(1.15 + 0.2 * math.sin((t - 3) / 5) + 0.014 * t - 0.12 / (1 + math.exp(-(t - 14) / 2)), 3),
            },
        })

    sep = []
    for yy in range(2020, 2027):
        for mm in [3, 6, 9, 12]:
            if yy == 2026 and mm > 6:
                continue
            d = month_end(yy, mm)
            t = len(sep)
            val = 0.45 + 0.15 * math.sin(t / 5) + 0.018 * t
            if t > 12:
                val += 0.14
            sep.append({"date": d.isoformat(), "period": d.strftime("%b %Y SEP"), "quarter": q_label(d), "rstar": round(val, 3)})

    return {
        "metadata": {
            "generated_at": dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat(),
            "prototype_note": "Illustrative sample data for UI and calculation testing. Replace with live data before publishing as a data product.",
        },
        "months": months,
        "quarters": quarters,
        "sep": sep,
    }


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    data = build_live_data() if USE_LIVE_DATA else build_illustrative_data()
    OUTPUT_FILE.write_text(json.dumps(data, indent=2))
    print(f"Wrote {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
