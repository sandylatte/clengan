import test from 'node:test';
import assert from 'node:assert/strict';
import { matchAccountName } from '../db.js';

// One real account split across two casings is unrecoverable without editing
// rows by hand, and it has been reported twice. These pin the rule itself;
// findAccount and ensureAccount are thin wrappers that add only the read.
const accounts = [
  { name: 'Bank', opening_balance: 500000000 },
  { name: 'E-Wallet', opening_balance: 25000000 },
];

test('an exact name matches', () => {
  assert.equal(matchAccountName(accounts, 'Bank').name, 'Bank');
});

test('capitalisation never creates a second account', () => {
  for (const variant of ['bank', 'BANK', 'bAnK', 'BaNk']) {
    assert.equal(matchAccountName(accounts, variant)?.name, 'Bank', variant);
  }
});

test('surrounding whitespace is not a distinct account', () => {
  assert.equal(matchAccountName(accounts, '  Bank  ').name, 'Bank');
  assert.equal(matchAccountName(accounts, '\tbank\n').name, 'Bank');
});

test('a stored name with stray whitespace still matches', () => {
  assert.equal(matchAccountName([{ name: ' Bank ' }], 'bank').name, ' Bank ');
});

test('a genuinely new name does not match', () => {
  assert.equal(matchAccountName(accounts, 'Cash'), null);
  assert.equal(matchAccountName(accounts, 'Banks'), null);
  assert.equal(matchAccountName(accounts, 'Ban'), null);
});

test('a hyphenated name is matched whole, not by prefix', () => {
  assert.equal(matchAccountName(accounts, 'e-wallet').name, 'E-Wallet');
  assert.equal(matchAccountName(accounts, 'wallet'), null);
});

test('an empty or blank name matches nothing rather than the first account', () => {
  assert.equal(matchAccountName(accounts, ''), null);
  assert.equal(matchAccountName(accounts, '   '), null);
  assert.equal(matchAccountName(accounts, null), null);
  assert.equal(matchAccountName(accounts, undefined), null);
});

test('an empty account list matches nothing', () => {
  assert.equal(matchAccountName([], 'Bank'), null);
});
