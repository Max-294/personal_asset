const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize, normalizeCatalog, fetchHistory, estimateYield } = require('./etf-dividends.js');
const row = (payment, amount = 1, extra = {}) => ({ stock_id: '0050', date: payment, CashDividendPaymentDate: payment, CashExDividendTradingDate: payment, CashEarningsDistribution: amount, ...extra });

test('latest four payments span four years for annual funds and exclude future payments', () => {
  const data = [2021, 2022, 2023, 2024, 2025, 2026, 2027].map(y => row(`${y}-01-15`));
  const result = normalize(data.reverse(), '0050', '2026-10-17');
  assert.deepEqual(result.paid.map(r => r.paymentDate), ['2026-01-15', '2025-01-15', '2024-01-15', '2023-01-15']);
  assert.equal(result.upcoming.length, 1);
});
test('quarterly and monthly payments use events, not calendar years', () => {
  for (const months of [[1, 4, 7, 10], [6, 7, 8, 9, 10]]) {
    const result = normalize(months.map(m => row(`2026-${String(m).padStart(2, '0')}-01`)), '0050', '2026-10-17');
    assert.equal(result.paid.length, 4);
    assert.equal(result.paid[0].paymentDate, '2026-10-01');
  }
});
test('corrections replace duplicate events, invalid dates and other symbols are excluded', () => {
  const result = normalize([row('2026-01-15', 1), row('2026-01-15', 2, { date:'2026-02-01', CashStatutorySurplus:0.5 }), row('2026-02-30'), row('2026-03-01', 0), row('2026-04-01', 10, { stock_id:'9999' })], '0050', '2026-10-17');
  assert.equal(result.paid.length, 1);
  assert.equal(result.paid[0].amount, 2.5);
});
test('catalog excludes retired records and deduplicates categories', () => {
  const data = [{stock_id:'0050',stock_name:'ETF',type:'twse',industry_category:'ETF',date:'2026-10-17'}, {stock_id:'0051',stock_name:'retired',type:'twse',industry_category:'ETF',date:'2020-01-01'}, {stock_id:'2330',type:'twse',industry_category:'半導體',date:'2026-10-17'}];
  assert.deepEqual(normalizeCatalog(data).map(r => r.ticker), ['0050']);
});
test('cached history survives network failure with explicit stale status', async () => {
  const cache = {ticker:'0050',updatedAt:1,records:[row('2026-01-15')]};
  const result = await fetchHistory('0050', {storage:{getItem:()=>JSON.stringify(cache)},fetcher:async()=>{throw new Error('offline');}});
  assert.equal(result.stale, true);
  assert.equal(result.records.length, 1);
});
test('network failure without a cache is not represented as zero dividends', async () => {
  await assert.rejects(fetchHistory('0050', {storage:{getItem:()=>null},fetcher:async()=>{throw new Error('offline');}}));
});

const paidRows = (dates, amount = 1) => dates.map(date => ({ exDate: date, paymentDate: date, amount }));
const quote = { date: '2026-10-16', close: 100 };
test('annualization uses monthly, quarterly, semiannual and annual cadence', () => {
  const cases = [
    [['2026-09-15', '2026-08-15', '2026-07-15', '2026-06-15'], 12],
    [['2026-09-15', '2026-06-15', '2026-03-15', '2025-12-15'], 4],
    [['2026-09-15', '2026-03-15', '2025-09-15', '2025-03-15'], 2],
    [['2026-09-15', '2025-09-15', '2024-09-15', '2023-09-15'], 1],
  ];
  for (const [dates, expected] of cases) {
    const result = estimateYield(paidRows(dates), quote, [], 'TEST', '2026-10-17');
    assert.equal(result.annualDividend, expected);
    assert.equal(result.rate, expected);
    assert.equal(result.count, 4);
  }
});
test('incomplete and irregular histories do not produce a misleading percentage', () => {
  for (const dates of [[], ['2026-09-15'], ['2026-09-15', '2026-08-15', '2026-05-15']]) {
    assert.ok(estimateYield(paidRows(dates), quote, [], 'TEST', '2026-10-17').reason);
  }
});
test('missing, zero and stale prices are unavailable, not zero yield', () => {
  for (const badQuote of [null, { ...quote, close: 0 }, { ...quote, close: NaN }, { ...quote, date: '2026-01-01' }]) {
    assert.ok(estimateYield(paidRows(['2026-09-15', '2026-08-15']), badQuote, [], 'TEST', '2026-10-17').reason);
  }
});
test('0050 split is adjusted only for estimation, never mutating original dividend rows', () => {
  const paid = paidRows(['2026-07-21', '2026-01-22', '2025-07-21', '2025-01-17']);
  paid[3].amount = 4;
  const result = estimateYield(paid, quote, [], '0050', '2026-10-17');
  assert.equal(result.annualDividend, 2);
  assert.equal(result.adjusted, true);
  assert.equal(paid[3].amount, 4);
});
test('reverse splits adjust historical distributions and deduplicate split dates', () => {
  const event = { stock_id: 'TEST', date: '2026-09-01', before_price: 2, after_price: 10 };
  const result = estimateYield(paidRows(['2026-09-15', '2026-08-15']), quote, [event, event], 'TEST', '2026-10-17');
  assert.equal(result.annualDividend, 36);
});
test('expired dividend cycle does not imply continuing distributions', () => {
  assert.ok(estimateYield(paidRows(['2025-09-15', '2025-08-15']), quote, [], 'TEST', '2026-10-17').reason);
});
