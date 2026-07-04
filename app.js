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

const monthlyInflationOptions = new Set([
  'core_pce_ma',
  'headline_pce_ma',
  'core_cpi_ma',
  'headline_cpi_ma',
  'cleveland_1y',
  'michigan_1y',
  'nyfed_sce_1y'
]);

let rawData;
let viewMode = 'all';
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
    const tmp = start;
    start = end;
    end = tmp;
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

function formatDateForLabel(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
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
  if (Math.abs(gap) < 0.05) return 'Neutral';
  return gap > 0 ? 'Restrictive' : 'Accommodative';
}

function stanceClassName(stance) {
  return stance.toLowerCase();
}

function selectedMeasures() {
  const checked = Array.from(document.querySelectorAll('input[data-measure]:checked')).map(el => el.dataset.measure);
  if (viewMode === 'monthly') return checked.filter(id => measures[id].group === 'monthly');
  if (viewMode === 'quarterly') return checked.filter(id => measures[id].group === 'quarterly');
  return checked;
}

function avg(nums) {
  const vals = nums.filter(v => v !== null && v !== undefined && !Number.isNaN(v));
  if (!vals.length) return null;
  return vals.reduce((a,b) => a+b, 0) / vals.length;
}

function quarterFromDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const q = Math.floor(d.getUTCMonth()/3)+1;
  return `${d.getUTCFullYear()} Q${q}`;
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

function getPolicyAndInflationForQuarter(q, policyKey, inflationKey) {
  const row = getQuarterRow(q);
  if (!row) return { policy: null, inflation: null };
  return { policy: row.policy[policyKey], inflation: row.inflation[inflationKey] };
}

function policyGap(policy, inflation, rstar) {
  if ([policy, inflation, rstar].some(v => v === null || v === undefined || Number.isNaN(v))) return null;
  return policy - inflation - rstar;
}

function buildGapTrace(measureId, policyKey, inflationKey) {
  const meta = measures[measureId];
  const spfMode = inflationKey === 'spf_1y';

  if (measureId === 'sep_implied') {
    const x = [];
    const y = [];
    const text = [];
    filterDateRows(rawData.sep).forEach(row => {
      const qi = getPolicyAndInflationForQuarter(row.quarter, policyKey, inflationKey);
      const gap = policyGap(qi.policy, qi.inflation, row.rstar);
      if (gap !== null) {
        x.push(row.date);
        y.push(gap);
        text.push(`${row.period}<br>r*: ${fmt(row.rstar)}%<br>Gap: ${fmt(gap)}%`);
      }
    });
    return {
      x, y, text,
      type: 'scatter',
      mode: 'lines+markers',
      name: meta.short,
      line: { color: meta.color, dash: meta.dash, width: 2 },
      marker: { color: meta.color, symbol: meta.marker, size: 7 },
      hovertemplate: '%{text}<extra></extra>'
    };
  }

  if (spfMode) {
    // All measures move to quarterly stance when SPF is selected.
    const x = [];
    const y = [];
    const text = [];
    const monthlyQuarterAverages = meta.group === 'monthly' ? averageMonthlyRstarByQuarter(measureId) : null;
    filterDateRows(rawData.quarters).forEach(qrow => {
      const rstar = meta.group === 'monthly' ? monthlyQuarterAverages.get(qrow.quarter) : qrow.rstar[measureId];
      if (rstar === undefined || rstar === null) return;
      const gap = policyGap(qrow.policy[policyKey], qrow.inflation[inflationKey], rstar);
      if (gap !== null) {
        x.push(qrow.date);
        y.push(gap);
        text.push(`${qrow.period}<br>r*: ${fmt(rstar)}%<br>Gap: ${fmt(gap)}%`);
      }
    });
    return {
      x, y, text,
      type: 'scatter',
      mode: meta.group === 'monthly' ? 'lines+markers' : 'lines+markers',
      name: meta.short,
      line: { color: meta.color, dash: meta.group === 'monthly' ? 'solid' : 'dot', width: 2 },
      marker: { color: meta.color, symbol: meta.marker, size: 7 },
      hovertemplate: '%{text}<extra></extra>'
    };
  }

  if (meta.group === 'monthly') {
    const x = [];
    const y = [];
    const text = [];
    filterDateRows(rawData.months).forEach(row => {
      const rstar = row.rstar[measureId];
      const infl = row.inflation[inflationKey];
      const gap = policyGap(row.policy[policyKey], infl, rstar);
      if (gap !== null) {
        x.push(row.date);
        y.push(gap);
        text.push(`${row.period}<br>r*: ${fmt(rstar)}%<br>Gap: ${fmt(gap)}%`);
      }
    });
    return {
      x, y, text,
      type: 'scatter',
      mode: 'lines',
      name: meta.short,
      line: { color: meta.color, dash: meta.dash, width: 2.5 },
      hovertemplate: '%{text}<extra></extra>'
    };
  }

  const x = [];
  const y = [];
  const text = [];
  filterDateRows(rawData.quarters).forEach(qrow => {
    const rstar = qrow.rstar[measureId];
    if (rstar === undefined) return;
    const gap = policyGap(qrow.policy[policyKey], qrow.inflation[inflationKey], rstar);
    if (gap !== null) {
      x.push(qrow.date);
      y.push(gap);
      text.push(`${qrow.period}<br>r*: ${fmt(rstar)}%<br>Gap: ${fmt(gap)}%`);
    }
  });
  return {
    x, y, text,
    type: 'scatter',
    mode: 'lines+markers',
    name: meta.short,
    line: { color: meta.color, dash: meta.dash, width: 2 },
    marker: { color: meta.color, symbol: meta.marker, size: 7 },
    hovertemplate: '%{text}<extra></extra>'
  };
}

function buildRstarTrace(measureId, inflationKey) {
  const meta = measures[measureId];
  if (measureId === 'sep_implied') {
    const rows = filterDateRows(rawData.sep);
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
    const rows = filterDateRows(rawData.months).filter(d => d.rstar[measureId] !== undefined);
    return {
      x: rows.map(d => d.date),
      y: rows.map(d => d.rstar[measureId]),
      text: rows.map(d => `${d.period}<br>r*: ${fmt(d.rstar[measureId])}%`),
      type: 'scatter',
      mode: inflationKey === 'spf_1y' ? 'lines' : 'lines',
      name: meta.short,
      line: { color: meta.color, dash: meta.dash, width: 2.5 },
      hovertemplate: '%{text}<extra></extra>'
    };
  }
  const rows = filterDateRows(rawData.quarters).filter(d => d.rstar[measureId] !== undefined);
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

function latestReading(measureId, policyKey, inflationKey) {
  const meta = measures[measureId];
  const spfMode = inflationKey === 'spf_1y';

  if (measureId === 'sep_implied') {
    const row = getLatestSepMeasure();
    if (!row) return null;
    const qi = getPolicyAndInflationForQuarter(row.quarter, policyKey, inflationKey);
    const gap = policyGap(qi.policy, qi.inflation, row.rstar);
    return { measureId, period: row.period, frequency: meta.frequency, rstar: row.rstar, gap };
  }

  if (spfMode) {
    // Latest completed quarter with all necessary values.
    const qrow = [...filterDateRows(rawData.quarters)].reverse().find(q => q.inflation[inflationKey] !== undefined);
    if (!qrow) return null;
    let rstar = null;
    if (meta.group === 'monthly') {
      const map = averageMonthlyRstarByQuarter(measureId);
      rstar = map.get(qrow.quarter);
    } else {
      rstar = qrow.rstar[measureId];
    }
    const gap = policyGap(qrow.policy[policyKey], qrow.inflation[inflationKey], rstar);
    return { measureId, period: qrow.period, frequency: 'Quarterly', rstar, gap };
  }

  if (meta.group === 'monthly') {
    const row = getLatestMonthlyMeasure(measureId);
    if (!row) return null;
    const gap = policyGap(row.policy[policyKey], row.inflation[inflationKey], row.rstar[measureId]);
    return { measureId, period: row.period, frequency: meta.frequency, rstar: row.rstar[measureId], gap };
  }

  const qrow = getLatestQuarterlyMeasure(measureId);
  if (!qrow) return null;
  const gap = policyGap(qrow.policy[policyKey], qrow.inflation[inflationKey], qrow.rstar[measureId]);
  return { measureId, period: qrow.period, frequency: meta.frequency, rstar: qrow.rstar[measureId], gap };
}

function renderCharts() {
  const policyKey = document.getElementById('policySelect').value;
  const inflationKey = document.getElementById('inflationSelect').value;
  const activeMeasures = selectedMeasures();

  const stanceTraces = activeMeasures.map(id => buildGapTrace(id, policyKey, inflationKey)).filter(t => t && t.x.length);
  const rstarTraces = activeMeasures.map(id => buildRstarTrace(id, inflationKey)).filter(t => t && t.x.length);

  const commonLayout = {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { family: 'Inter, Segoe UI, sans-serif', color: '#172033', size: 12 },
    margin: { l: 52, r: 28, t: 22, b: 58 },
    legend: { orientation: 'h', y: -0.22, x: 0, font: { size: 12 } },
    xaxis: { gridcolor: '#eef2f7', zeroline: false, tickformat: '%Y' },
    yaxis: { gridcolor: '#eef2f7', zeroline: false, ticksuffix: '%', title: '' },
    hovermode: 'x unified'
  };

  const stanceLayout = {
    ...commonLayout,
    yaxis: { ...commonLayout.yaxis, title: 'Policy gap (%)', range: [-4, 4] },
    shapes: [
      { type: 'line', xref: 'paper', x0: 0, x1: 1, y0: 0, y1: 0, line: { color: '#6f7c8f', width: 1.5 } }
    ],
    annotations: [
      { text: 'Neutral', xref: 'paper', x: 1.01, y: 0, showarrow: false, xanchor: 'left', font: { color: '#4b5563', size: 12 } },
      { text: 'Restrictive', xref: 'paper', x: 0.52, y: 3.3, showarrow: false, font: { color: '#6b7280', size: 13 } },
      { text: 'Accommodative', xref: 'paper', x: 0.52, y: -3.3, showarrow: false, font: { color: '#6b7280', size: 13 } }
    ]
  };

  const rstarLayout = {
    ...commonLayout,
    yaxis: { ...commonLayout.yaxis, title: 'r* (%)', range: [-2.2, 3.5] },
    margin: { l: 52, r: 28, t: 12, b: 58 }
  };

  Plotly.react('stanceChart', stanceTraces, stanceLayout, { responsive: true, displayModeBar: false });
  Plotly.react('rstarChart', rstarTraces, rstarLayout, { responsive: true, displayModeBar: false });
}

function renderTableAndSummary() {
  const policyKey = document.getElementById('policySelect').value;
  const inflationKey = document.getElementById('inflationSelect').value;
  const policyName = policyLabels[policyKey];
  const inflationName = inflationLabels[inflationKey];
  const activeMeasures = selectedMeasures();
  const rows = activeMeasures.map(id => latestReading(id, policyKey, inflationKey)).filter(Boolean);

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
      <td class="num">${fmt(row.rstar)}</td>
      <td class="num" style="font-weight:900;color:${meta.color}">${fmt(row.gap)}</td>
      <td class="stance ${stanceClassName(stance)}">${stance}</td>
    `;
    tbody.appendChild(tr);
  });

  if (!rows.length) {
    document.getElementById('summaryBullets').innerHTML = '<li>No selected measures have observations inside the selected date range.</li>';
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
  const ul = document.getElementById('summaryBullets');
  ul.innerHTML = bullets.map(b => `<li>${b}</li>`).join('');
}

function updateLabels() {
  const policyKey = document.getElementById('policySelect').value;
  const inflationKey = document.getElementById('inflationSelect').value;
  const policyName = policyLabels[policyKey];
  const inflationName = inflationLabels[inflationKey];

  document.getElementById('stanceSubtitle').textContent = `Policy stance in this view is calculated using the selected policy rate: ${policyName}, and the selected inflation expectation: ${inflationName}.`;
  document.getElementById('tableSubtitle').textContent = `Stance calculated using ${policyName} and ${inflationName}.`;
  document.getElementById('selectedPolicyLabel').textContent = policyName;
  document.getElementById('selectedInflationLabel').textContent = inflationName;
  const frequencyRule = inflationKey === 'spf_1y'
    ? 'SPF is quarterly, so all stance calculations are shown at quarterly frequency.'
    : 'Monthly measures remain monthly; quarterly measures remain quarterly.';
  document.getElementById('frequencyRuleLabel').textContent = frequencyRule;
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
  document.querySelectorAll('input[data-measure]').forEach(el => el.addEventListener('change', updateAll));}

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
