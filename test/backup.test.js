import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backupReminder, backupAgeText, requestPersistence } from '../backup.js';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-10-01T12:00:00').getTime();

test('an empty ledger is never nagged', () => {
  assert.equal(backupReminder({ now, lastBackup: null, txnCount: 0 }).due, false);
});

test('a never-backed-up ledger is due once it holds a week of history', () => {
  assert.equal(backupReminder({ now, lastBackup: null, txnCount: 5, oldestDate: '2026-09-28' }).due, false);
  assert.equal(backupReminder({ now, lastBackup: null, txnCount: 5, oldestDate: '2026-09-20' }).due, true);
});

test('a backup is due again after thirty days', () => {
  assert.equal(backupReminder({ now, lastBackup: now - 29 * DAY, txnCount: 5 }).due, false);
  const r = backupReminder({ now, lastBackup: now - 30 * DAY, txnCount: 5 });
  assert.deepEqual(r, { due: true, age: 30 });
});

test('Later holds the reminder until the snooze runs out', () => {
  const base = { now, lastBackup: now - 40 * DAY, txnCount: 5 };
  assert.equal(backupReminder({ ...base, snoozedUntil: now + DAY }).due, false);
  assert.equal(backupReminder({ ...base, snoozedUntil: now - 1 }).due, true);
});

test('the age reads as words', () => {
  assert.equal(backupAgeText(null), 'Never backed up');
  assert.equal(backupAgeText(0), 'Backed up today');
  assert.equal(backupAgeText(1), 'Backed up yesterday');
  assert.equal(backupAgeText(12), 'Backed up 12 days ago');
});

test('persistence asks only when not already granted, and never throws', async () => {
  let asked = 0;
  assert.equal(await requestPersistence({ persisted: async () => true, persist: async () => { asked += 1; return true; } }), true);
  assert.equal(asked, 0);
  assert.equal(await requestPersistence({ persisted: async () => false, persist: async () => { asked += 1; return false; } }), false);
  assert.equal(asked, 1);
  assert.equal(await requestPersistence(undefined), null);
  assert.equal(await requestPersistence({ persisted: async () => { throw new Error('x'); }, persist: async () => true }), null);
});
