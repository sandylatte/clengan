import test from 'node:test';
import assert from 'node:assert/strict';
import { monthsInPeriod, periodTotals, periodBuckets, monthlyTotals, bucketTotals } from '../rollup.js';

const SPLIT = { fixed: 50, flexible: 20, savings: 30 };
const flow = (date, amount, bucket = null) =>
  ({ id: date + amount, date, account: 'a', amount, category: amount > 0 ? 'Salary' : 'Food',
     bucket, transfer_id: null });

test('a month period is just that month', () => {
  assert.deepEqual(monthsInPeriod('month', '2026-09'), ['2026-09']);
});

test('a year period is all twelve months of that year', () => {
  const months = monthsInPeriod('year', '2026-09');
  assert.equal(months.length, 12);
  assert.equal(months[0], '2026-01');
  assert.equal(months[11], '2026-12');
});

test('a single-month period matches monthlyTotals exactly', () => {
  // The month path must not drift from what the app showed before the toggle.
  const txns = [flow('2026-09-01', 500), flow('2026-09-02', -200, 'fixed')];
  assert.deepEqual(periodTotals(txns, 'month', '2026-09'), monthlyTotals(txns, '2026-09'));
});

test('a single-month period matches bucketTotals exactly', () => {
  const txns = [flow('2026-09-01', 1000), flow('2026-09-02', -300, 'fixed')];
  assert.deepEqual(periodBuckets(txns, 'month', '2026-09', SPLIT),
    bucketTotals(txns, '2026-09', SPLIT));
});

test('a year totals every month inside it', () => {
  const txns = [flow('2026-01-05', 300), flow('2026-06-05', 200), flow('2026-11-05', -100)];
  const year = periodTotals(txns, 'year', '2026-07');
  assert.equal(year.income, 500);
  assert.equal(year.spending, -100);
  assert.equal(year.net, 400);
});

test('another year never leaks into the total', () => {
  const txns = [flow('2025-12-31', 999), flow('2026-01-01', 100)];
  assert.equal(periodTotals(txns, 'year', '2026-05').income, 100);
});

test('a year budget is the sum of each month, not the year income split once', () => {
  // Two months earning differently. Splitting 1200 once would give fixed 600;
  // splitting each month gives 500 + 100. Both months are budgeted from their
  // own income, so the second is the honest figure.
  const txns = [flow('2026-01-05', 1000), flow('2026-02-05', 200)];
  const year = periodBuckets(txns, 'year', '2026-01', SPLIT);
  assert.equal(year.income, 1200);
  assert.equal(year.fixed.budget, 600);
  const january = bucketTotals(txns, '2026-01', SPLIT);
  const february = bucketTotals(txns, '2026-02', SPLIT);
  assert.equal(year.fixed.budget, january.fixed.budget + february.fixed.budget);
});

test('spending sums across the year and stays charged to its own bucket', () => {
  const txns = [flow('2026-03-01', 1000), flow('2026-03-02', -100, 'fixed'),
                flow('2026-08-02', -50, 'flexible')];
  const year = periodBuckets(txns, 'year', '2026-03', SPLIT);
  assert.equal(year.fixed.spent, 100);
  assert.equal(year.flexible.spent, 50);
});

test('unbucketed spending is reported across a year too', () => {
  const txns = [flow('2026-03-01', 500), flow('2026-05-02', -70)];
  assert.equal(periodBuckets(txns, 'year', '2026-03', SPLIT).unbucketed, 70);
});

test('an empty year returns zeroes rather than throwing', () => {
  const year = periodBuckets([], 'year', '2026-01', SPLIT);
  assert.equal(year.income, 0);
  assert.equal(year.fixed.budget, 0);
  assert.equal(year.savings.projected, 0);
});
