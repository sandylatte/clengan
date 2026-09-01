import test from 'node:test';
import assert from 'node:assert/strict';
import { splitBalance, categoryOptions } from '../budget.js';
import { lastSixMonths } from '../rollup.js';

// These three ran only inside app.js, which has no tests and is where every
// bug this project has shipped actually lived. They are pure, so they can be
// pulled out and held to a contract; the DOM plumbing left behind cannot hide
// a wrong answer any more, only a wrong element.

test('lastSixMonths ends on the month given and counts back six', () => {
  assert.deepEqual(
    lastSixMonths('2026-03'),
    ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03'],
  );
});

test('lastSixMonths crosses a year boundary without arithmetic on the year', () => {
  assert.deepEqual(lastSixMonths('2026-01').at(0), '2025-08');
  assert.deepEqual(lastSixMonths('2026-01').at(-1), '2026-01');
});

test('lastSixMonths does not slide a day when the local zone is behind UTC', () => {
  // Built from Date.UTC and read back with toISOString, deliberately: the
  // pairing has no local component. A local constructor here would report the
  // previous month west of Greenwich.
  assert.deepEqual(lastSixMonths('2026-03').at(-1), '2026-03');
});

test('splitBalance accepts a set totalling 100', () => {
  const result = splitBalance({ fixed: 50, flexible: 20, savings: 30 });
  assert.equal(result.ok, true);
  assert.equal(result.message, 'Shares total 100%.');
});

test('splitBalance names the gap and which way to close it', () => {
  assert.equal(splitBalance({ fixed: 50, flexible: 20, savings: 20 }).message,
    'Shares total 90%. Add 10% more.');
  assert.equal(splitBalance({ fixed: 60, flexible: 30, savings: 20 }).message,
    'Shares total 110%. Remove 10%.');
});

test('splitBalance refuses a negative share before it refuses a wrong total', () => {
  // Both are wrong, and the negative is the one the user can act on: the
  // total is only wrong because of it.
  const result = splitBalance({ fixed: 110, flexible: -10, savings: 0 });
  assert.equal(result.ok, false);
  assert.equal(result.message, 'A share cannot be negative. Enter zero or more.');
});

test('splitBalance treats an unreadable field as not yet valid', () => {
  const result = splitBalance({ fixed: NaN, flexible: 20, savings: 30 });
  assert.equal(result.ok, false);
  assert.equal(result.message, 'A share cannot be negative. Enter zero or more.');
});

test('splitBalance agrees with itself about what is savable', () => {
  // The message and the ok flag came from two different comparisons, one
  // rounded and one exact, so 99.6 said "add 0.4% more" on an enabled button.
  const result = splitBalance({ fixed: 50, flexible: 20, savings: 29.6 });
  assert.equal(result.ok, true);
  assert.equal(result.message, 'Shares total 100%.');
});

const CATEGORIES = [
  { name: 'Salary', kind: 'income' },
  { name: 'Groceries', kind: 'expense' },
  { name: 'Rent', kind: 'expense' },
  { name: 'Bonus', kind: 'income' },
];

test('categoryOptions offers only income categories for an income row', () => {
  assert.deepEqual(categoryOptions(CATEGORIES, [], 'income'), ['Bonus', 'Salary']);
});

test('categoryOptions offers every spending category for an expense row', () => {
  assert.deepEqual(categoryOptions(CATEGORIES, [], 'expense'), ['Groceries', 'Rent']);
});

test('categoryOptions keeps a deleted category selectable while rows still use it', () => {
  // Otherwise an old row cannot be re-filed under the name it already carries.
  assert.deepEqual(
    categoryOptions(CATEGORIES, ['Petrol', 'Groceries'], 'expense'),
    ['Groceries', 'Rent', 'Petrol'],
  );
});

test('categoryOptions does not leak an income category onto the expense list', () => {
  // Found live: one income row put 'Salary' into usedNames, and because the
  // expense list does not contain it, it was mistaken for an orphan and
  // offered as somewhere to file spending.
  assert.deepEqual(
    categoryOptions(CATEGORIES, ['Salary'], 'expense'),
    ['Groceries', 'Rent'],
  );
  assert.deepEqual(
    categoryOptions(CATEGORIES, ['Rent'], 'income'),
    ['Bonus', 'Salary'],
  );
});

test('categoryOptions never lists a name twice', () => {
  // 'Petrol' is deliberately NOT a live category: a name that is still listed
  // gets dropped from the orphan half anyway, so it cannot prove the dedupe.
  const names = categoryOptions(CATEGORIES, ['Petrol', 'Petrol'], 'expense');
  assert.deepEqual(names, [...new Set(names)]);
});
