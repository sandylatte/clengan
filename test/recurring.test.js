import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dueOccurrences, occurrenceDate, nextMonth, occurrenceToRow, runStamps,
} from '../recurring.js';

const rule = (over = {}) => ({
  id: 'r1', day: 25, account: 'Bank BCA', amount: -450000000,
  name: 'Rent', category: 'Housing & Bills', bucket: 'fixed', note: '',
  last_run: null, active: true, ...over,
});

test('a month rolls over into the next year', () => {
  assert.equal(nextMonth('2026-12'), '2027-01');
  assert.equal(nextMonth('2026-01'), '2026-02');
});

test('a day past the end of the month lands on its last day', () => {
  assert.equal(occurrenceDate('2026-02', 31), '2026-02-28');
  assert.equal(occurrenceDate('2024-02', 31), '2024-02-29');
  assert.equal(occurrenceDate('2026-09', 31), '2026-09-30');
  assert.equal(occurrenceDate('2026-09', 5), '2026-09-05');
});

test('a new rule is owed this month once its day arrives', () => {
  assert.deepEqual(dueOccurrences([rule()], '2026-09-24').map((d) => d.date), []);
  assert.deepEqual(dueOccurrences([rule()], '2026-09-25').map((d) => d.date), ['2026-09-25']);
});

test('a new rule never backfills history it did not have', () => {
  const due = dueOccurrences([rule()], '2026-09-26');
  assert.equal(due.length, 1);
  assert.equal(due[0].date, '2026-09-25');
});

test('a rule that missed months catches up, oldest first', () => {
  const due = dueOccurrences([rule({ last_run: '2026-06' })], '2026-09-26');
  assert.deepEqual(due.map((d) => d.date), ['2026-07-25', '2026-08-25', '2026-09-25']);
});

test('the current month waits its turn while earlier months do not', () => {
  const due = dueOccurrences([rule({ last_run: '2026-07' })], '2026-09-03');
  assert.deepEqual(due.map((d) => d.date), ['2026-08-25']);
});

test('a rule already run this month is owed nothing', () => {
  assert.deepEqual(dueOccurrences([rule({ last_run: '2026-09' })], '2026-09-26'), []);
});

test('an inactive rule is never owed', () => {
  assert.deepEqual(dueOccurrences([rule({ active: false })], '2026-09-26'), []);
});

test('a long-dormant rule catches up over the RECENT two years, not the oldest', () => {
  const due = dueOccurrences([rule({ last_run: '2015-01' })], '2026-09-26');
  assert.equal(due.length, 24);
  assert.equal(due[0].date, '2024-10-25');
  assert.equal(due.at(-1).date, '2026-09-25');
});

test('the catch-up window crosses a year boundary correctly', () => {
  const due = dueOccurrences([rule({ last_run: '2020-01' })], '2026-01-26');
  assert.equal(due[0].date, '2024-02-25');
  assert.equal(due.at(-1).date, '2026-01-25');
});

test('occurrences from several rules come out in date order', () => {
  const due = dueOccurrences([
    rule({ id: 'a', day: 25 }),
    rule({ id: 'b', day: 2, name: 'Netflix' }),
  ], '2026-09-26');
  assert.deepEqual(due.map((d) => d.date), ['2026-09-02', '2026-09-25']);
});

test('a rule is stamped with its own last month, not with today', () => {
  // Caught up on the 3rd: the 25th of this month has not happened, so the rule
  // must stay owed for it. Stamping it "2026-09" would lose the payment.
  const due = dueOccurrences([rule({ last_run: '2026-07' })], '2026-09-03');
  assert.deepEqual(runStamps(due), [['r1', '2026-08']]);
});

test('each rule is stamped separately', () => {
  const due = dueOccurrences([
    rule({ id: 'rent', day: 25, last_run: '2026-07' }),
    rule({ id: 'netflix', day: 2, last_run: '2026-07' }),
  ], '2026-09-03');
  assert.deepEqual(runStamps(due).sort(), [['netflix', '2026-09'], ['rent', '2026-08']]);
});

test('a due occurrence becomes an ordinary transaction row', () => {
  const [first] = dueOccurrences([rule()], '2026-09-25');
  assert.deepEqual(occurrenceToRow(first, 'fixed-id'), {
    id: 'fixed-id',
    date: '2026-09-25',
    account: 'Bank BCA',
    amount: -450000000,
    name: 'Rent',
    category: 'Housing & Bills',
    bucket: 'fixed',
    transfer_id: null,
    note: '',
  });
});
