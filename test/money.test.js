import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCents, fromCents, formatAmount } from '../money.js';

test('toCents converts plain decimals', () => {
  assert.equal(toCents('45.00'), 4500);
  assert.equal(toCents('45'), 4500);
  assert.equal(toCents('0.07'), 7);
  assert.equal(toCents(45.5), 4550);
});

test('toCents keeps the sign', () => {
  assert.equal(toCents('-45.00'), -4500);
  assert.equal(toCents(-0.01), -1);
});

test('toCents rounds half away from zero', () => {
  assert.equal(toCents('0.005'), 1);
  assert.equal(toCents('-0.005'), -1);
  assert.equal(toCents('1.005'), 101);
});

test('toCents survives float representation error', () => {
  // 0.1 + 0.2 === 0.30000000000000004
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(toCents('1.1'), 110);
  assert.equal(toCents('2.675'), 268);
});

test('toCents rejects values that are not numbers', () => {
  assert.throws(() => toCents('abc'));
  assert.throws(() => toCents(''));
  assert.throws(() => toCents(null));
  assert.throws(() => toCents(Infinity));
});

test('fromCents renders two decimals with sign', () => {
  assert.equal(fromCents(4500), '45.00');
  assert.equal(fromCents(-4500), '-45.00');
  assert.equal(fromCents(7), '0.07');
  assert.equal(fromCents(0), '0.00');
  assert.equal(fromCents(-7), '-0.07');
});

test('round trip preserves the value exactly', () => {
  for (const cents of [0, 1, -1, 7, -7, 4500, -4500, 123456789, -123456789]) {
    assert.equal(toCents(fromCents(cents)), cents);
  }
});

test('formatAmount marks positives with a plus', () => {
  assert.equal(formatAmount(4500), '+45.00');
  assert.equal(formatAmount(-4500), '-45.00');
  assert.equal(formatAmount(0), '0.00');
});
