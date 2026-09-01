import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBucket, UNCATEGORISED } from '../budget.js';
import { bucketTotals, selectSpending, spendingBreakdown } from '../rollup.js';

// The same category is fixed on one row and flexible on the next. The row
// owns its bucket; the category only supplies the default the form starts
// from. Everything below is that rule and its consequences.

const CATEGORIES = [
  { name: 'Housing & Bills', kind: 'expense' },
  { name: 'Groceries', kind: 'expense' },
  { name: 'Salary', kind: 'income' },
];

const flow = (over) => ({
  id: over.id ?? Math.random().toString(36),
  date: '2026-03-10',
  account: 'Bank',
  category: '',
  transfer_id: null,
  note: '',
  name: '',
  ...over,
});

test('the row is the only source of a bucket', () => {
  assert.equal(resolveBucket(flow({ category: 'Groceries', bucket: 'fixed' })), 'fixed');
  assert.equal(resolveBucket(flow({ category: 'Groceries', bucket: 'flexible' })), 'flexible');
});

test('the category cannot supply a bucket, whatever it claims', () => {
  // A category record that still carried a bucket — a stale row, a
  // hand-edited import — must not quietly start charging budgets again.
  const stale = [{ name: 'Groceries', kind: 'expense', bucket: 'fixed' }];
  assert.equal(resolveBucket(flow({ category: 'Groceries' }), stale), null);
});

test('a row with no category at all is still bucketed if the row says so', () => {
  // This is the whole point of making the category optional: money can be
  // charged to a budget without being classified first.
  assert.equal(resolveBucket(flow({ category: '', bucket: 'flexible' })), 'flexible');
});

test('anything that is not one of the two buckets is no bucket', () => {
  for (const bad of [undefined, null, '', 'income', 'savings', 'Fixed']) {
    assert.equal(resolveBucket(flow({ bucket: bad })), null, `bucket ${String(bad)}`);
  }
});

test('one category charged to both buckets splits across them', () => {
  const txns = [
    flow({ category: 'Salary', amount: 10_000_00 }),
    flow({ category: 'Groceries', amount: -300_00, bucket: 'fixed' }),
    flow({ category: 'Groceries', amount: -200_00, bucket: 'flexible' }),
  ];
  const t = bucketTotals(txns, '2026-03', { fixed: 50, flexible: 20, savings: 30 });
  assert.equal(t.fixed.spent, 300_00);
  assert.equal(t.flexible.spent, 200_00);
  assert.equal(t.unbucketed, 0);
});

test('a categoryless, bucketless row is unbucketed, not charged to a guess', () => {
  const txns = [
    flow({ category: 'Salary', amount: 10_000_00 }),
    flow({ category: '', amount: -500_00 }),
  ];
  const t = bucketTotals(txns, '2026-03', { fixed: 50, flexible: 20, savings: 30 });
  assert.equal(t.unbucketed, 500_00);
  assert.equal(t.fixed.spent, 0);
  assert.equal(t.flexible.spent, 0);
});

const LEDGER = [
  flow({ id: 'a', account: 'Bank', category: 'Groceries', amount: -100_00, bucket: 'flexible' }),
  flow({ id: 'b', account: 'Cash', category: 'Groceries', amount: -200_00, bucket: 'fixed' }),
  flow({ id: 'c', account: 'Bank', category: '', amount: -50_00 }),
  flow({ id: 'd', account: 'Bank', category: 'Salary', amount: 900_00 }),
  flow({ id: 'e', account: 'Bank', category: 'Groceries', amount: -70_00, date: '2026-07-02', bucket: 'flexible' }),
  flow({ id: 'f', account: 'Bank', category: 'Groceries', amount: -1_00, date: '2025-12-31', bucket: 'flexible' }),
  flow({ id: 'g', account: 'Bank', category: 'Groceries', amount: -9_00, transfer_id: 'zz' }),
];

const ids = (rows) => rows.map((r) => r.id).sort();

test('an unset filter means all, not none', () => {
  // A filter nobody touched must not silently exclude every row.
  assert.deepEqual(ids(selectSpending(LEDGER, { month: '2026-03' })), ['a', 'b', 'c']);
});

test('selectSpending never counts income or a transfer half', () => {
  const rows = selectSpending(LEDGER, { month: '2026-03' });
  assert.equal(rows.some((r) => r.id === 'd'), false, 'income leaked in');
  assert.equal(rows.some((r) => r.id === 'g'), false, 'transfer half leaked in');
});

test('the account filter narrows to one account', () => {
  assert.deepEqual(
    ids(selectSpending(LEDGER, { month: '2026-03', account: 'Cash' })),
    ['b'],
  );
});

test('the bucket filter uses the row bucket, not the category', () => {
  // 'b' is Groceries — a flexible category — charged to fixed on the row.
  assert.deepEqual(
    ids(selectSpending(LEDGER, { month: '2026-03', bucket: 'fixed' })),
    ['b'],
  );
});

test("bucket 'none' selects only what has no bucket at all", () => {
  assert.deepEqual(
    ids(selectSpending(LEDGER, { month: '2026-03', bucket: 'none' })),
    ['c'],
  );
});

test('the year period spans the whole year and stops at its edges', () => {
  assert.deepEqual(
    ids(selectSpending(LEDGER, { period: 'year', month: '2026-03' })),
    ['a', 'b', 'c', 'e'],
  );
});

test('filters combine rather than replacing one another', () => {
  assert.deepEqual(
    ids(selectSpending(LEDGER, {
      period: 'year', month: '2026-03', account: 'Bank', bucket: 'flexible',
    })),
    ['a', 'e'],
  );
});

test('spendingBreakdown gives a categoryless row a visible name', () => {
  const rows = spendingBreakdown(LEDGER, { month: '2026-03' });
  assert.deepEqual(rows, [
    { category: 'Groceries', total: 300_00 },
    { category: UNCATEGORISED, total: 50_00 },
  ]);
});

test('spendingBreakdown reports positive totals, largest first', () => {
  const rows = spendingBreakdown(LEDGER, { period: 'year', month: '2026-03' });
  assert.equal(rows.every((r) => r.total > 0), true);
  assert.deepEqual(rows.map((r) => r.total), [...rows.map((r) => r.total)].sort((a, b) => b - a));
});
