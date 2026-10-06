import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RELEASES } from '../changelog.js';

// Settings → App version shows the entry for the version it is serving. If
// CACHE is bumped without an entry, that page would describe the previous
// release as the latest one, so this fails first.
const cache = readFileSync(new URL('../sw.js', import.meta.url), 'utf8').match(/const CACHE = '([^']+)'/)[1];

test('the newest changelog entry is the version sw.js serves', () => {
  assert.equal(RELEASES[0].version, cache, `sw.js serves ${cache}; add an entry for it to changelog.js`);
});

test('every entry has a real date, at least one note, and versions are unique', () => {
  const seen = new Set();
  for (const { version, date, notes } of RELEASES) {
    assert.match(version, /^clengan-v\d+$/);
    assert.ok(!seen.has(version), `${version} appears twice`);
    seen.add(version);
    assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!Number.isNaN(Date.parse(date)), `${version} date ${date}`);
    assert.ok(Array.isArray(notes) && notes.length > 0 && notes.every((n) => typeof n === 'string' && n.trim()), `${version} needs notes`);
  }
});

test('entries run newest first', () => {
  const number = (version) => Number(version.split('-v')[1]);
  for (let i = 1; i < RELEASES.length; i += 1) {
    assert.ok(number(RELEASES[i - 1].version) > number(RELEASES[i].version));
    assert.ok(RELEASES[i - 1].date >= RELEASES[i].date);
  }
});
