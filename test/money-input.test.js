import test from 'node:test';
import assert from 'node:assert/strict';
import { groupDigits, rupiahToCents, centsToRupiahDigits } from '../money.js';

test('groupDigits inserts a dot every three digits from the right', () => {
  assert.equal(groupDigits('5000000'), '5.000.000');
  assert.equal(groupDigits('1000'), '1.000');
  assert.equal(groupDigits('999'), '999');
  assert.equal(groupDigits(''), '');
});

test('groupDigits ignores anything already in the field', () => {
  assert.equal(groupDigits('Rp 5.000.000'), '5.000.000');
  assert.equal(groupDigits('12a34b'), '1.234');
});

test('groupDigits strips leading zeros but keeps a lone zero', () => {
  assert.equal(groupDigits('007'), '7');
  assert.equal(groupDigits('0'), '0');
  assert.equal(groupDigits('0001000'), '1.000');
});

test('rupiahToCents multiplies by a hundred and reports an empty field as null', () => {
  assert.equal(rupiahToCents('5.000.000'), 500000000);
  assert.equal(rupiahToCents('1.000'), 100000);
  assert.equal(rupiahToCents('0'), 0);
  assert.equal(rupiahToCents(''), null);
  assert.equal(rupiahToCents('Rp '), null);
});

test('a field value survives a round trip through storage', () => {
  for (const typed of ['5000000', '1000', '0', '123456789']) {
    const cents = rupiahToCents(typed);
    assert.equal(centsToRupiahDigits(cents), String(Number(typed)), typed);
    assert.equal(groupDigits(centsToRupiahDigits(cents)), groupDigits(typed), typed);
  }
});

test('centsToRupiahDigits rounds a stray subunit rather than showing it', () => {
  assert.equal(centsToRupiahDigits(150), '2');
  assert.equal(centsToRupiahDigits(-500000000), '5000000');
});
