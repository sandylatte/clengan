import test from 'node:test';
import assert from 'node:assert/strict';
import {
  categoriesToSheetData, sheetDataToCategories,
  fundsToSheetData, sheetDataToFunds,
  settingsToSheetData, sheetDataToSettings,
  recurringToSheetData, sheetDataToRecurring,
} from '../xlsx-io.js';

// Excel hands every cell back as text when a sheet is read with raw:false,
// which is how the importer reads. Round-tripping through this is the only
// honest test — asserting against the objects the writer produced would pass
// even if the numbers arrived as strings on the way back.
const throughExcel = (rows) => rows.map((row) => Object.fromEntries(
  Object.entries(row).map(([key, value]) => [key, value === '' ? '' : String(value)]),
));

test('categories survive a round trip, colour and order included', () => {
  const categories = [
    { name: 'Groceries', kind: 'expense', colour: '#2B8159', position: 0 },
    { name: 'Salary', kind: 'income', colour: '#257D8B', position: 1 },
    { name: 'Odd one', kind: 'expense', colour: null, position: 2 },
  ];
  const back = sheetDataToCategories(throughExcel(categoriesToSheetData(categories)));
  assert.deepEqual(back, categories);
});

test('a colour outside the palette does not survive, by design', () => {
  const [back] = sheetDataToCategories([{ name: 'X', kind: 'expense', colour: '#123456', position: '0' }]);
  assert.equal(back.colour, null);
});

test('funds survive a round trip', () => {
  const funds = [{ name: 'Emergency', percent: 40 }, { name: 'Travel', percent: 60 }];
  assert.deepEqual(sheetDataToFunds(throughExcel(fundsToSheetData(funds))), funds);
});

test('a fund with a nonsense percent stops the import rather than importing zero', () => {
  assert.throws(() => sheetDataToFunds([{ name: 'X', percent: 'lots' }]), /percent/);
});

test('the split survives a round trip as an object, not as text', () => {
  const settings = [
    { key: 'split', value: { fixed: 50, flexible: 30, savings: 20 } },
    { key: 'default-account', value: 'Bank BCA' },
  ];
  assert.deepEqual(sheetDataToSettings(throughExcel(settingsToSheetData(settings))), settings);
});

test('an unreadable setting stops the import rather than restoring a default', () => {
  assert.throws(() => sheetDataToSettings([{ key: 'split', value: '{oops' }]), /not readable JSON/);
});

test('recurring rules survive a round trip, signs and last_run included', () => {
  const rules = [
    {
      id: 'a', name: 'Rent', amount: -450000000, account: 'Bank BCA',
      category: 'Housing & Bills', bucket: 'fixed', day: 25,
      last_run: '2026-08', active: true, note: '',
    },
    {
      id: 'b', name: 'Salary', amount: 1800000000, account: 'Bank BCA',
      category: 'Salary', bucket: null, day: 25,
      last_run: null, active: false, note: 'gross',
    },
  ];
  assert.deepEqual(sheetDataToRecurring(throughExcel(recurringToSheetData(rules))), rules);
});

test('a rule with an impossible day stops the import', () => {
  assert.throws(() => sheetDataToRecurring([{ id: 'a', amount: '1', day: '40' }]), /1 to 31/);
  assert.throws(() => sheetDataToRecurring([{ id: 'a', amount: '1', day: '0' }]), /1 to 31/);
});

test('a rule with a malformed last_run stops the import', () => {
  assert.throws(
    () => sheetDataToRecurring([{ id: 'a', amount: '1', day: '5', last_run: '2026-08-25' }]),
    /YYYY-MM/,
  );
});

test('a blank active cell leaves the rule running', () => {
  const [back] = sheetDataToRecurring([{ id: 'a', amount: '1', day: '5', active: '' }]);
  assert.equal(back.active, true);
});
