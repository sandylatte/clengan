// The ledger lives only in this browser. A cleared site, a lost phone or a
// browser evicting storage under pressure takes all of it, and nothing about
// the app would warn anyone beforehand. These two pieces are the warning.

export const LAST_BACKUP_KEY = 'last-backup';
export const BACKUP_SNOOZE_KEY = 'backup-snooze';

// A week. A month of entries is a whole budget cycle nobody can rebuild from
// memory, and the ledger lives only on this phone, so the most a lost phone or
// cleared site should ever cost is a few days of typing.
export const BACKUP_EVERY_DAYS = 7;
// "Later" is a real answer, but a short one, and shorter than the reminder
// itself so it never skips a whole backup cycle.
export const SNOOZE_DAYS = 3;

const DAY = 24 * 60 * 60 * 1000;

export function daysBetween(from, to) {
  return Math.floor((to - from) / DAY);
}

// Pure, so the rule can be tested without a clock or a database.
//
// Nobody is nagged about an empty ledger: there is nothing to lose. A ledger
// that has never been backed up is due once it holds a week of history,
// which is long enough that re-typing it would hurt and short enough that it
// has not been at risk for long.
export function backupReminder({ now, lastBackup, snoozedUntil, txnCount, oldestDate }) {
  if (!txnCount) return { due: false, age: null };
  const age = lastBackup ? daysBetween(lastBackup, now) : null;
  if (snoozedUntil && now < snoozedUntil) return { due: false, age };
  if (age === null) {
    const held = oldestDate ? daysBetween(new Date(`${oldestDate}T00:00:00`).getTime(), now) : 0;
    return { due: held >= 7, age };
  }
  return { due: age >= BACKUP_EVERY_DAYS, age };
}

export function backupAgeText(age) {
  if (age === null) return 'Never backed up';
  if (age <= 0) return 'Backed up today';
  if (age === 1) return 'Backed up yesterday';
  return `Backed up ${age} days ago`;
}

// Asks the browser to stop treating this site's storage as disposable. Chrome
// answers without a prompt (an installed app is normally granted), Firefox may
// ask the user, and Safari has no such API. Resolves to true, false, or null
// when the browser cannot say — and never throws, because a refusal here must
// not stop the app from opening.
export async function requestPersistence(storage = globalThis.navigator?.storage) {
  try {
    if (!storage?.persist) return null;
    if (await storage.persisted()) return true;
    return await storage.persist();
  } catch {
    return null;
  }
}
