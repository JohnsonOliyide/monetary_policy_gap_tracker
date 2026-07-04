#!/usr/bin/env python3
"""Build data/data.json for the Monetary Policy Gap Tracker.

The script uses public, machine-readable sources where available. It is intentionally
conservative: if an optional source fails, the dashboard is still built with the
available series and the missing source is recorded in data/update_log.json.
"""
from __future__ import annotations

import io
import json
import math
import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, Optional, Tuple

import numpy as np
import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
MANUAL_DIR = DATA_DIR / "manual"
OUT_JSON = DATA_DIR / "data.json"
LOG_JSON = DATA_DIR / "update_log.json"

SOURCES = {
    "kc_fed": "https://kcresearch-share.kansascityfed.org/kc-mbnr/KCFed_ModelBased_Rstar_Ustar.csv",
    "lw_current": "https://www.newyorkfed.org/medialibrary/media/research/economists/williams/data/Laubach_Williams_current_estimates.xlsx",
    "lw_realtime": "https://www.newyorkfed.org/medialibrary/media/research/economists/williams/data/Laubach_Williams_real_time_estimates.xlsx",
    "hlw_current": "https://www.newyorkfed.org/medialibrary/media/research/economists/williams/data/Holston_Laubach_Williams_current_estimates.xlsx",
    "lubik_matthes": "https://www.richmondfed.org/-/media/RichmondFedOrg/research/economists/bios/data/lubik_matthes_natural_rate_interest.xlsx",
    "tips_yield_curve": "https://www.federalreserve.gov/data/yield-curve-tables/feds200805.csv",
    "sce": "https://www.newyorkfed.org/medialibrary/interactives/sce/sce/downloads/data/frbny-sce-data.xlsx",
    "spf_inflation": "https://www.philadelphiafed.org/-/media/FRBP/Assets/Surveys-And-Data/survey-of-professional-forecasters/historical-data/Inflation.xlsx?hash=0E7FC9E86818CF8A1C512953603AA6D8&sc_lang=en",
    "dkw_updates": "https://www.federalreserve.gov/econres/notes/feds-notes/DKW_updates.csv",
}

FRED_SERIES = {
    "effr_daily": "EFFR",
    "treasury_1y_daily": "DGS1",
    "pce": "PCEPI",
    "core_pce": "PCEPILFE",
    "cpi": "CPIAUCSL",
    "core_cpi": "CPILFESL",
    "cleveland_1y": "EXPINF1YR",
    "michigan_1y": "MICH",
    "sep_ffr_median": "FEDTARMDLR",
}

USER_AGENT = "MonetaryPolicyGapTracker/1.0 (public data updater)"
LOG = {"success": [], "warnings": [], "errors": []}


def log(kind: str, message: str) -> None:
    LOG.setdefault(kind, []).append(message)
    print(f"[{kind.upper()}] {message}")


def get_bytes(url: str, timeout: int = 60, attempts: int = 3) -> bytes:
    last_exc = None
    for attempt in range(1, attempts + 1):
        try:
            r = requests.get(url, timeout=timeout, headers={"User-Agent": USER_AGENT})
            r.raise_for_status()
            return r.content
        except Exception as exc:
            last_exc = exc
            if attempt == attempts:
                break
    raise last_exc


def fetch_fred_series(series_id: str) -> pd.Series:
    url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}"
    df = pd.read_csv(url)
    if df.shape[1] < 2:
        raise ValueError(f"FRED response for {series_id} had unexpected columns: {df.columns.tolist()}")
    date_col = df.columns[0]
    val_col = df.columns[1]
    s = pd.to_numeric(df[val_col].replace(".", np.nan), errors="coerce")
    out = pd.Series(s.values, index=pd.to_datetime(df[date_col]), name=series_id).dropna()
    return out


def month_end_index(s: pd.Series, how: str = "mean") -> pd.Series:
    if s.empty:
        return s
    if how == "last":
        out = s.resample("ME").last()
    else:
        out = s.resample("ME").mean()
    out.name = s.name
    return out.dropna()


def quarter_end_index(s: pd.Series, how: str = "mean") -> pd.Series:
    if s.empty:
        return s
    if how == "last":
        out = s.resample("QE").last()
    else:
        out = s.resample("QE").mean()
    out.name = s.name
    return out.dropna()


def annualized_log_change(index_series: pd.Series, periods_per_year: int) -> pd.Series:
    return periods_per_year * 100.0 * np.log(index_series / index_series.shift(1))


def moving_average_proxy(index_series: pd.Series, obs_per_year: int) -> pd.Series:
    """Lagged moving average of annualized inflation rates."""
    ann = annualized_log_change(index_series, obs_per_year)
    return ann.shift(1).rolling(obs_per_year, min_periods=obs_per_year).mean()


def quarter_label(dt: pd.Timestamp) -> str:
    return f"{dt.year} Q{((dt.month - 1) // 3) + 1}"


def month_label(dt: pd.Timestamp) -> str:
    return dt.strftime("%b %Y")


def to_date_str(ts: pd.Timestamp) -> str:
    return pd.Timestamp(ts).strftime("%Y-%m-%d")


def clean_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [str(c).strip().replace("\n", " ") for c in df.columns]
    return df


def find_date_column(df: pd.DataFrame) -> Optional[str]:
    cols = list(df.columns)
    for c in cols:
        cl = str(c).lower()
        if cl in {"date", "dates", "time", "quarter", "qtr"} or "date" in cl:
            return c
    return None


def find_numeric_rstar_column(df: pd.DataFrame, prefer: Iterable[str] = ()) -> Optional[str]:
    cols = list(df.columns)
    scored = []
    prefer_terms = [p.lower() for p in prefer]
    for c in cols:
        cl = str(c).lower().replace(" ", "")
        score = 0
        if "rstar" in cl or "r-star" in cl or "r*" in cl or cl in {"rstar", "r*"}:
            score += 10
        if "median" in cl:
            score += 2
        for term in prefer_terms:
            if term and term in cl:
                score += 3
        if any(bad in cl for bad in ["lower", "upper", "p16", "p84", "16", "84", "date", "year", "quarter"]):
            score -= 3
        if score > 0:
            vals = pd.to_numeric(df[c], errors="coerce")
            if vals.notna().sum() >= 5:
                scored.append((score, c))
    if scored:
        scored.sort(reverse=True, key=lambda x: x[0])
        return scored[0][1]
    return None


def parse_period_from_df(df: pd.DataFrame) -> Optional[pd.Series]:
    df = clean_columns(df)
    # Year + quarter columns are common in model spreadsheets.
    lower = {str(c).lower(): c for c in df.columns}
    year_col = None
    q_col = None
    for k, c in lower.items():
        if k in {"year", "yr"}:
            year_col = c
        if k in {"quarter", "qtr", "q"}:
            q_col = c
    if year_col is not None and q_col is not None:
        years = pd.to_numeric(df[year_col], errors="coerce")
        qs = df[q_col].astype(str).str.extract(r"([1-4])", expand=False)
        qs = pd.to_numeric(qs, errors="coerce")
        dates = []
        for y, q in zip(years, qs):
            if pd.isna(y) or pd.isna(q):
                dates.append(pd.NaT)
            else:
                month = int(q) * 3
                dates.append(pd.Timestamp(int(y), month, 1) + pd.offsets.MonthEnd(0))
        return pd.Series(dates, index=df.index)

    date_col = find_date_column(df)
    if date_col is None:
        return None
    raw = df[date_col]
    parsed = pd.to_datetime(raw, errors="coerce")
    # Try strings like 2020:Q1, 2020Q1, 2020 Q1.
    if parsed.notna().sum() < max(5, int(0.2 * len(raw))):
        q = raw.astype(str).str.extract(r"(\d{4})\s*[:\-]?\s*Q([1-4])", expand=True)
        if not q.empty:
            years = pd.to_numeric(q[0], errors="coerce")
            qs = pd.to_numeric(q[1], errors="coerce")
            dates = []
            for y, qq in zip(years, qs):
                if pd.isna(y) or pd.isna(qq):
                    dates.append(pd.NaT)
                else:
                    dates.append(pd.Timestamp(int(y), int(qq) * 3, 1) + pd.offsets.MonthEnd(0))
            parsed = pd.Series(dates, index=df.index)
    else:
        parsed = pd.Series(parsed, index=df.index)
    # Convert to month/quarter end.
    parsed = parsed.dt.to_period("Q").dt.to_timestamp("Q")
    return parsed


def extract_rstar_from_excel(url: str, prefer_terms: Iterable[str] = ()) -> pd.Series:
    content = get_bytes(url)
    sheets = pd.read_excel(io.BytesIO(content), sheet_name=None)
    candidates = []
    for sheet_name, df in sheets.items():
        # Try several header rows because some public spreadsheets contain title rows.
        for header in range(0, min(8, len(df))):
            try:
                tmp = pd.read_excel(io.BytesIO(content), sheet_name=sheet_name, header=header)
            except Exception:
                continue
            tmp = clean_columns(tmp).dropna(how="all")
            if tmp.empty:
                continue
            dates = parse_period_from_df(tmp)
            rcol = find_numeric_rstar_column(tmp, prefer=prefer_terms)
            if dates is not None and rcol is not None:
                vals = pd.to_numeric(tmp[rcol], errors="coerce")
                ser = pd.Series(vals.values, index=pd.to_datetime(dates), name=str(rcol)).dropna()
                ser = ser[~ser.index.isna()].sort_index()
                # Keep plausible r-star values and require a useful sample.
                ser = ser[(ser > -10) & (ser < 15)]
                if len(ser) >= 20:
                    candidates.append((len(ser), str(sheet_name), str(rcol), ser))
    if not candidates:
        raise ValueError(f"Could not identify r-star date/value columns in {url}")
    candidates.sort(reverse=True, key=lambda x: x[0])
    return candidates[0][3]


def fetch_kc_fed() -> pd.Series:
    content = get_bytes(SOURCES["kc_fed"])
    df = pd.read_csv(io.BytesIO(content))
    df = clean_columns(df)
    dcol = find_date_column(df) or df.columns[0]
    rcol = find_numeric_rstar_column(df, prefer=["rstar", "r*"])
    if rcol is None:
        # A conservative fallback: choose the first numeric column with r in its name.
        for c in df.columns:
            if c == dcol:
                continue
            if pd.to_numeric(df[c], errors="coerce").notna().sum() > 20:
                rcol = c
                break
    if rcol is None:
        raise ValueError(f"Could not identify KC Fed r-star column. Columns: {df.columns.tolist()}")
    dates = pd.to_datetime(df[dcol], errors="coerce")
    dates = pd.Series(dates).dt.to_period("M").dt.to_timestamp("M")
    vals = pd.to_numeric(df[rcol], errors="coerce")
    return pd.Series(vals.values, index=dates, name="kc_fed").dropna().sort_index()


def fetch_lubik_matthes() -> pd.Series:
    content = get_bytes(SOURCES["lubik_matthes"])
    # Richmond file usually has dates/lower16/median/upper84 columns.
    sheets = pd.read_excel(io.BytesIO(content), sheet_name=None)
    for sheet, df in sheets.items():
        df = clean_columns(df).dropna(how="all")
        cols_lower = {c.lower(): c for c in df.columns}
        if "median" in cols_lower:
            dcol = find_date_column(df) or df.columns[0]
            dates = pd.to_datetime(df[dcol], errors="coerce")
            dates = pd.Series(dates).dt.to_period("Q").dt.to_timestamp("Q")
            vals = pd.to_numeric(df[cols_lower["median"]], errors="coerce")
            ser = pd.Series(vals.values, index=dates, name="lubik_matthes").dropna().sort_index()
            if len(ser) > 20:
                return ser
    # Fallback to generic extraction.
    return extract_rstar_from_excel(SOURCES["lubik_matthes"], prefer_terms=["median"])


def fetch_tips_10y10y() -> pd.Series:
    content = get_bytes(SOURCES["tips_yield_curve"])
    df = pd.read_csv(io.BytesIO(content))
    df = clean_columns(df)
    dcol = find_date_column(df) or df.columns[0]
    dates = pd.to_datetime(df[dcol], errors="coerce")
    cols = {str(c).lower().replace(" ", "").replace("_", ""): c for c in df.columns}

    def pick(possible):
        for p in possible:
            key = p.lower().replace(" ", "").replace("_", "")
            if key in cols:
                return cols[key]
        # fuzzy
        for key, c in cols.items():
            if any(p.lower().replace(" ", "").replace("_", "") in key for p in possible):
                return c
        return None

    c10 = pick(["TIPSY10", "TIPS10", "Y10", "SVENY10", "BETA10"])
    c20 = pick(["TIPSY20", "TIPS20", "Y20", "SVENY20", "BETA20"])
    if c10 is None or c20 is None:
        raise ValueError(f"Could not find 10-year and 20-year TIPS yield columns. Columns: {df.columns.tolist()[:25]}")
    y10 = pd.to_numeric(df[c10], errors="coerce")
    y20 = pd.to_numeric(df[c20], errors="coerce")
    # Approximate 10-year, 10-year forward real rate from zero-coupon yields.
    fwd = (20.0 * y20 - 10.0 * y10) / 10.0
    daily = pd.Series(fwd.values, index=dates, name="tips_10y10y").dropna().sort_index()
    return month_end_index(daily, how="mean")


def fetch_dkw_5f5() -> pd.Series:
    """Fetch DKW 5-to-10-year-ahead expected real short rate.

    The Federal Reserve DKW updates file contains daily decompositions of
    nominal yields and inflation compensation. For this dashboard, the relevant
    longer-run real-rate proxy is `exp.real.short.rate.5f5`: the expected real
    short rate over the 5-to-10-year forward window. We convert the daily data
    to monthly averages to match the monthly dashboard frequency.
    """
    content = get_bytes(SOURCES["dkw_updates"])
    # The CSV contains descriptive notes above the actual header row. Locate the
    # header robustly rather than hard-coding a fixed skip count.
    lines = content.decode("utf-8", errors="replace").splitlines()
    header_idx = None
    for i, line in enumerate(lines):
        if line.lower().startswith("date,") and "exp.real.short.rate.5f5" in line.lower():
            header_idx = i
            break
    if header_idx is None:
        raise ValueError("Could not find DKW header row with exp.real.short.rate.5f5")
    df = pd.read_csv(io.BytesIO(content), skiprows=header_idx)
    df = clean_columns(df)
    dcol = "date" if "date" in df.columns else find_date_column(df) or df.columns[0]
    vcol = "exp.real.short.rate.5f5"
    if vcol not in df.columns:
        raise ValueError(f"DKW column {vcol} not found. Columns: {df.columns.tolist()}")
    dates = pd.to_datetime(df[dcol], errors="coerce")
    vals = pd.to_numeric(df[vcol], errors="coerce")
    daily = pd.Series(vals.values, index=dates, name="dkw").dropna().sort_index()
    daily = daily[~daily.index.isna()]
    return month_end_index(daily, how="mean")


def fetch_sce_1y() -> Optional[pd.Series]:
    try:
        content = get_bytes(SOURCES["sce"])
        sheets = pd.read_excel(io.BytesIO(content), sheet_name=None)
        candidates = []
        for sheet, df in sheets.items():
            for header in range(0, min(8, len(df))):
                try:
                    tmp = pd.read_excel(io.BytesIO(content), sheet_name=sheet, header=header)
                except Exception:
                    continue
                tmp = clean_columns(tmp).dropna(how="all")
                dcol = find_date_column(tmp)
                if dcol is None:
                    continue
                # Prefer the median one-year ahead expected inflation rate.
                best_col = None
                best_score = 0
                for c in tmp.columns:
                    cl = str(c).lower()
                    score = 0
                    if "inflation" in cl: score += 3
                    if "one" in cl or "1" in cl: score += 2
                    if "year" in cl or "yr" in cl: score += 2
                    if "median" in cl: score += 2
                    if "expected" in cl or "expectation" in cl: score += 2
                    if "three" in cl or "3" in cl or "uncert" in cl or "dispersion" in cl or "point" in cl:
                        score -= 2
                    if score > best_score and pd.to_numeric(tmp[c], errors="coerce").notna().sum() > 20:
                        best_score = score
                        best_col = c
                if best_col is not None and best_score >= 5:
                    dates = pd.to_datetime(tmp[dcol], errors="coerce")
                    dates = pd.Series(dates).dt.to_period("M").dt.to_timestamp("M")
                    vals = pd.to_numeric(tmp[best_col], errors="coerce")
                    ser = pd.Series(vals.values, index=dates, name="nyfed_sce_1y").dropna().sort_index()
                    if len(ser) > 20:
                        candidates.append((len(ser), sheet, best_col, ser))
        if candidates:
            candidates.sort(reverse=True, key=lambda x: x[0])
            return candidates[0][3]
        raise ValueError("Could not identify SCE one-year inflation expectation column")
    except Exception as e:
        log("warnings", f"NY Fed SCE unavailable or could not be parsed: {e}")
        return None


def fetch_spf_1y() -> Optional[pd.Series]:
    try:
        content = get_bytes(SOURCES["spf_inflation"])
        sheets = pd.read_excel(io.BytesIO(content), sheet_name=None)
        candidates = []
        for sheet, df in sheets.items():
            for header in range(0, min(8, len(df))):
                try:
                    tmp = pd.read_excel(io.BytesIO(content), sheet_name=sheet, header=header)
                except Exception:
                    continue
                tmp = clean_columns(tmp).dropna(how="all")
                dates = parse_period_from_df(tmp)
                if dates is None:
                    continue
                best_col, best_score = None, 0
                for c in tmp.columns:
                    cl = str(c).lower()
                    score = 0
                    if "cpi" in cl or "inflation" in cl: score += 2
                    if "1" in cl or "one" in cl or "year" in cl: score += 2
                    if "median" in cl: score += 2
                    if "10" in cl or "long" in cl or "mean" in cl or "disp" in cl:
                        score -= 3
                    if score > best_score and pd.to_numeric(tmp[c], errors="coerce").notna().sum() > 10:
                        best_col, best_score = c, score
                if best_col is not None and best_score >= 3:
                    vals = pd.to_numeric(tmp[best_col], errors="coerce")
                    ser = pd.Series(vals.values, index=pd.to_datetime(dates), name="spf_1y").dropna().sort_index()
                    # SPF inflation values are annual rates in percent.
                    if len(ser) > 10:
                        candidates.append((len(ser), sheet, best_col, ser))
        if candidates:
            candidates.sort(reverse=True, key=lambda x: x[0])
            return candidates[0][3]
        raise ValueError("Could not identify SPF 1-year expected inflation column")
    except Exception as e:
        log("warnings", f"SPF one-year inflation expectation unavailable or could not be parsed: {e}")
        return None


def series_value(s: pd.Series, idx: pd.Timestamp) -> Optional[float]:
    if s is None or s.empty or idx not in s.index or pd.isna(s.loc[idx]):
        return None
    return float(s.loc[idx])


def safe_float(x) -> Optional[float]:
    if x is None:
        return None
    try:
        y = float(x)
        if math.isnan(y) or math.isinf(y):
            return None
        return round(y, 6)
    except Exception:
        return None


def build_records() -> Dict:
    DATA_DIR.mkdir(exist_ok=True)
    LOG["success"].clear(); LOG["warnings"].clear(); LOG["errors"].clear()

    fred = {}
    for key, sid in FRED_SERIES.items():
        try:
            fred[key] = fetch_fred_series(sid)
            log("success", f"Fetched FRED {sid}")
        except Exception as e:
            fred[key] = pd.Series(dtype=float)
            log("errors", f"Failed to fetch FRED {sid}: {e}")

    # Policy rates: monthly and quarterly averages.
    effr_m = month_end_index(fred["effr_daily"], how="mean")
    dgs1_m = month_end_index(fred["treasury_1y_daily"], how="mean")
    effr_q = quarter_end_index(fred["effr_daily"], how="mean")
    dgs1_q = quarter_end_index(fred["treasury_1y_daily"], how="mean")

    # Inflation moving-average proxies.
    core_pce_m = moving_average_proxy(month_end_index(fred["core_pce"], how="last"), 12)
    pce_m = moving_average_proxy(month_end_index(fred["pce"], how="last"), 12)
    core_cpi_m = moving_average_proxy(month_end_index(fred["core_cpi"], how="last"), 12)
    cpi_m = moving_average_proxy(month_end_index(fred["cpi"], how="last"), 12)

    core_pce_q = moving_average_proxy(quarter_end_index(fred["core_pce"], how="mean"), 4)
    pce_q = moving_average_proxy(quarter_end_index(fred["pce"], how="mean"), 4)
    core_cpi_q = moving_average_proxy(quarter_end_index(fred["core_cpi"], how="mean"), 4)
    cpi_q = moving_average_proxy(quarter_end_index(fred["cpi"], how="mean"), 4)

    cleveland_m = month_end_index(fred["cleveland_1y"], how="last")
    mich_m = month_end_index(fred["michigan_1y"], how="last")
    cleveland_q = quarter_end_index(cleveland_m, how="mean")
    mich_q = quarter_end_index(mich_m, how="mean")

    sce_m = fetch_sce_1y()
    sce_q = quarter_end_index(sce_m, how="mean") if sce_m is not None else pd.Series(dtype=float)
    spf_q = fetch_spf_1y() or pd.Series(dtype=float)

    # Natural-rate measures.
    try:
        kc_m = fetch_kc_fed()
        log("success", "Fetched KC Fed r-star")
    except Exception as e:
        kc_m = pd.Series(dtype=float)
        log("errors", f"Failed to fetch KC Fed r-star: {e}")
    try:
        tips_m = fetch_tips_10y10y()
        log("success", "Fetched/constructed 10Y10Y TIPS real forward rate")
    except Exception as e:
        tips_m = pd.Series(dtype=float)
        log("warnings", f"Failed to fetch/construct 10Y10Y TIPS: {e}")
    try:
        dkw_m = fetch_dkw_5f5()
        log("success", "Fetched DKW 5-to-10-year-ahead expected real short rate")
    except Exception as e:
        dkw_m = pd.Series(dtype=float)
        log("warnings", f"Failed to fetch DKW 5-to-10-year-ahead expected real short rate: {e}")

    try:
        hlw_q = extract_rstar_from_excel(SOURCES["hlw_current"], prefer_terms=["us", "rstar"])
        hlw_q.name = "hlw"
        log("success", "Fetched HLW current r-star")
    except Exception as e:
        hlw_q = pd.Series(dtype=float)
        log("warnings", f"Failed to fetch HLW current r-star: {e}")
    try:
        lw_current_q = extract_rstar_from_excel(SOURCES["lw_current"], prefer_terms=["rstar"])
        lw_current_q.name = "lw_two_sided"
        log("success", "Fetched LW current/two-sided r-star")
    except Exception as e:
        lw_current_q = pd.Series(dtype=float)
        log("warnings", f"Failed to fetch LW current/two-sided r-star: {e}")
    try:
        lw_rt_q = extract_rstar_from_excel(SOURCES["lw_realtime"], prefer_terms=["rstar"])
        lw_rt_q.name = "lw_one_sided"
        log("success", "Fetched LW real-time/one-sided r-star")
    except Exception as e:
        lw_rt_q = pd.Series(dtype=float)
        log("warnings", f"Failed to fetch LW real-time/one-sided r-star: {e}")
    try:
        lm_q = fetch_lubik_matthes()
        lm_q.name = "lubik_matthes"
        log("success", "Fetched Lubik-Matthes r-star")
    except Exception as e:
        lm_q = pd.Series(dtype=float)
        log("warnings", f"Failed to fetch Lubik-Matthes r-star: {e}")

    # SEP-implied median real neutral rate = longer-run nominal FFR median - 2 percent.
    sep_nom = fred["sep_ffr_median"].copy()
    sep_r = sep_nom - 2.0

    all_month_idx = sorted(set().union(
        set(effr_m.index), set(dgs1_m.index), set(core_pce_m.index), set(pce_m.index),
        set(core_cpi_m.index), set(cpi_m.index), set(cleveland_m.index), set(mich_m.index),
        set(sce_m.index if sce_m is not None else []), set(kc_m.index), set(tips_m.index), set(dkw_m.index)
    ))
    months = []
    for dt in all_month_idx:
        dt = pd.Timestamp(dt)
        record = {
            "date": to_date_str(dt),
            "period": month_label(dt),
            "quarter": quarter_label(dt),
            "policy": {
                "effr": safe_float(series_value(effr_m, dt)),
                "treasury_1y": safe_float(series_value(dgs1_m, dt)),
            },
            "inflation": {
                "core_pce_ma": safe_float(series_value(core_pce_m, dt)),
                "headline_pce_ma": safe_float(series_value(pce_m, dt)),
                "core_cpi_ma": safe_float(series_value(core_cpi_m, dt)),
                "headline_cpi_ma": safe_float(series_value(cpi_m, dt)),
                "cleveland_1y": safe_float(series_value(cleveland_m, dt)),
                "michigan_1y": safe_float(series_value(mich_m, dt)),
                "nyfed_sce_1y": safe_float(series_value(sce_m, dt)) if sce_m is not None else None,
                "spf_1y": None,
            },
            "rstar": {
                "kc_fed": safe_float(series_value(kc_m, dt)),
                "dkw": safe_float(series_value(dkw_m, dt)),
                "tips_10y10y": safe_float(series_value(tips_m, dt)),
            },
        }
        months.append(record)

    all_q_idx = sorted(set().union(
        set(effr_q.index), set(dgs1_q.index), set(core_pce_q.index), set(pce_q.index),
        set(core_cpi_q.index), set(cpi_q.index), set(cleveland_q.index), set(mich_q.index),
        set(sce_q.index), set(spf_q.index), set(hlw_q.index), set(lw_current_q.index),
        set(lw_rt_q.index), set(lm_q.index)
    ))
    quarters = []
    for dt in all_q_idx:
        dt = pd.Timestamp(dt)
        qlabel = quarter_label(dt)
        record = {
            "date": to_date_str(dt),
            "period": qlabel,
            "quarter": qlabel,
            "policy": {
                "effr": safe_float(series_value(effr_q, dt)),
                "treasury_1y": safe_float(series_value(dgs1_q, dt)),
            },
            "inflation": {
                "core_pce_ma": safe_float(series_value(core_pce_q, dt)),
                "headline_pce_ma": safe_float(series_value(pce_q, dt)),
                "core_cpi_ma": safe_float(series_value(core_cpi_q, dt)),
                "headline_cpi_ma": safe_float(series_value(cpi_q, dt)),
                "cleveland_1y": safe_float(series_value(cleveland_q, dt)),
                "michigan_1y": safe_float(series_value(mich_q, dt)),
                "nyfed_sce_1y": safe_float(series_value(sce_q, dt)),
                "spf_1y": safe_float(series_value(spf_q, dt)),
            },
            "rstar": {
                "hlw": safe_float(series_value(hlw_q, dt)),
                "lw_one_sided": safe_float(series_value(lw_rt_q, dt)),
                "lw_two_sided": safe_float(series_value(lw_current_q, dt)),
                "lubik_matthes": safe_float(series_value(lm_q, dt)),
            },
        }
        quarters.append(record)

    sep_records = []
    for dt, val in sep_r.dropna().items():
        dt = pd.Timestamp(dt)
        sep_records.append({
            "date": to_date_str(dt),
            "period": dt.strftime("%b %Y SEP"),
            "quarter": quarter_label(dt),
            "rstar": safe_float(val),
        })

    payload = {
        "metadata": {
            "generated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "description": "Generated from public data sources by scripts/update_data.py.",
            "source_urls": SOURCES | {f"FRED:{k}": f"https://fred.stlouisfed.org/series/{v}" for k, v in FRED_SERIES.items()},
            "notes": [
                "DKW is the D’Amico-Kim-Wei 5-to-10-year-ahead expected real short rate from the Federal Reserve DKW updates file, converted to monthly averages.",
                "10Y10Y TIPS is constructed from Federal Reserve TIPS zero-coupon real yields as the 10-year forward real rate between years 10 and 20.",
                "Moving-average inflation proxies are lagged: the current month or quarter is excluded from the expectation proxy.",
            ],
        },
        "months": months,
        "quarters": quarters,
        "sep": sep_records,
    }
    return payload


def main() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    payload = build_records()
    OUT_JSON.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    LOG_JSON.write_text(json.dumps(LOG, indent=2), encoding="utf-8")
    log("success", f"Wrote {OUT_JSON.relative_to(ROOT)} with {len(payload['months'])} monthly rows and {len(payload['quarters'])} quarterly rows")


if __name__ == "__main__":
    main()
