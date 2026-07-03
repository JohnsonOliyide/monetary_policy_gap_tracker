# Monetary Policy Gap Tracker

**Tracking whether monetary policy is restrictive or accommodative across alternative r\* estimates.**

This dashboard compares the real policy rate with alternative estimates of the natural rate of interest, r\*, to assess whether monetary policy appears restrictive, neutral, or accommodative under the selected policy rate and inflation-expectations measure.

\[
\text{Policy gap} = (\text{Policy rate} - \text{Expected inflation}) - r^*
\]

Positive policy gaps indicate restrictive policy. Negative policy gaps indicate accommodative policy. Values close to zero suggest a neutral or ambiguous stance.

## What is included

The prototype includes:

- a left-side controls panel for policy-rate selection, inflation-expectations selection, date range, and r\* measure checkboxes;
- a latest available readings table;
- a dynamic summary of latest policy-gap readings;
- a policy-gap chart across alternative r\* measures;
- an underlying r\* estimates chart;
- same-page sections for Methodology, Sources, and About;
- author and Federal Reserve disclaimer footer.

## r\* measures

Monthly measures:

- Kansas City Fed Model-Based Natural Rate of Interest
- D’Amico-Kim-Wei Market-Based r\*
- 10-Year, 10-Year Forward TIPS Real Rate

Quarterly model-based measures:

- Holston-Laubach-Williams Natural Rate of Interest
- Laubach-Williams Natural Rate of Interest
- Lubik-Matthes Natural Rate of Interest

Quarterly policymaker-based measure:

- FOMC SEP-Implied Longer-Run Real Neutral Rate

## Inflation-expectations options

Moving-average proxies:

- Core PCE moving-average proxy
- Headline PCE moving-average proxy
- Core CPI moving-average proxy
- Headline CPI moving-average proxy

Survey/model-based expectations:

- Cleveland Fed 1-year expected inflation
- Michigan 1-year expected inflation
- New York Fed SCE 1-year expected inflation
- SPF 1-year expected inflation

When SPF is selected, all stance calculations switch to quarterly frequency.

## Frequency handling

Monthly r\* measures remain monthly. Quarterly r\* measures remain quarterly. The dashboard does not interpolate quarterly r\* estimates into monthly observations. The date range controls filter the visible chart range and the latest available readings table.

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

## Data status

The current dashboard uses illustrative sample data so the interface can run immediately. The included update pipeline is a starter structure for replacing the sample values with publicly available data from Federal Reserve sources and author calculations.

## Author and disclaimer

Author: [Johnson Oliyide](https://www.johnsonoliyide.com/)

The views expressed in this dashboard are those of the author and should not be interpreted as reflecting the views of the Federal Reserve Bank of Kansas City or the Federal Reserve System.
