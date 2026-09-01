import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryCodes, DEFAULT_CATEGORIES, TRANSFER_CATEGORY } from '../budget.js';

// A code in a coloured tag is read INSTEAD of the category name. Two
// categories sharing one would quietly mislabel money, so uniqueness is the
// whole contract; readability is only the tie-break.

test('a single-word category takes its first three letters', () => {
  assert.equal(categoryCodes(['Groceries']).get('Groceries'), 'GRO');
});

test('the default set produces a unique code for every category', () => {
  const names = DEFAULT_CATEGORIES.map((c) => c.name);
  const codes = categoryCodes(names);
  const values = [...codes.values()];
  assert.equal(new Set(values).size, values.length, `collision in ${values.join(', ')}`);
});

test('Transfer and Transportation do not collide', () => {
  // Both start TRA, and both are on screen together constantly.
  const codes = categoryCodes(['Transportation', TRANSFER_CATEGORY]);
  assert.notEqual(codes.get('Transportation'), codes.get(TRANSFER_CATEGORY));
});

test('order decides who gets the nicest code, and it is stable', () => {
  const a = categoryCodes(['Transportation', 'Transfer']);
  assert.equal(a.get('Transportation'), 'TRA');
  const b = categoryCodes(['Transfer', 'Transportation']);
  assert.equal(b.get('Transfer'), 'TRA');
  assert.notEqual(b.get('Transportation'), 'TRA');
});

test('names that differ only after the third letter still get unique codes', () => {
  const names = ['Savings A', 'Savings B', 'Savings C'];
  const values = [...categoryCodes(names).values()];
  assert.equal(new Set(values).size, 3, values.join(', '));
});

test('a code is never shorter than two characters', () => {
  for (const [, code] of categoryCodes(['A', 'Ab', 'Abc', 'A B C'])) {
    assert.ok(code.length >= 2, `"${code}" is too short to read`);
  }
});

test('punctuation and ampersands do not leak into a code', () => {
  const code = categoryCodes(['Food & Drinks']).get('Food & Drinks');
  assert.match(code, /^[A-Z0-9]+$/);
});

test('every code is uppercase alphanumeric, whatever the name', () => {
  const names = ['café société', '  spaced  out  ', 'ALLCAPS', 'digits 123'];
  for (const [name, code] of categoryCodes(names)) {
    assert.match(code, /^[A-Z0-9]+$/, `${name} -> ${code}`);
  }
});

test('a hundred similar names still produce a hundred distinct codes', () => {
  // The fallback has to actually terminate and stay unique under pressure.
  const names = Array.from({ length: 100 }, (_, i) => `Category ${i}`);
  const values = [...categoryCodes(names).values()];
  assert.equal(new Set(values).size, 100);
});

test('a word that loses its first choice falls back to its consonants', () => {
  // Transportation takes TRA, so Transfer must not degrade to a two-letter
  // stub when TRN is available and reads better.
  const codes = categoryCodes(['Transportation', 'Transfer']);
  assert.equal(codes.get('Transportation'), 'TRA');
  assert.equal(codes.get('Transfer'), 'TRN');
});

test('codes stay three characters wherever the name allows it', () => {
  const codes = categoryCodes(DEFAULT_CATEGORIES.map((c) => c.name));
  for (const [name, code] of codes) {
    if (name.replace(/[^A-Za-z0-9]/g, '').length >= 3) {
      assert.equal(code.length, 3, `${name} -> ${code}`);
    }
  }
});
