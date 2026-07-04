const DATA_URL = 'data/sample_data.json';

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
    short: 'DKW',
    full: 'D’Amico-Kim-Wei Market-Based r*',
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
    short: 'SEP-implied',
    full: 'FOMC SEP-Implied Longer-Run Real Neutral Rate',
    frequency: 'Quarterly (SEP)',
    group: 'quarterly',
    color: '#0b2c5f',
    dash: 'dash',
    marker: 'diamond'
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
let fullStartDate = null;
let fullEndDate = null;

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
  const { start, end } = getDateRange();
  if (!row || !row.date) return false;
  const t = parseDateMs(row.date);
  if (start && t < parseDateMs(start)) return false;
  if (end && t > parseDateMs(end)) return false;
  return true;
}

function filterDateRows(rows) {
  return rows.filter(inSelectedDateRange);
}

function initDateControls() {
  const allDates = [
    ...rawData.months.map(d => d.date),
    ...rawData.quarters.map(d => d.date),
    ...rawData.sep.map(d => d.date)
  ].sort();
  fullStartDate = allDates[0];
  fullEndDate = allDates[allDates.length - 1];

  const startEl = document.getElementById('startDate');
  const endEl = document.getElementById('endDate');
  startEl.min = fullStartDate;
  startEl.max = fullEndDate;
  endEl.min = fullStartDate;
  endEl.max = fullEndDate;
  startEl.value = fullStartDate;
  endEl.value = fullEndDate;
}

function fmt(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return Number(value).toFixed(digits);
}

function stanceClass(gap) {
  if (gap === null || gap === undefined || Number.isNaN(gap)) return '—';
  if (Math.abs(gap) < 0.05) return 'Neutral';
  return gap > 0 ? 'Restrictive' : 'Accommodative';
}

function stanceClassName(stance) {
  return stance === '—' ? '' : stance.toLowerCase();
}

function selectedMeasures() {
  return Array.from(document.querySelectorAll('input[data-measure]:checked')).map(el => el.dataset.measure);
}

function avg(nums) {
  const vals = nums.filter(v => v !== null && v !== undefined && !Number.isNaN(v));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function averageMonthlyRstarByQuarter(measureId) {
  const out = new Map();
  const quarters = [...new Set(rawData.months.map(m => m.quarter))];
  quarters.forEach(q => {
    const ms = rawData.months.filter(m => m.quarter === q && m.rstar[measureId] !== undefined);
    if (ms.length) out.set(q, avg(ms.map(m => m.rstar[measureId])));
  });
  return out;
}

function getQuarterRow(q) {
  return rawData.quarters.find(d => d.quarter === q);
}

function getLatestMonthlyMeasure(measureId) {
  const rows = filterDateRows(rawData.months).filter(d => d.rstar[measureId] !== undefined);
  return rows[rows.length - 1] || null;
}

function getLatestQuarterlyMeasure(measureId) {
  const rows = filterDateRows(rawData.quarters).filter(d => d.rstar[measureId] !== undefined);
  return rows[rows.length - 1] || null;
}

function getLatestSepMeasure() {
  const rows = filterDateRows(rawData.sep);
  return rows[rows.length - 1] || null;
}

function policyGap(policy, inflation, rstar) {
  if ([policy, inflation, rstar].some(v => v === null || v === undefined || Number.isNaN(v))) return null;
  return policy - inflation - rstar;
}

function realPolicyRate(policy, inflation) {
  if ([policy, inflation].some(v => v === null || v === undefined || Number.isNaN(v))) return null;
  return policy - inflation;
}

function getPolicyAndInflationForQuarter(q, policyKey, inflationKey) {
  const row = getQuarterRow(q);
  if (!row) return { policy: null, inflation: null };
  return { policy: row.policy[policyKey], inflation: row.inflation[inflationKey] };
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
        text.push(`${row.period}<br>Real rate: ${fmt(realPolicyRate(qi.policy, qi.inflation))}%<br>r*: ${fmt(row.rstar)}%<br>Gap: ${fmt(gap)}%`);
      }
    });
  } else if (spfMode) {
    const monthlyQuarterAverages = meta.group === 'monthly' ? averageMonthlyRstarByQuarter(measureId) : null;
    filterDateRows(rawData.quarters).forEach(qrow => {
      const rstar = meta.group === 'monthly' ? monthlyQuarterAverages.get(qrow.quarter) : qrow.rstar[measureId];
      if (rstar === undefined || rstar === null) return;
      const gap = policyGap(qrow.policy[policyKey], qrow.inflation[inflationKey], rstar);
      if (gap !== null) {
        x.push(qrow.date);
        y.push(gap);
        text.push(`${qrow.period}<br>Real rate: ${fmt(realPolicyRate(qrow.policy[policyKey], qrow.inflation[inflationKey]))}%<br>r*: ${fmt(rstar)}%<br>Gap: ${fmt(gap)}%`);
      }
    });
  } else if (meta.group === 'monthly') {
    filterDateRows(rawData.months).forEach(row => {
      const rstar = row.rstar[measureId];
      const gap = policyGap(row.policy[policyKey], row.inflation[inflationKey], rstar);
      if (gap !== null) {
        x.push(row.date);
        y.push(gap);
        text.push(`${row.period}<br>Real rate: ${fmt(realPolicyRate(row.policy[policyKey], row.inflation[inflationKey]))}%<br>r*: ${fmt(rstar)}%<br>Gap: ${fmt(gap)}%`);
      }
    });
  } else {
    filterDateRows(rawData.quarters).forEach(qrow => {
      const rstar = qrow.rstar[measureId];
      const gap = policyGap(qrow.policy[policyKey], qrow.inflation[inflationKey], rstar);
      if (gap !== null) {
        x.push(qrow.date);
        y.push(gap);
        text.push(`${qrow.period}<br>Real rate: ${fmt(realPolicyRate(qrow.policy[policyKey], qrow.inflation[inflationKey]))}%<br>r*: ${fmt(rstar)}%<br>Gap: ${fmt(gap)}%`);
      }
    });
  }

  return {
    x, y, text,
    type: 'scatter',
    mode: meta.group === 'monthly' && !spfMode ? 'lines' : 'lines+markers',
    name: meta.short,
    line: { color: meta.color, dash: meta.group === 'monthly' && !spfMode ? meta.dash : (meta.group === 'monthly' ? 'solid' : meta.dash), width: meta.group === 'monthly' && !spfMode ? 2.5 : 2 },
    marker: { color: meta.color, symbol: meta.marker, size: 7 },
    hovertemplate: '%{text}<extra></extra>'
  };
}

function buildRstarTrace(measureId) {
  const meta = measures[measureId];
  let rows;
  if (measureId === 'sep_implied') {
    rows = filterDateRows(rawData.sep);
    return {
      x: rows.map(d => d.date),
      y: rows.map(d => d.rstar),
      text: rows.map(d => `${d.period}<br>r*: ${fmt(d.rstar)}%`),
      type: 'scatter',
      mode: 'lines+markers',
      name: meta.short,
      line: { color: meta.color, dash: meta.dash, width: 2 },
      marker: { color: meta.color, symbol: meta.marker, size: 7 },
      hovertemplate: '%{text}<extra></extra>'
    };
  }

  if (meta.group === 'monthly') {
    rows = filterDateRows(rawData.months).filter(d => d.rstar[measureId] !== undefined);
    return {
      x: rows.map(d => d.date),
      y: rows.map(d => d.rstar[measureId]),
      text: rows.map(d => `${d.period}<br>r*: ${fmt(d.rstar[measureId])}%`),
      type: 'scatter',
      mode: 'lines',
      name: meta.short,
      line: { color: meta.color, dash: meta.dash, width: 2.5 },
      hovertemplate: '%{text}<extra></extra>'
    };
  }

  rows = filterDateRows(rawData.quarters).filter(d => d.rstar[measureId] !== undefined);
  return {
    x: rows.map(d => d.date),
    y: rows.map(d => d.rstar[measureId]),
    text: rows.map(d => `${d.period}<br>r*: ${fmt(d.rstar[measureId])}%`),
    type: 'scatter',
    mode: 'lines+markers',
    name: meta.short,
    line: { color: meta.color, dash: meta.dash, width: 2 },
    marker: { color: meta.color, symbol: meta.marker, size: 7 },
    hovertemplate: '%{text}<extra></extra>'
  };
}

function buildRealRateTraces(policyKey, inflationKey) {
  const traces = [];
  if (inflationKey === 'spf_1y') {
    const rows = filterDateRows(rawData.quarters).filter(d => d.inflation[inflationKey] !== undefined);
    traces.push({
      x: rows.map(d => d.date),
      y: rows.map(d => realPolicyRate(d.policy[policyKey], d.inflation[inflationKey])),
      text: rows.map(d => `${d.period}<br>Real rate: ${fmt(realPolicyRate(d.policy[policyKey], d.inflation[inflationKey]))}%`),
      type: 'scatter',
      mode: 'lines+markers',
      name: 'Quarterly real policy rate',
      line: { color: '#0b2c5f', width: 2.5 },
      marker: { color: '#0b2c5f', size: 7 },
      hovertemplate: '%{text}<extra></extra>'
    });
    return traces;
  }

  const months = filterDateRows(rawData.months).filter(d => d.inflation[inflationKey] !== undefined);
  traces.push({
    x: months.map(d => d.date),
    y: months.map(d => realPolicyRate(d.policy[policyKey], d.inflation[inflationKey])),
    text: months.map(d => `${d.period}<br>Real rate: ${fmt(realPolicyRate(d.policy[policyKey], d.inflation[inflationKey]))}%`),
    type: 'scatter',
    mode: 'lines',
    name: 'Monthly real policy rate',
    line: { color: '#0b2c5f', width: 2.8 },
    hovertemplate: '%{text}<extra></extra>'
  });

  const quarters = filterDateRows(rawData.quarters).filter(d => d.inflation[inflationKey] !== undefined);
  traces.push({
    x: quarters.map(d => d.date),
    y: quarters.map(d => realPolicyRate(d.policy[policyKey], d.inflation[inflationKey])),
    text: quarters.map(d => `${d.period}<br>Quarterly real rate: ${fmt(realPolicyRate(d.policy[policyKey], d.inflation[inflationKey]))}%`),
    type: 'scatter',
    mode: 'markers',
    name: 'Quarterly real policy rate',
    marker: { color: '#5a667a', size: 7, symbol: 'circle-open', line: { width: 1.5 } },
    hovertemplate: '%{text}<extra></extra>'
  });
  return traces;
}

function latestReading(measureId, policyKey, inflationKey) {
  const meta = measures[measureId];
  const spfMode = inflationKey === 'spf_1y';

  if (measureId === 'sep_implied') {
    const row = getLatestSepMeasure();
    if (!row) return null;
    const qi = getPolicyAndInflationForQuarter(row.quarter, policyKey, inflationKey);
    const realRate = realPolicyRate(qi.policy, qi.inflation);
    const gap = policyGap(qi.policy, qi.inflation, row.rstar);
    return gap === null ? null : { measureId, period: row.period, frequency: meta.frequency, realRate, rstar: row.rstar, gap };
  }

  if (spfMode) {
    const qrow = [...filterDateRows(rawData.quarters)].reverse().find(q => q.inflation[inflationKey] !== undefined);
    if (!qrow) return null;
    let rstar = null;
    if (meta.group === 'monthly') {
      const map = averageMonthlyRstarByQuarter(measureId);
      rstar = map.get(qrow.quarter);
    } else {
      rstar = qrow.rstar[measureId];
    }
    const realRate = realPolicyRate(qrow.policy[policyKey], qrow.inflation[inflationKey]);
    const gap = policyGap(qrow.policy[policyKey], qrow.inflation[inflationKey], rstar);
    return gap === null ? null : { measureId, period: qrow.period, frequency: 'Quarterly', realRate, rstar, gap };
  }

  if (meta.group === 'monthly') {
    const row = getLatestMonthlyMeasure(measureId);
    if (!row) return null;
    const realRate = realPolicyRate(row.policy[policyKey], row.inflation[inflationKey]);
    const gap = policyGap(row.policy[policyKey], row.inflation[inflationKey], row.rstar[measureId]);
    return gap === null ? null : { measureId, period: row.period, frequency: meta.frequency, realRate, rstar: row.rstar[measureId], gap };
  }

  const qrow = getLatestQuarterlyMeasure(measureId);
  if (!qrow) return null;
  const realRate = realPolicyRate(qrow.policy[policyKey], qrow.inflation[inflationKey]);
  const gap = policyGap(qrow.policy[policyKey], qrow.inflation[inflationKey], qrow.rstar[measureId]);
  return gap === null ? null : { measureId, period: qrow.period, frequency: meta.frequency, realRate, rstar: qrow.rstar[measureId], gap };
}

function commonPlotLayout() {
  return {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { family: 'Inter, Segoe UI, sans-serif', color: '#172033', size: 12 },
    margin: { l: 52, r: 26, t: 14, b: 58 },
    legend: { orientation: 'h', y: -0.22, x: 0, font: { size: 12 } },
    xaxis: { gridcolor: '#eef2f7', zeroline: false, tickformat: '%Y' },
    yaxis: { gridcolor: '#eef2f7', zeroline: false, ticksuffix: '%', title: '' },
    hovermode: 'x unified'
  };
}

function renderCharts() {
  const policyKey = document.getElementById('policySelect').value;
  const inflationKey = document.getElementById('inflationSelect').value;
  const activeMeasures = selectedMeasures();

  const stanceTraces = activeMeasures.map(id => buildGapTrace(id, policyKey, inflationKey)).filter(t => t && t.x.length);
  const rstarTraces = activeMeasures.map(id => buildRstarTrace(id)).filter(t => t && t.x.length);
  const realRateTraces = buildRealRateTraces(policyKey, inflationKey).filter(t => t && t.x.length);

  const base = commonPlotLayout();
  const stanceLayout = {
    ...base,
    yaxis: { ...base.yaxis, title: 'Policy gap (%)' },
    shapes: [{ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: 0, y1: 0, line: { color: '#6f7c8f', width: 1.5 } }],
    annotations: [
      { text: 'Neutral', xref: 'paper', x: 1.01, y: 0, showarrow: false, xanchor: 'left', font: { color: '#4b5563', size: 12 } },
      { text: 'Restrictive', xref: 'paper', x: 0.52, yref: 'paper', y: 0.95, showarrow: false, font: { color: '#6b7280', size: 13 } },
      { text: 'Accommodative', xref: 'paper', x: 0.52, yref: 'paper', y: 0.05, showarrow: false, font: { color: '#6b7280', size: 13 } }
    ]
  };
  const realRateLayout = {
    ...base,
    yaxis: { ...base.yaxis, title: 'Real policy rate (%)' },
    margin: { l: 52, r: 22, t: 10, b: 58 },
    shapes: [{ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: 0, y1: 0, line: { color: '#c7d0dd', width: 1 } }]
  };
  const rstarLayout = {
    ...base,
    yaxis: { ...base.yaxis, title: 'r* (%)' },
    margin: { l: 52, r: 22, t: 10, b: 58 }
  };

  Plotly.react('stanceChart', stanceTraces, stanceLayout, { responsive: true, displayModeBar: false });
  Plotly.react('realRateChart', realRateTraces, realRateLayout, { responsive: true, displayModeBar: false });
  Plotly.react('rstarChart', rstarTraces, rstarLayout, { responsive: true, displayModeBar: false });
}

function renderTableAndSummary() {
  const policyKey = document.getElementById('policySelect').value;
  const inflationKey = document.getElementById('inflationSelect').value;
  const policyName = policyLabels[policyKey];
  const inflationName = inflationLabels[inflationKey];
  const rows = selectedMeasures().map(id => latestReading(id, policyKey, inflationKey)).filter(Boolean);

  const tbody = document.getElementById('latestTableBody');
  tbody.innerHTML = '';
  rows.forEach(row => {
    const meta = measures[row.measureId];
    const stance = stanceClass(row.gap);
    const swatchClass = meta.marker === 'diamond' ? 'legend-diamond' : (meta.group === 'monthly' ? 'legend-swatch' : 'legend-square');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="measure-cell"><span class="${swatchClass}" style="background:${meta.color}"></span>${meta.short}</span></td>
      <td>${row.frequency}</td>
      <td>${row.period}</td>
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
    : 'Monthly r* measures remain monthly, while quarterly r* measures remain quarterly.';

  const bullets = [
    `Using ${policyName} and the ${inflationName}, ${positive} of ${rows.length} displayed measures imply a positive policy gap${positive ? ' and therefore a restrictive stance' : ''}.`,
    `${spfSentence} Latest reference periods differ across measures.`,
    `Differences across measures should be read as differences in the estimated neutral rate, not as inconsistencies in the policy-gap formula.`
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

  document.getElementById('stanceSubtitle').textContent = `Policy stance in this view is calculated using the selected policy rate: ${policyName}, and the selected inflation expectation: ${inflationName}.`;
  document.getElementById('realRateSubtitle').textContent = `Real policy rate calculated as ${policyName} minus ${inflationName}.`;
  document.getElementById('tableSubtitle').textContent = `Stance calculated using ${policyName} and ${inflationName}.`;
  document.getElementById('selectedPolicyLabel').textContent = policyName;
  document.getElementById('selectedInflationLabel').textContent = inflationName;
  document.getElementById('frequencyRuleLabel').textContent = inflationKey === 'spf_1y'
    ? 'SPF is quarterly, so all displayed stance calculations switch to quarterly frequency.'
    : 'Monthly measures remain monthly; quarterly measures remain quarterly.';
}

function updateAll() {
  updateLabels();
  renderCharts();
  renderTableAndSummary();
}

function attachEvents() {
  document.getElementById('inflationSelect').addEventListener('change', updateAll);
  document.getElementById('policySelect').addEventListener('change', updateAll);
  document.getElementById('startDate').addEventListener('change', updateAll);
  document.getElementById('endDate').addEventListener('change', updateAll);
  document.getElementById('resetDates').addEventListener('click', () => {
    document.getElementById('startDate').value = fullStartDate;
    document.getElementById('endDate').value = fullEndDate;
    updateAll();
  });
  document.querySelectorAll('input[data-measure]').forEach(el => el.addEventListener('change', updateAll));
}

fetch(DATA_URL)
  .then(response => response.json())
  .then(data => {
    rawData = data;
    initDateControls();
    attachEvents();
    updateAll();
  })
  .catch(err => {
    console.error(err);
    document.body.insertAdjacentHTML('afterbegin', `<div style="padding:20px;background:#fff3cd;color:#6b4e00">Could not load sample data. Run this dashboard from a local web server rather than opening index.html directly.</div>`);
  });
