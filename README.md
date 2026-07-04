# Monetary Policy Gap Tracker

**Tracking whether monetary policy is restrictive or accommodative across alternative natural rate of interest estimates.**

This dashboard compares the real policy rate with alternative estimates of the natural rate of interest, r\*, to assess whether monetary policy appears restrictive, neutral, or accommodative under the selected policy rate and inflation-expectations measure.

\[
\text{Policy gap} = (\text{Policy rate} - \text{Expected inflation}) - r^*
\]

Positive policy gaps indicate restrictive policy. Negative policy gaps indicate accommodative policy. Values close to zero suggest a neutral or ambiguous stance.

## What is included

- Left-side control panel for policy rate, inflation expectation, date range, and natural-rate measure checkboxes.
- Latest available readings table with the policy rate, expected inflation, real rate, r\*, and policy gap.
- Dynamic summary of latest policy-gap readings.
- Historical policy-gap chart across alternative natural-rate measures.
- Side-by-side charts for the historical real policy rate and historical alternative natural-rate estimates.
- Methodology section written as a short research note.
- Sources section linking each series to its original publication page or data page.
- Author link and Federal Reserve disclaimer in the footer.

## Natural rate of interest measures

Monthly model and market-based measures:

- Kansas City Fed Model-Based Natural Rate of Interest
- D’Amico-Kim-Wei 5-to-10-Year-Ahead Expected Real Short Rate
- 10-Year, 10-Year Forward TIPS Real Rate, constructed from Federal Reserve TIPS zero-coupon real yields

Quarterly model-based measures:

- Holston-Laubach-Williams Natural Rate of Interest
- Laubach-Williams Natural Rate of Interest, with one-sided and two-sided options
- Lubik-Matthes Natural Rate of Interest

Quarterly policymaker-based measure:

- FOMC SEP-Implied Median Longer-Run Real Neutral Rate

Simple benchmark:

- Fixed 2% Real Natural Rate Benchmark

## Inflation-expectations options

Moving-average proxies:

- Core PCE moving-average proxy
- Headline PCE moving-average proxy
- Core CPI moving-average proxy
- Headline CPI moving-average proxy

The moving-average proxies are calculated from recent realized inflation, not from surveys. For monthly calculations, the proxy averages the previous 12 annualized month-over-month inflation rates, excluding the current month. For quarterly calculations, the proxy averages the previous four annualized quarter-over-quarter inflation rates.

Survey/model-based expectations:

- Cleveland Fed 1-year expected inflation
- Michigan 1-year expected inflation
- New York Fed SCE 1-year expected inflation
- SPF 1-year expected inflation

When SPF is selected, all stance calculations switch to quarterly frequency.

## Data pipeline

The real-data pipeline is in:

```bash
scripts/update_data.py
```

It writes:

```bash
data/data.json
data/update_log.json
```

Run it locally with:

```bash
pip install -r requirements.txt
python scripts/update_data.py
```

The dashboard first tries to load `data/data.json`. If that file does not exist, it falls back to `data/sample_data.json` and displays a warning at the top of the page.

A GitHub Actions workflow is included at:

```bash
.github/workflows/update-data.yml
```

It can be run manually from the GitHub Actions tab and is also scheduled to run weekly.

## Important data note on DKW

The D’Amico-Kim-Wei 5-to-10-year-ahead expected real short rate is pulled directly from the Federal Reserve DKW updates CSV and converted from daily observations to monthly averages. The dashboard uses the `exp.real.short.rate.5f5` column, which is the expected real short rate over the 5-to-10-year forward window.

## Preview locally

After unzipping the project folder, run:

```bash
cd monetary_policy_gap_tracker
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Source links included in the dashboard

The Sources section links to the original pages for:

- KC Fed Model-Based Natural Rate of Interest;
- New York Fed LW/HLW r-star estimates;
- Richmond Fed Lubik-Matthes estimate;
- D’Amico-Kim-Wei updates CSV and documentation;
- Federal Reserve TIPS Yield Curve and Inflation Compensation data;
- FOMC SEP longer-run federal funds rate median;
- EFFR and 1-year Treasury yield;
- PCE, core PCE, CPI, and core CPI;
- Cleveland Fed, Michigan, New York Fed SCE, and SPF inflation expectations.

## Author and disclaimer

Author: [Johnson Oliyide](https://www.johnsonoliyide.com/)

The views expressed in this dashboard are those of the author and should not be interpreted as reflecting the views of the Federal Reserve Bank of Kansas City or the Federal Reserve System.
