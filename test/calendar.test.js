import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { toISO, fromISO, formatLong, monthGrid } from '../calendar.js';

test('toISO zero-pads month and day', () => {
  assert.equal(toISO(new Date(2026, 8, 1)), '2026-09-01');
  assert.equal(toISO(new Date(2026, 11, 25)), '2026-12-25');
});

// new Date('2026-08-01') is UTC midnight, which is 31 July anywhere west of
// Greenwich and would highlight the wrong cell. fromISO builds a local date.
test('an ISO date round-trips to the same calendar day', () => {
  for (const iso of ['2026-01-01', '2026-08-01', '2026-12-31', '2024-02-29']) {
    assert.equal(toISO(fromISO(iso)), iso, iso);
  }
});

test('fromISO reads the parts as local time, not UTC', () => {
  const date = fromISO('2026-08-01');
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 7);
  assert.equal(date.getDate(), 1);
});

// The assertion above cannot fail on a machine at or east of Greenwich: UTC
// midnight is still the same local day there, so new Date('2026-08-01') looks
// correct and the bug hides. Verified by mutation — reintroducing the UTC
// parse left the whole suite green on a UTC+7 machine. This runs the same
// check in a timezone where the two readings genuinely differ.
test('fromISO is correct west of Greenwich too', () => {
  const probe = `
    import { fromISO, toISO } from '${new URL('../calendar.js', import.meta.url).pathname}';
    const d = fromISO('2026-08-01');
    if (toISO(d) !== '2026-08-01') throw new Error('got ' + toISO(d));
    if (new Date('2026-08-01').getDate() === 1) throw new Error('timezone did not apply');
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', probe], {
    env: { ...process.env, TZ: 'America/New_York' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
});

test('fromISO rejects anything that is not a full ISO date', () => {
  for (const bad of ['', '2026-8-1', '01/08/2026', 'today', null, undefined, '2026-08']) {
    assert.equal(fromISO(bad), null, JSON.stringify(bad));
  }
});

test('fromISO rejects a day that does not exist in that month', () => {
  assert.equal(fromISO('2026-02-30'), null);
  assert.equal(fromISO('2026-13-01'), null);
  assert.equal(fromISO('2025-02-29'), null, 'not a leap year');
  assert.ok(fromISO('2024-02-29'), 'leap year');
});

test('formatLong names the month', () => {
  assert.equal(formatLong(fromISO('2026-09-01')), '1 September 2026');
  assert.equal(formatLong(fromISO('2026-12-25')), '25 December 2026');
});

// A grid that changes height as you page makes the buttons move under the
// pointer, so it is always six rows.
test('monthGrid is always 42 cells', () => {
  for (let month = 0; month < 12; month += 1) {
    assert.equal(monthGrid(2026, month).length, 42, `month ${month}`);
  }
  assert.equal(monthGrid(2026, 1).length, 42, 'February');
});

test('monthGrid starts on a Monday', () => {
  for (const [year, month] of [[2026, 0], [2026, 8], [2024, 1], [2027, 4]]) {
    assert.equal(monthGrid(year, month)[0].getDay(), 1, `${year}-${month}`);
  }
});

test('monthGrid contains every day of its month exactly once', () => {
  const grid = monthGrid(2026, 8).map(toISO);
  const days = new Date(2026, 9, 0).getDate();
  for (let d = 1; d <= days; d += 1) {
    const iso = `2026-09-${String(d).padStart(2, '0')}`;
    assert.equal(grid.filter((g) => g === iso).length, 1, iso);
  }
});

test('monthGrid pads with the neighbouring months, contiguously', () => {
  const grid = monthGrid(2026, 8);
  for (let i = 1; i < grid.length; i += 1) {
    const gap = (grid[i] - grid[i - 1]) / 86400000;
    assert.ok(Math.abs(gap - 1) < 0.01, `cells ${i - 1} and ${i} are not consecutive days`);
  }
});

test('a month starting on a Monday still shows a full leading week', () => {
  // June 2026 begins on a Monday: the grid must not start mid-month.
  const grid = monthGrid(2026, 5);
  assert.equal(toISO(grid[0]), '2026-06-01');
  assert.equal(grid.length, 42);
});
