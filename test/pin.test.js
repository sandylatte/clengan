import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPin, hashPin, newSalt, lockFor, pinNeeded, waitText, FREE_TRIES,
  ASK_EVERY, ASK_LEAVE, ASK_MINUTES,
} from '../pin.js';

test('a PIN is exactly four digits', () => {
  for (const ok of ['0000', '1234', '9876']) assert.equal(isPin(ok), true, ok);
  for (const bad of ['', '123', '12345', '12a4', ' 1234', '12 4', '١٢٣٤']) assert.equal(isPin(bad), false, bad);
});

test('hashPin is stable for one salt, differs across salts and PINs, never the digits', async () => {
  const salt = newSalt();
  assert.match(salt, /^[0-9a-f]{32}$/);
  const once = await hashPin('1234', salt);
  assert.equal(await hashPin('1234', salt), once);
  assert.notEqual(await hashPin('1235', salt), once);
  assert.notEqual(await hashPin('1234', newSalt()), once);
  assert.match(once, /^[0-9a-f]{64}$/);
  assert.equal(once.includes('1234'), false);
});

test('lockFor is free for the first tries, then doubles up to a cap', () => {
  for (let fails = 0; fails < FREE_TRIES; fails += 1) assert.equal(lockFor(fails), 0);
  assert.equal(lockFor(FREE_TRIES), 30_000);
  assert.equal(lockFor(FREE_TRIES + 1), 60_000);
  assert.equal(lockFor(FREE_TRIES + 2), 120_000);
  assert.equal(lockFor(FREE_TRIES + 50), 30 * 60_000);
});

test('pinNeeded follows the chosen frequency', () => {
  const now = 10 * 60_000;
  assert.equal(pinNeeded(null, 0, now), false, 'no PIN, never asks');
  for (const ask of [ASK_EVERY, ASK_LEAVE, ASK_MINUTES]) {
    assert.equal(pinNeeded({ ask, minutes: 5 }, 0, now), true, `${ask}: asks before the first entry`);
  }
  assert.equal(pinNeeded({ ask: ASK_EVERY }, now - 1000, now), true, 'every: asks again straight away');
  assert.equal(pinNeeded({ ask: ASK_LEAVE }, now - 9 * 60_000, now), false, 'leave: not until the app is left');
  assert.equal(pinNeeded({ ask: ASK_MINUTES, minutes: 5 }, now - 4 * 60_000, now), false, 'minutes: inside the window');
  assert.equal(pinNeeded({ ask: ASK_MINUTES, minutes: 5 }, now - 5 * 60_000, now), true, 'minutes: window over');
});

test('waitText reads like a person would say it', () => {
  assert.equal(waitText(30_000), '30 s');
  assert.equal(waitText(29_001), '30 s');
  assert.equal(waitText(60_000), '1 min');
  assert.equal(waitText(90_000), '1 min 30 s');
});
