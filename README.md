# Monetary Policy Gap Tracker

This is a static dashboard prototype for tracking whether monetary policy appears restrictive, neutral, or accommodative across alternative estimates of the natural rate of interest, r*.

The dashboard does **not** average the r* measures into a single index. It preserves each estimate and calculates a separate policy gap under the selected policy rate and inflation-expectations measure:

```text
Policy gap = (Policy rate - Expected inflation) - r*
```

Positive values indicate a restrictive stance. Negative values indicate an accommodative stance. Values close to zero indicate a neutral or approximately neutral stance.

## Suggested public-facing description

**Monetary Policy Gap Tracker** compares the real policy rate with alternative estimates of the natural rate of interest, r*, to show whether policy looks restrictive, neutral, or accommodative under different assumptions about inflation expectations.

The dashboard is designed to make model disagreement transparent. Instead of creating one composite r* index, it shows the policy gap implied by each measure separately.

## What is included

- `index.html` — dashboard layout
- `styles.css` — dashboard styling
- `app.js` — dashboard logic, charting, date-range controls, latest table, summary and frequency handling
- `data/sample_data.json` — illustrative sample data for the prototype
- `scripts/update_data.py` — starter data pipeline for replacing the sample data with live data
- `.github/workflows/update-data.yml` — starter GitHub Actions workflow

## r* measures in the prototype

### Monthly measures

- Kansas City Fed Model-Based Natural Rate of Interest
- D’Amico-Kim-Wei Market-Based r*
- 10-Year, 10-Year Forward TIPS Real Rate

### Quarterly model-based measures

- Holston-Laubach-Williams Natural Rate of Interest
- Laubach-Williams Natural Rate of Interest
- Lubik-Matthes Natural Rate of Interest

### Quarterly policymaker-based measure

- FOMC SEP-Implied Longer-Run Real Neutral Rate

## Inflation expectation options

The default selection is:

- Core PCE moving-average proxy

Other options included in the interface are:

- Headline PCE moving-average proxy
- Core CPI moving-average proxy
- Headline CPI moving-average proxy
- Cleveland Fed 1-year expected inflation
- Michigan 1-year expected inflation
- New York Fed SCE 1-year expected inflation
- Survey of Professional Forecasters 1-year expected inflation

## Frequency rules

- Monthly r* measures remain monthly when the selected inflation expectation is monthly.
- Quarterly r* measures remain quarterly.
- Quarterly r* estimates are not interpolated.
- If SPF is selected, all policy-stance estimates switch to quarterly frequency.
- Latest readings show each measure at its own latest available reference period.


## Start date and date range

The illustrative prototype currently starts in **January 2020** and ends in **June 2026**, because `data/sample_data.json` contains sample observations over that range.

The dashboard now includes a **Date range** control in the top filter bar. Users can choose a start date and end date, and both charts plus the latest-reading table update to reflect the selected window. The table reports the latest available observation **within the selected date range**.

When the dashboard is connected to live data, the available start and end dates will be taken from the data file rather than hard-coded. The common historical start date will depend on which r* measures are selected because the model-based, market-based, and SEP-implied measures do not all begin at the same time.

## Local preview

From this folder, run:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

Opening `index.html` directly from your file system may block `data/sample_data.json` in some browsers, so using a local server is safer.

## GitHub Pages deployment

1. Create a new GitHub repository.
2. Upload the files in this folder.
3. Go to **Settings → Pages**.
4. Set the source to the main branch and root folder.
5. Visit the GitHub Pages URL after it finishes deploying.

## Important note

The current `sample_data.json` values are illustrative. Use `scripts/update_data.py` as the starting point for replacing the sample data with live data.

## Data-source plan

The update pipeline is designed around these public sources:

- Kansas City Fed r* and u* CSV: `https://kcresearch-share.kansascityfed.org/kc-mbnr/KCFed_ModelBased_Rstar_Ustar.csv`
- New York Fed LW current estimates: `https://www.newyorkfed.org/medialibrary/media/research/economists/williams/data/Laubach_Williams_current_estimates.xlsx`
- New York Fed HLW current estimates: `https://www.newyorkfed.org/medialibrary/media/research/economists/williams/data/Holston_Laubach_Williams_current_estimates.xlsx`
- Richmond Fed Lubik-Matthes XLSX: `https://www.richmondfed.org/-/media/RichmondFedOrg/research/economists/bios/data/lubik_matthes_natural_rate_interest.xlsx`
- FRED CSV endpoint for policy rates and price indexes: `https://fred.stlouisfed.org/graph/fredgraph.csv?id=SERIES_ID`

Some series, especially DKW and the 10Y10Y TIPS real-rate measure, may require additional source confirmation before final automation.
