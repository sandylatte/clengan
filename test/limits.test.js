import test from 'node:test';
import assert from 'node:assert/strict';
import { limitFor, limitsIn, setLimit } from '../budget.js';
import { limitTotals } from '../rollup.js';

const JT = 100_000_000; // Rp 1.000.000 in cents

test('a limit runs from its month until a later month sets its own', () => {
  const limits = { Food: { '2026-10': 2 * JT, '2026-12': 3 * JT } };
  assert.equal(limitFor(limits, 'Food', '2026-09'), null, 'a month before the limit has none');
  assert.equal(limitFor(limits, 'Food', '2026-10'), 2 * JT);
  assert.equal(limitFor(limits, 'Food', '2026-11'), 2 * JT);
  assert.equal(limitFor(limits, 'Food', '2026-12'), 3 * JT);
  assert.equal(limitFor(limits, 'Food', '2027-05'), 3 * JT);
  assert.equal(limitFor(limits, 'Shopping', '2026-11'), null);
});

test('a null entry ends a limit, and zero is a real one', () => {
  const limits = { Food: { '2026-10': 2 * JT, '2027-01': null }, Shopping: { '2026-10': 0 } };
  assert.equal(limitFor(limits, 'Food', '2026-12'), 2 * JT);
  assert.equal(limitFor(limits, 'Food', '2027-01'), null);
  assert.deepEqual(limitsIn(limits, '2027-02'), [{ category: 'Shopping', limit: 0 }]);
});

test('unreadable limits are passed over, not trusted', () => {
  assert.equal(limitFor(null, 'Food', '2026-10'), null);
  assert.equal(limitFor({ Food: 'lots' }, 'Food', '2026-10'), null);
  const limits = { Food: { '2026-09': JT, '2026-10': 'lots', '2026-13': 5, junk: 7, '2026-11': -1 } };
  assert.equal(limitFor(limits, 'Food', '2026-12'), JT);
  assert.deepEqual(limitsIn('garbage', '2026-10'), []);
  assert.deepEqual(setLimit({ Food: 'lots' }, 'Food', '2026-10', JT), { Food: { '2026-10': JT } },
    'a corrupt entry is replaced, not spread into the new one');
});

test('setting a limit leaves earlier months and later choices alone', () => {
  let limits = setLimit({}, 'Food', '2026-10', 2 * JT);
  limits = setLimit(limits, 'Food', '2026-12', 3 * JT);
  limits = setLimit(limits, 'Food', '2026-11', 250_000_000);
  assert.equal(limitFor(limits, 'Food', '2026-09'), null);
  assert.equal(limitFor(limits, 'Food', '2026-10'), 2 * JT);
  assert.equal(limitFor(limits, 'Food', '2026-11'), 250_000_000);
  assert.equal(limitFor(limits, 'Food', '2026-12'), 3 * JT, 'December set its own and keeps it');
});

test('saving what the months before already say writes nothing', () => {
  const start = { Food: { '2026-10': 2 * JT } };
  assert.deepEqual(setLimit(start, 'Food', '2026-11', 2 * JT), start);
  assert.deepEqual(setLimit({}, 'Food', '2026-10', null), {}, 'clearing a limit that never was');
  assert.deepEqual(setLimit(start, 'Food', '2026-10', null), {}, 'removing the only entry removes the category');
  assert.deepEqual(setLimit(start, 'Food', '2026-11', null), { Food: { '2026-10': 2 * JT, '2026-11': null } });
  assert.deepEqual(start, { Food: { '2026-10': 2 * JT } }, 'the input is not changed');
});

test('a limit that is not whole rupiah from a month is refused', () => {
  assert.throws(() => setLimit({}, 'Food', '2026-10', -1), RangeError);
  assert.throws(() => setLimit({}, 'Food', '2026-10', 1.5), RangeError);
  assert.throws(() => setLimit({}, 'Food', 'October', JT), RangeError);
});

const row = (id, date, amount, category, extra = {}) => ({
  id, date, account: 'Bank', amount, category, bucket: 'flexible', transfer_id: null, note: '', ...extra,
});

test('limit totals count the month spending the way the chart does', () => {
  const txns = [
    row('a', '2026-10-02', -150_000_000, 'Food'),
    row('b', '2026-10-20', -70_000_000, 'Food'),
    row('c', '2026-09-30', -9 * JT, 'Food'),
    row('d', '2026-10-05', 20_000_000, 'Food'),
    row('e', '2026-10-06', -4 * JT, 'Shopping', { transfer_id: 't1' }),
    row('f', '2026-10-07', -10_000_000, 'Shopping'),
  ];
  const limits = { Food: { '2026-10': 2 * JT }, Shopping: { '2026-01': 0 }, Gone: { '2026-10': JT } };
  assert.deepEqual(limitTotals(txns, limits, '2026-10', ['Shopping', 'Food']), [
    { category: 'Shopping', limit: 0, spent: 10_000_000, remaining: -10_000_000 },
    { category: 'Food', limit: 2 * JT, spent: 220_000_000, remaining: -20_000_000 },
    { category: 'Gone', limit: JT, spent: 0, remaining: JT },
  ]);
  assert.deepEqual(limitTotals(txns, limits, '2026-09', ['Food']).map((t) => t.category), ['Shopping'],
    'Food had no limit in September');
});
