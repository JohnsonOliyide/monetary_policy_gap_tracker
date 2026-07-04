const DATA_URL = 'data/data.json';
const SAMPLE_DATA_URL = 'data/sample_data.json';

const measures = {
  kc_fed: {
    short: 'KC Fed',
    full: 'Kansas City Fed Model-Based Natural Rate of Interest',
    frequency: 'Monthly',
    group: 'monthly',
    color: '#1769c2',
    dash: 'solid',
    marker: 'circle'
  },
  dkw: {
    short: 'DKW 5–10Y real short rate',
    full: 'D’Amico-Kim-Wei 5-to-10-Year-Ahead Expected Real Short Rate',
    frequency: 'Monthly',
    group: 'monthly',
    color: '#168c96',
    dash: 'solid',
    marker: 'circle'
  },
  tips_10y10y: {
    short: '10Y10Y TIPS',
    full: '10-Year, 10-Year Forward TIPS Real Rate',
    frequency: 'Monthly',
    group: 'monthly',
    color: '#8a54c7',
    dash: 'solid',
    marker: 'circle'
  },
  hlw: {
    short: 'HLW',
    full: 'Holston-Laubach-Williams Natural Rate of Interest',
    frequency: 'Quarterly',
    group: 'quarterly',
    color: '#ec7a1c',
    dash: 'dot',
    marker: 'square'
  },
  lw: {
    short: 'LW',
    full: 'Laubach-Williams Natural Rate of Interest',
    frequency: 'Quarterly',
    group: 'quarterly',
    color: '#e7a731',
    dash: 'dot',
    marker: 'square'
  },
  lubik_matthes: {
    short: 'Lubik-Matthes',
    full: 'Lubik-Matthes Natural Rate of Interest',
    frequency: 'Quarterly',
    group: 'quarterly',
    color: '#f05b24',
    dash: 'dot',
    marker: 'square'
  },
  sep_implied: {
    short: 'SEP-implied median',
    full: 'FOMC SEP-Implied Median Longer-Run Real Neutral Rate',
    frequency: 'Quarterly (SEP)',
    group: 'sep',
    color: '#0b2c5f',
    dash: 'dash',
    marker: 'diamond'
  },
  fixed_2: {
    short: 'Fixed 2% r*',
    full: 'Fixed 2% Real Natural Rate Benchmark',
    frequency: 'Monthly/quarterly',
    group: 'benchmark',
    color: '#6b7280',
    dash: 'dashdot',
    marker: 'circle-open'
  }
};

const inflationLabels = {
  core_pce_ma: 'Core PCE moving-average proxy',
  headline_pce_ma: 'Headline PCE moving-average proxy',
  core_cpi_ma: 'Core CPI moving-average proxy',
  headline_cpi_ma: 'Headline CPI moving-average proxy',
  cleveland_1y: 'Cleveland Fed 1-year expected inflation',
  michigan_1y: 'Michigan 1-year expected inflation',
  nyfed_sce_1y: 'NY Fed SCE 1-year expected inflation',
  spf_1y: 'SPF 1-year expected inflation'
};

const policyLabels = {
  effr: 'Effective Federal Funds Rate',
  treasury_1y: '1-Year Treasury Yield'
};

let rawData;
const DEFAULT_FLOOR_DATE = '2000-01-01';
let fullStartDate = null;
let fullEndDate = null;
let userHasCustomDateRange = false;
let suppressDateChange = false;

function parseDateMs(dateStr) {
  return new Date(dateStr + 'T00:00:00Z').getTime();
}

function getDateRange() {
  const startEl = document.getElementById('startDate');
  const endEl = document.getElementById('endDate');
  let start = startEl && startEl.value ? startEl.value : fullStartDate;
  let end = endEl && endEl.value ? endEl.value : fullEndDate;
  if (start && end && parseDateMs(start) > parseDateMs(end)) {
    [start, end] = [end, start];
  }
  return { start, end };
}

function inSelectedDateRange(row) {
  if (!row || !row.date) return false;
  const { start, end } = getDateRange();
  const t = parseDateMs(row.date);
  if (start && t < parseDateMs(start)) return false;
  if (end && t > parseDateMs(end)) return false;
  return true;
}

function filterDateRows(rows) {
  return rows.filter(inSelectedDateRange);
}

function hasNumber(value) {
  return value !== null && value !== undefined && !Number.isNaN(value);
}

function validDatesForRealRate(policyKey, inflationKey) {
  const spfMode = inflationKey === 'spf_1y';
  const sourceRows = spfMode ? rawData.quarters : rawData.months;
  return sourceRows
    .filter(row => hasNumber(row.policy?.[policyKey]) && hasNumber(row.inflation?.[inflationKey]))
    .map(row => row.date)
    .sort();
}

function validDatesForMeasure(measureId, policyKey, inflationKey) {
  const spfMode = inflationKey === 'spf_1y';
  const dates = [];

  if (measureId === 'sep_implied') {
    rawData.sep.forEach(row => {
      const qi = getPolicyAndInflationForQuarter(row.quarter, policyKey, inflationKey);
      const gap = policyGap(qi.policy, qi.inflation, row.rstar);
      if (gap !== null) dates.push(row.date);
    });
    return dates.sort();
  }

  if (spfMode) {
    const monthlyQuarterAverages = isMonthlyMeasure(measureId) ? averageMonthlyRstarByQuarter(measureId) : null;
    rawData.quarters.forEach(qrow => {
      const rstar = isMonthlyMeasure(measureId) ? monthlyQuarterAverages.get(qrow.quarter) : getRstarFromQuarter(qrow, measureId);
      const gap = policyGap(qrow.policy?.[policyKey], qrow.inflation?.[inflationKey], rstar);
      if (gap !== null) dates.push(qrow.date);
    });
    return dates.sort();
  }

  if (isMonthlyMeasure(measureId)) {
    rawData.months.forEach(row => {
      const rstar = getRstarFromMonth(row, measureId);
      const gap = policyGap(row.policy?.[policyKey], row.inflation?.[inflationKey], rstar);
      if (gap !== null) dates.push(row.date);
    });
    return dates.sort();
  }

  rawData.quarters.forEach(qrow => {
    const rstar = getRstarFromQuarter(qrow, measureId);
    const gap = policyGap(qrow.policy?.[policyKey], qrow.inflation?.[inflationKey], rstar);
    if (gap !== null) dates.push(qrow.date);
  });
  return dates.sort();
}

function computeAvailableRange() {
  const policyKey = document.getElementById('policySelect')?.value || 'effr';
  const inflationKey = document.getElementById('inflationSelect')?.value || 'core_pce_ma';

  // The display sample is determined by the selected policy rate and
  // inflation-expectations measure, not by the latest-starting natural-rate
  // measure. Natural-rate lines enter the charts whenever they become
  // available inside this real-policy-rate sample.
  const dates = validDatesForRealRate(policyKey, inflationKey);

  if (!dates.length) {
    return { start: DEFAULT_FLOOR_DATE, end: DEFAULT_FLOOR_DATE };
  }

  const firstValidDate = dates.find(d => parseDateMs(d) >= parseDateMs(DEFAULT_FLOOR_DATE)) || dates[0];
  const start = parseDateMs(firstValidDate) > parseDateMs(DEFAULT_FLOOR_DATE) ? firstValidDate : DEFAULT_FLOOR_DATE;
  const end = dates[dates.length - 1];
  return { start, end };
}

function formatRangeDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', timeZone: 'UTC' });
}

function syncDateControlsToAvailableRange({ resetStart = false, resetEnd = false } = {}) {
  const range = computeAvailableRange();
  fullStartDate = range.start;
  fullEndDate = range.end;

  const startEl = document.getElementById('startDate');
  const endEl = document.getElementById('endDate');
  const rangeNote = document.getElementById('availableRangeNote');
  if (!startEl || !endEl) return;

  suppressDateChange = true;
  startEl.min = fullStartDate;
  startEl.max = fullEndDate;
  endEl.min = fullStartDate;
  endEl.max = fullEndDate;

  if (resetStart || !startEl.value || parseDateMs(startEl.value) < parseDateMs(fullStartDate) || parseDateMs(startEl.value) > parseDateMs(fullEndDate)) {
    startEl.value = fullStartDate;
  }
  if (resetEnd || !endEl.value || parseDateMs(endEl.value) > parseDateMs(fullEndDate) || parseDateMs(endEl.value) < parseDateMs(startEl.value)) {
    endEl.value = fullEndDate;
  }
  if (parseDateMs(startEl.value) > parseDateMs(endEl.value)) {
    startEl.value = fullStartDate;
    endEl.value = fullEndDate;
  }
  suppressDateChange = false;

  if (rangeNote) {
    rangeNote.textContent = `Start date adjusts to the selected inflation expectation and policy rate. Current range: ${formatRangeDate(fullStartDate)} to ${formatRangeDate(fullEndDate)}.`;
  }
}

function initDateControls() {
  syncDateControlsToAvailableRange({ resetStart: true, resetEnd: true });
}

function fmt(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return Number(value).toFixed(digits);
}

function avg(nums) {
  const vals = nums.filter(v => v !== null && v !== undefined && !Number.isNaN(v));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function selectedMeasures() {
  return Array.from(document.querySelectorAll('input[data-measure]:checked')).map(el => el.dataset.measure);
}

function selectedLwType() {
  return document.getElementById('lwTypeSelect')?.value || 'one_sided';
}

function getQuarterRow(q) {
  return rawData.quarters.find(d => d.quarter === q);
}

function getRstarFromQuarter(row, measureId) {
  if (!row) return null;
  if (measureId === 'fixed_2') return 2;
  if (measureId === 'sep_implied') return row.rstar;
  if (!row.rstar) return null;
  if (measureId === 'lw') {
    const lwKey = selectedLwType() === 'two_sided' ? 'lw_two_sided' : 'lw_one_sided';
    return row.rstar[lwKey] ?? row.rstar.lw ?? null;
  }
  return row.rstar[measureId] ?? null;
}

function getRstarFromMonth(row, measureId) {
  if (!row) return null;
  if (measureId === 'fixed_2') return 2;
  if (!row.rstar) return null;
  return row.rstar[measureId] ?? null;
}

function getPolicyAndInflationForQuarter(q, policyKey, inflationKey) {
  const row = getQuarterRow(q);
  if (!row) return { policy: null, inflation: null, realRate: null };
  const policy = row.policy[policyKey];
  const inflation = row.inflation[inflationKey];
  return { policy, inflation, realRate: policy - inflation };
}

function policyGap(policy, inflation, rstar) {
  if ([policy, inflation, rstar].some(v => v === null || v === undefined || Number.isNaN(v))) return null;
  return policy - inflation - rstar;
}

function stanceClass(gap) {
  if (gap === null || gap === undefined || Number.isNaN(gap)) return '—';
  if (Math.abs(gap) < 0.05) return 'Neutral';
  return gap > 0 ? 'Restrictive' : 'Accommodative';
}

function stanceClassName(stance) {
  return String(stance).toLowerCase();
}

function averageMonthlyRstarByQuarter(measureId) {
  const out = new Map();
  const quarters = [...new Set(rawData.months.map(m => m.quarter))];
  quarters.forEach(q => {
    const ms = rawData.months.filter(m => m.quarter === q);
    const vals = ms.map(m => getRstarFromMonth(m, measureId)).filter(v => v !== null && v !== undefined);
    if (vals.length) out.set(q, avg(vals));
  });
  return out;
}

function isMonthlyMeasure(measureId) {
  return measures[measureId].group === 'monthly' || measures[measureId].group === 'benchmark';
}

function buildGapTrace(measureId, policyKey, inflationKey) {
  const meta = measures[measureId];
  const spfMode = inflationKey === 'spf_1y';
  const x = [];
  const y = [];
  const text = [];

  if (measureId === 'sep_implied') {
    filterDateRows(rawData.sep).forEach(row => {
      const qi = getPolicyAndInflationForQuarter(row.quarter, policyKey, inflationKey);
      const gap = policyGap(qi.policy, qi.inflation, row.rstar);
      if (gap !== null) {
        x.push(row.date);
        y.push(gap);
        text.push(`${row.period}<br>Real rate: ${fmt(qi.realRate)}%<br>r*: ${fmt(row.rstar)}%<br>Gap: ${fmt(gap)}%`);
      }
    });
  } else if (spfMode) {
    const monthlyQuarterAverages = isMonthlyMeasure(measureId) ? averageMonthlyRstarByQuarter(measureId) : null;
    filterDateRows(rawData.quarters).forEach(qrow => {
      const rstar = isMonthlyMeasure(measureId) ? monthlyQuarterAverages.get(qrow.quarter) : getRstarFromQuarter(qrow, measureId);
      const gap = policyGap(qrow.policy[policyKey], qrow.inflation[inflationKey], rstar);
      if (gap !== null) {
        x.push(qrow.date);
        y.push(gap);
        text.push(`${qrow.period}<br>Real rate: ${fmt(qrow.policy[policyKey] - qrow.inflation[inflationKey])}%<br>r*: ${fmt(rstar)}%<br>Gap: ${fmt(gap)}%`);
      }
    });
  } else if (isMonthlyMeasure(measureId)) {
    filterDateRows(rawData.months).forEach(row => {
      const rstar = getRstarFromMonth(row, measureId);
      const gap = policyGap(row.policy[policyKey], row.inflation[inflationKey], rstar);
      if (gap !== null) {
        x.push(row.date);
        y.push(gap);
        text.push(`${row.period}<br>Real rate: ${fmt(row.policy[policyKey] - row.inflation[inflationKey])}%<br>r*: ${fmt(rstar)}%<br>Gap: ${fmt(gap)}%`);
      }
    });
  } else {
    filterDateRows(rawData.quarters).forEach(qrow => {
      const rstar = getRstarFromQuarter(qrow, measureId);
      const gap = policyGap(qrow.policy[policyKey], qrow.inflation[inflationKey], rstar);
      if (gap !== null) {
        x.push(qrow.date);
        y.push(gap);
        text.push(`${qrow.period}<br>Real rate: ${fmt(qrow.policy[policyKey] - qrow.inflation[inflationKey])}%<br>r*: ${fmt(rstar)}%<br>Gap: ${fmt(gap)}%`);
      }
    });
  }

  return {
    x, y, text,
    type: 'scatter',
    mode: isMonthlyMeasure(measureId) && !spfMode ? 'lines' : 'lines+markers',
    name: meta.short,
    line: { color: meta.color, dash: meta.dash, width: isMonthlyMeasure(measureId) ? 2.5 : 2 },
    marker: { color: meta.color, symbol: meta.marker, size: 7 },
    hovertemplate: '%{text}<extra></extra>'
  };
}

function buildRstarTrace(measureId, inflationKey) {
  const meta = measures[measureId];
  const x = [];
  const y = [];
  const text = [];

  if (measureId === 'sep_implied') {
    filterDateRows(rawData.sep).forEach(row => {
      x.push(row.date);
      y.push(row.rstar);
      text.push(`${row.period}<br>r*: ${fmt(row.rstar)}%`);
    });
  } else if (isMonthlyMeasure(measureId)) {
    filterDateRows(rawData.months).forEach(row => {
      const rstar = getRstarFromMonth(row, measureId);
      if (rstar !== null) {
        x.push(row.date);
        y.push(rstar);
        text.push(`${row.period}<br>r*: ${fmt(rstar)}%`);
      }
    });
  } else {
    filterDateRows(rawData.quarters).forEach(row => {
      const rstar = getRstarFromQuarter(row, measureId);
      if (rstar !== null) {
        x.push(row.date);
        y.push(rstar);
        text.push(`${row.period}<br>r*: ${fmt(rstar)}%`);
      }
    });
  }

  return {
    x, y, text,
    type: 'scatter',
    mode: isMonthlyMeasure(measureId) ? 'lines' : 'lines+markers',
    name: meta.short,
    line: { color: meta.color, dash: meta.dash, width: 2.2 },
    marker: { color: meta.color, symbol: meta.marker, size: 7 },
    hovertemplate: '%{text}<extra></extra>'
  };
}

function buildRealRateTrace(policyKey, inflationKey) {
  const spfMode = inflationKey === 'spf_1y';
  const rows = filterDateRows(spfMode ? rawData.quarters : rawData.months);
  return {
    x: rows.map(d => d.date),
    y: rows.map(d => d.policy[policyKey] - d.inflation[inflationKey]),
    text: rows.map(d => `${d.period}<br>Policy rate: ${fmt(d.policy[policyKey])}%<br>Expected inflation: ${fmt(d.inflation[inflationKey])}%<br>Real rate: ${fmt(d.policy[policyKey] - d.inflation[inflationKey])}%`),
    type: 'scatter',
    mode: 'lines',
    name: 'Real policy rate',
    line: { color: '#0b2c5f', width: 2.8 },
    hovertemplate: '%{text}<extra></extra>'
  };
}

function latestReading(measureId, policyKey, inflationKey) {
  const meta = measures[measureId];
  const spfMode = inflationKey === 'spf_1y';

  if (measureId === 'sep_implied') {
    const row = [...filterDateRows(rawData.sep)].reverse()[0];
    if (!row) return null;
    const qi = getPolicyAndInflationForQuarter(row.quarter, policyKey, inflationKey);
    const gap = policyGap(qi.policy, qi.inflation, row.rstar);
    return { measureId, period: row.period, frequency: meta.frequency, policy: qi.policy, inflation: qi.inflation, realRate: qi.realRate, rstar: row.rstar, gap };
  }

  if (spfMode) {
    const qrow = [...filterDateRows(rawData.quarters)].reverse().find(q => q.inflation[inflationKey] !== undefined);
    if (!qrow) return null;
    let rstar;
    if (isMonthlyMeasure(measureId)) {
      rstar = averageMonthlyRstarByQuarter(measureId).get(qrow.quarter);
    } else {
      rstar = getRstarFromQuarter(qrow, measureId);
    }
    const policy = qrow.policy[policyKey];
    const inflation = qrow.inflation[inflationKey];
    const gap = policyGap(policy, inflation, rstar);
    return { measureId, period: qrow.period, frequency: 'Quarterly', policy, inflation, realRate: policy - inflation, rstar, gap };
  }

  if (isMonthlyMeasure(measureId)) {
    const row = [...filterDateRows(rawData.months)].reverse().find(d => getRstarFromMonth(d, measureId) !== null);
    if (!row) return null;
    const policy = row.policy[policyKey];
    const inflation = row.inflation[inflationKey];
    const rstar = getRstarFromMonth(row, measureId);
    const gap = policyGap(policy, inflation, rstar);
    return { measureId, period: row.period, frequency: meta.frequency, policy, inflation, realRate: policy - inflation, rstar, gap };
  }

  const qrow = [...filterDateRows(rawData.quarters)].reverse().find(d => getRstarFromQuarter(d, measureId) !== null);
  if (!qrow) return null;
  const policy = qrow.policy[policyKey];
  const inflation = qrow.inflation[inflationKey];
  const rstar = getRstarFromQuarter(qrow, measureId);
  const gap = policyGap(policy, inflation, rstar);
  return { measureId, period: qrow.period, frequency: meta.frequency, policy, inflation, realRate: policy - inflation, rstar, gap };
}

function chartLayout(base = {}) {
  const { start, end } = getDateRange();
  const baseXAxis = { gridcolor: '#eef2f7', zeroline: false, tickformat: '%Y' };
  if (start && end) baseXAxis.range = [start, end];
  const layout = {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { family: 'Inter, Segoe UI, sans-serif', color: '#172033', size: 12 },
    margin: { l: 54, r: 28, t: 18, b: 64 },
    legend: { orientation: 'h', y: -0.25, x: 0, font: { size: 12 } },
    xaxis: baseXAxis,
    yaxis: { gridcolor: '#eef2f7', zeroline: false, ticksuffix: '%', title: '' },
    hovermode: 'x unified',
    ...base
  };
  layout.xaxis = { ...baseXAxis, ...(base.xaxis || {}) };
  return layout;
}

function renderCharts() {
  const policyKey = document.getElementById('policySelect').value;
  const inflationKey = document.getElementById('inflationSelect').value;
  const activeMeasures = selectedMeasures();

  const stanceTraces = activeMeasures.map(id => buildGapTrace(id, policyKey, inflationKey)).filter(t => t && t.x.length);
  const rstarTraces = activeMeasures.map(id => buildRstarTrace(id, inflationKey)).filter(t => t && t.x.length);
  const realRateTrace = buildRealRateTrace(policyKey, inflationKey);

  const stanceLayout = chartLayout({
    yaxis: { gridcolor: '#eef2f7', zeroline: false, ticksuffix: '%', title: 'Policy gap (%)', range: [-4, 4] },
    shapes: [{ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: 0, y1: 0, line: { color: '#6f7c8f', width: 1.5 } }],
    annotations: [
      { text: 'Neutral', xref: 'paper', x: 1.01, y: 0, showarrow: false, xanchor: 'left', font: { color: '#4b5563', size: 12 } },
      { text: 'Restrictive', xref: 'paper', x: 0.52, y: 3.3, showarrow: false, font: { color: '#6b7280', size: 13 } },
      { text: 'Accommodative', xref: 'paper', x: 0.52, y: -3.3, showarrow: false, font: { color: '#6b7280', size: 13 } }
    ]
  });

  const realRateLayout = chartLayout({
    yaxis: { gridcolor: '#eef2f7', zeroline: false, ticksuffix: '%', title: 'Real policy rate (%)' },
    margin: { l: 54, r: 24, t: 12, b: 58 }
  });

  const rstarLayout = chartLayout({
    yaxis: { gridcolor: '#eef2f7', zeroline: false, ticksuffix: '%', title: 'r* (%)', range: [-2.2, 3.5] },
    margin: { l: 54, r: 24, t: 12, b: 58 }
  });

  Plotly.react('stanceChart', stanceTraces, stanceLayout, { responsive: true, displayModeBar: false });
  Plotly.react('realRateChart', [realRateTrace], realRateLayout, { responsive: true, displayModeBar: false });
  Plotly.react('rstarChart', rstarTraces, rstarLayout, { responsive: true, displayModeBar: false });
}

function renderTableAndSummary() {
  const policyKey = document.getElementById('policySelect').value;
  const inflationKey = document.getElementById('inflationSelect').value;
  const policyName = policyLabels[policyKey];
  const inflationName = inflationLabels[inflationKey];
  const rows = selectedMeasures().map(id => latestReading(id, policyKey, inflationKey)).filter(row => row && row.gap !== null);

  const tbody = document.getElementById('latestTableBody');
  tbody.innerHTML = '';
  rows.forEach(row => {
    const meta = measures[row.measureId];
    const stance = stanceClass(row.gap);
    const swatchClass = meta.marker === 'diamond' ? 'legend-diamond' : (isMonthlyMeasure(row.measureId) ? 'legend-swatch' : 'legend-square');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="measure-cell"><span class="${swatchClass}" style="background:${meta.color}"></span>${meta.short}</span></td>
      <td>${row.frequency}</td>
      <td>${row.period}</td>
      <td class="num">${fmt(row.policy)}</td>
      <td class="num">${fmt(row.inflation)}</td>
      <td class="num">${fmt(row.realRate)}</td>
      <td class="num">${fmt(row.rstar)}</td>
      <td class="num" style="font-weight:900;color:${meta.color}">${fmt(row.gap)}</td>
      <td class="stance ${stanceClassName(stance)}">${stance}</td>
    `;
    tbody.appendChild(tr);
  });

  const ul = document.getElementById('summaryBullets');
  if (!rows.length) {
    ul.innerHTML = '<li>No selected measures have observations inside the selected date range.</li>';
    return;
  }

  const positive = rows.filter(r => r.gap > 0.05).length;
  const negative = rows.filter(r => r.gap < -0.05).length;
  const neutral = rows.length - positive - negative;
  const spfSentence = inflationKey === 'spf_1y'
    ? 'Because SPF is quarterly, all displayed stance estimates are calculated at quarterly frequency.'
    : 'Monthly natural-rate measures remain monthly, while quarterly natural-rate measures remain quarterly.';

  const bullets = [
    `Using ${policyName} and the ${inflationName}, ${positive} of ${rows.length} displayed measures imply a positive policy gap${positive ? ' and therefore a restrictive stance' : ''}.`,
    `${spfSentence} Latest reference periods differ across measures.`,
    `Differences across measures should be read as differences in the estimated natural rate of interest, not as inconsistencies in the policy-gap formula.`
  ];
  if (negative > 0 || neutral > 0) {
    bullets.splice(1, 0, `${negative} displayed measure${negative === 1 ? '' : 's'} imply accommodation and ${neutral} are approximately neutral under the current settings.`);
  }
  ul.innerHTML = bullets.map(b => `<li>${b}</li>`).join('');
}

function updateLabels() {
  const policyKey = document.getElementById('policySelect').value;
  const inflationKey = document.getElementById('inflationSelect').value;
  const policyName = policyLabels[policyKey];
  const inflationName = inflationLabels[inflationKey];

  document.getElementById('stanceSubtitle').textContent = `Policy stance in this view is calculated using ${policyName} and ${inflationName}.`;
  document.getElementById('realRateSubtitle').textContent = `Real policy rate implied by ${policyName} and ${inflationName}.`;
  document.getElementById('tableSubtitle').textContent = `Stance calculated using ${policyName} and ${inflationName}.`;
  document.getElementById('selectedPolicyLabel').textContent = policyName;
  document.getElementById('selectedInflationLabel').textContent = inflationName;
  document.getElementById('frequencyRuleLabel').textContent = inflationKey === 'spf_1y'
    ? 'SPF is quarterly, so all displayed stance calculations are quarterly.'
    : 'Monthly measures remain monthly; quarterly measures remain quarterly.';
}

function updateAll({ preserveUserDates = true } = {}) {
  syncDateControlsToAvailableRange({ resetStart: !preserveUserDates && !userHasCustomDateRange, resetEnd: !preserveUserDates && !userHasCustomDateRange });
  updateLabels();
  renderCharts();
  renderTableAndSummary();
}

function attachEvents() {
  ['inflationSelect', 'policySelect', 'lwTypeSelect'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => updateAll({ preserveUserDates: userHasCustomDateRange }));
  });

  ['startDate', 'endDate'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => {
      if (!suppressDateChange) userHasCustomDateRange = true;
      updateAll({ preserveUserDates: true });
    });
  });

  document.getElementById('resetDates').addEventListener('click', () => {
    userHasCustomDateRange = false;
    syncDateControlsToAvailableRange({ resetStart: true, resetEnd: true });
    updateAll({ preserveUserDates: true });
  });
  document.querySelectorAll('input[data-measure]').forEach(el => el.addEventListener('change', () => updateAll({ preserveUserDates: userHasCustomDateRange })));
}

async function loadDashboardData() {
  try {
    const live = await fetch(DATA_URL, { cache: 'no-store' });
    if (live.ok) {
      const data = await live.json();
      data.__isSample = false;
      return data;
    }
    throw new Error(`Live data request returned ${live.status}`);
  } catch (liveErr) {
    console.warn('Live data unavailable; falling back to sample data.', liveErr);
    const sample = await fetch(SAMPLE_DATA_URL, { cache: 'no-store' });
    if (!sample.ok) throw new Error(`Sample data request returned ${sample.status}`);
    const data = await sample.json();
    data.__isSample = true;
    return data;
  }
}

loadDashboardData()
  .then(data => {
    rawData = data;
    initDateControls();
    attachEvents();
    updateAll();
    if (rawData.__isSample) {
      document.body.insertAdjacentHTML('afterbegin', `<div class="data-warning">Showing illustrative sample data because data/data.json has not been generated yet. Run <code>python scripts/update_data.py</code> or the GitHub Action to build the live data file.</div>`);
    }
  })
  .catch(err => {
    console.error(err);
    document.body.insertAdjacentHTML('afterbegin', `<div style="padding:20px;background:#fff3cd;color:#6b4e00">Could not load dashboard data. Run this dashboard from a local web server rather than opening index.html directly.</div>`);
  });
