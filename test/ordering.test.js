import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORY_COLOURS, normaliseColour, sortByPosition, moveByOne, moveTo, categoryOptions,
} from '../budget.js';

const cats = (...specs) => specs.map(([name, position, kind = 'expense']) => ({ name, position, kind }));

test('sortByPosition uses the stored order, not the name', () => {
  const list = cats(['Zebra', 0], ['Apple', 1], ['Mango', 2]);
  assert.deepEqual(sortByPosition(list).map((c) => c.name), ['Zebra', 'Apple', 'Mango']);
});

test('records with no position sort last, alphabetically among themselves', () => {
  // A category created by an old import has no position. It has to land
  // somewhere predictable rather than at an arbitrary point in the list.
  const list = [
    { name: 'Second', position: 1 },
    { name: 'Unplaced B' },
    { name: 'First', position: 0 },
    { name: 'Unplaced A' },
  ];
  assert.deepEqual(sortByPosition(list).map((c) => c.name),
    ['First', 'Second', 'Unplaced A', 'Unplaced B']);
});

test('sortByPosition does not mutate its input', () => {
  const list = cats(['B', 1], ['A', 0]);
  const before = list.map((c) => c.name);
  sortByPosition(list);
  assert.deepEqual(list.map((c) => c.name), before);
});

test('moveByOne swaps with the neighbour in the given direction', () => {
  const names = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveByOne(names, 'c', -1), ['a', 'c', 'b', 'd']);
  assert.deepEqual(moveByOne(names, 'b', 1), ['a', 'c', 'b', 'd']);
});

test('moveByOne at either end returns the order unchanged', () => {
  // The buttons exist at every row, including the first and last.
  const names = ['a', 'b', 'c'];
  assert.deepEqual(moveByOne(names, 'a', -1), names);
  assert.deepEqual(moveByOne(names, 'c', 1), names);
});

test('moveByOne on a name that is not there changes nothing', () => {
  assert.deepEqual(moveByOne(['a', 'b'], 'ghost', 1), ['a', 'b']);
});

test('moveByOne never loses or duplicates an entry', () => {
  const names = ['a', 'b', 'c', 'd', 'e'];
  for (const name of names) {
    for (const direction of [-1, 1]) {
      const moved = moveByOne(names, name, direction);
      assert.equal(moved.length, names.length);
      assert.deepEqual([...moved].sort(), [...names].sort());
    }
  }
});

test('moveTo drops an item at the index asked for', () => {
  assert.deepEqual(moveTo(['a', 'b', 'c', 'd'], 'a', 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(moveTo(['a', 'b', 'c', 'd'], 'd', 0), ['d', 'a', 'b', 'c']);
});

test('moveTo clamps an index off either end rather than throwing', () => {
  // A drop can land past the last row.
  assert.deepEqual(moveTo(['a', 'b', 'c'], 'a', 99), ['b', 'c', 'a']);
  assert.deepEqual(moveTo(['a', 'b', 'c'], 'c', -5), ['c', 'a', 'b']);
});

test('moveTo never loses or duplicates an entry', () => {
  const names = ['a', 'b', 'c', 'd'];
  for (const name of names) {
    for (let i = -1; i <= names.length; i += 1) {
      const moved = moveTo(names, name, i);
      assert.deepEqual([...moved].sort(), [...names].sort(), `${name} -> ${i}`);
    }
  }
});

test('categoryOptions follows the stored order, not the alphabet', () => {
  // The reason ordering exists: the dropdown used every day comes out in the
  // arrangement chosen in Settings.
  const list = cats(['Transport', 0], ['Bills', 1], ['Apples', 2]);
  assert.deepEqual(categoryOptions(list, [], 'expense'), ['Transport', 'Bills', 'Apples']);
});

test('categoryOptions still separates income from expense when ordered', () => {
  const list = [
    { name: 'Salary', position: 0, kind: 'income' },
    { name: 'Rent', position: 1, kind: 'expense' },
    { name: 'Bonus', position: 2, kind: 'income' },
  ];
  assert.deepEqual(categoryOptions(list, [], 'income'), ['Salary', 'Bonus']);
  assert.deepEqual(categoryOptions(list, [], 'expense'), ['Rent']);
});

test('normaliseColour accepts only values from the curated set', () => {
  assert.equal(normaliseColour(CATEGORY_COLOURS[0].value), CATEGORY_COLOURS[0].value);
  assert.equal(normaliseColour('#123456'), null);
  assert.equal(normaliseColour('red'), null);
  assert.equal(normaliseColour(''), null);
  assert.equal(normaliseColour(undefined), null);
});

test('normaliseColour reads a colour case-insensitively', () => {
  // Backups are hand-edited and Excel lowercases things.
  assert.equal(normaliseColour('#ab5d46'), '#AB5D46');
});

test('every curated colour is distinct', () => {
  const values = CATEGORY_COLOURS.map((c) => c.value);
  assert.equal(new Set(values).size, values.length);
});

// Contrast is what makes these usable as chart fills on both tones at once.
// A graphical object needs 3:1 against its background (WCAG 1.4.11), and the
// two backgrounds are the graphite card and the peach card.
const luminance = (hex) => {
  const channel = (pair) => {
    const c = parseInt(pair, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('every curated colour reads on the graphite card and the peach card', () => {
  const GRAPHITE_CARD = '#17191C';
  const PEACH_CARD = '#F7DCD3';
  for (const { name, value } of CATEGORY_COLOURS) {
    const onDark = ratio(value, GRAPHITE_CARD);
    const onLight = ratio(value, PEACH_CARD);
    assert.ok(onDark >= 3, `${name} ${value} is ${onDark.toFixed(2)}:1 on graphite, needs 3:1`);
    assert.ok(onLight >= 3, `${name} ${value} is ${onLight.toFixed(2)}:1 on peach, needs 3:1`);
  }
});
