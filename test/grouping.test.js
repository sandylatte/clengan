import test from 'node:test';
import assert from 'node:assert/strict';
import { groupByDay } from '../rollup.js';

const row = (date, amount, over = {}) =>
  ({ id: date + amount, date, account: 'Bank', amount, category: 'X', transfer_id: null, ...over });

test('rows are grouped under their date, newest day first', () => {
  const groups = groupByDay([row('2026-09-02', -100), row('2026-09-26', -200), row('2026-09-10', -300)]);
  assert.deepEqual(groups.map((g) => g.date), ['2026-09-26', '2026-09-10', '2026-09-02']);
});

test('every row survives the grouping', () => {
  const rows = [row('2026-09-02', -100), row('2026-09-02', -50), row('2026-09-10', -300)];
  const groups = groupByDay(rows);
  assert.equal(groups.flatMap((g) => g.rows).length, rows.length);
});

test("a day's net adds income and spending together", () => {
  const [day] = groupByDay([row('2026-09-02', 500), row('2026-09-02', -200)]);
  assert.equal(day.net, 300);
});

test('a transfer does not move a day net, but its rows still show', () => {
  // Moving money between your own accounts is not a day's spending. The rows
  // have to stay visible or money would appear to vanish from the list.
  const rows = [
    row('2026-09-02', -1000, { id: 'a', transfer_id: 'b' }),
    row('2026-09-02', 1000, { id: 'b', transfer_id: 'a', account: 'Cash' }),
    row('2026-09-02', -250),
  ];
  const [day] = groupByDay(rows);
  assert.equal(day.net, -250);
  assert.equal(day.rows.length, 3);
});

test('an empty list groups to nothing rather than throwing', () => {
  assert.deepEqual(groupByDay([]), []);
});

test('grouping does not reorder rows within a day', () => {
  // The caller sorts; grouping must not quietly impose its own order.
  const rows = [row('2026-09-02', -1, { id: 'first' }), row('2026-09-02', -2, { id: 'second' })];
  const [day] = groupByDay(rows);
  assert.deepEqual(day.rows.map((r) => r.id), ['first', 'second']);
});
