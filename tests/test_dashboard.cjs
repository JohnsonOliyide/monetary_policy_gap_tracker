const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
const code = fs.readFileSync(require('path').join(__dirname, '../app.js'), 'utf8');
const context = {console, AbortSignal, fetch: () => new Promise(()=>{}), document: {getElementById: () => null}};
vm.runInNewContext(code + `
rawData = {
 months: [{date:'2026-04-30',quarter:'2026 Q2',policy:{effr:4},inflation:{core_pce_ma:null},rstar:{kc_fed:1}}],
 quarters: [
 {date:'2026-03-31',quarter:'2026 Q1',period:'2026 Q1',policy:{effr:4},inflation:{spf_1y:2},rstar:{hlw:1}},
 {date:'2026-06-30',quarter:'2026 Q2',period:'2026 Q2',policy:{effr:4},inflation:{spf_1y:2},rstar:{hlw:null}}], sep:[]
};
if (latestReading('hlw','effr','spf_1y').period !== '2026 Q1') throw new Error('Latest complete quarter lost');
if (buildRealRateTrace('effr','core_pce_ma').y[0] !== null) throw new Error('Missing inflation treated as zero');
if (latestReading('kc_fed','effr','core_pce_ma') !== null) throw new Error('Invalid monthly reading shown');
if (averageMonthlyRstarByQuarter('kc_fed').size !== 0) throw new Error('Incomplete quarter averaged');
`, context);
console.log('Dashboard regression checks passed');
