// A worked example of a filled-in app: three months of a plausible Jakarta
// month, so every surface has something real to show. An empty app cannot be
// judged — the budget reads all zeroes, the chart is blank, and there is no
// way to tell a working feature from a broken one.
//
// Pure and deterministic: it takes the month to end on and returns rows. It
// writes nothing itself, so it can be tested without a database and the
// caller stays in charge of whether any of it is kept.

import { CATEGORY_COLOURS } from './budget.js';

const rupiah = (whole) => whole * 100;

// Colours for the categories the sample actually uses, so the chart, the
// legend and the list rows arrive already telling the colour story rather
// than as ten shades of one ramp. Picked by hue distance, not by list order:
// the two largest slices are the ones a reader compares first, so they get
// colours from opposite ends of the wheel.
const colour = (name) => CATEGORY_COLOURS.find((c) => c.name === name).value;

export const SAMPLE_COLOURS = new Map([
  ['Housing & Bills', colour('Blue')],
  ['Groceries', colour('Green')],
  ['Food & Drinks', colour('Amber')],
  ['Transportation', colour('Teal')],
  ['Shopping', colour('Pink')],
  ['Entertainment', colour('Violet')],
  ['Subscription', colour('Indigo')],
  ['Internet', colour('Stone')],
  ['Insurance', colour('Olive')],
  ['Health & Skincare', colour('Clay')],
  // Income too. Ten colours cover twelve categories, so these two repeat a
  // hue an expense already owns — acceptable because income and expense never
  // share a chart, and in the List an income row is already marked by a
  // signed amount in the credit colour before its rail is read.
  ['Salary', colour('Green')],
  ['Bonus', colour('Teal')],
]);

// Every sample row carries this in its note. Settings promises the user they
// can find and delete them, and a promise made in the interface has to be
// something the data actually supports.
export const SAMPLE_NOTE = 'Sample data';

export const SAMPLE_ACCOUNTS = [
  { name: 'Bank BCA', opening_balance: rupiah(12_500_000) },
  { name: 'Cash', opening_balance: rupiah(1_200_000) },
  { name: 'E-Wallet', opening_balance: rupiah(1_000_000) },
];

// Each month follows the same shape with different figures, which is what
// makes the six-month trend and the year column worth looking at. Fixed rows
// repeat to the rupiah; flexible ones drift the way real spending does.
const MONTHLY = [
  {
    income: [['Salary', 'Monthly salary', 18_000_000, 'Bank BCA']],
    fixed: [
      ['Housing & Bills', 'Apartment rent', 4_500_000, 'Bank BCA'],
      ['Internet', 'Home internet', 350_000, 'Bank BCA'],
      ['Subscription', 'Streaming & music', 185_000, 'Bank BCA'],
      ['Insurance', 'Health premium', 750_000, 'Bank BCA'],
    ],
    flexible: [
      ['Groceries', 'Weekly shop', 1_250_000, 'Bank BCA'],
      ['Food & Drinks', 'Lunches out', 890_000, 'E-Wallet'],
      ['Transportation', 'Grab and fuel', 620_000, 'E-Wallet'],
      ['Shopping', 'New running shoes', 1_100_000, 'Bank BCA'],
      ['Entertainment', 'Cinema and books', 275_000, 'Cash'],
    ],
  },
  {
    income: [
      ['Salary', 'Monthly salary', 18_000_000, 'Bank BCA'],
      ['Bonus', 'Quarterly bonus', 4_200_000, 'Bank BCA'],
    ],
    fixed: [
      ['Housing & Bills', 'Apartment rent', 4_500_000, 'Bank BCA'],
      ['Internet', 'Home internet', 350_000, 'Bank BCA'],
      ['Subscription', 'Streaming & music', 185_000, 'Bank BCA'],
      ['Health & Skincare', 'Dentist', 1_400_000, 'Bank BCA'],
    ],
    flexible: [
      ['Groceries', 'Weekly shop', 1_480_000, 'Bank BCA'],
      ['Food & Drinks', 'Dinner with family', 1_320_000, 'Bank BCA'],
      ['Transportation', 'Grab and fuel', 540_000, 'E-Wallet'],
      ['Entertainment', 'Concert tickets', 850_000, 'Bank BCA'],
    ],
  },
  {
    income: [['Salary', 'Monthly salary', 18_000_000, 'Bank BCA']],
    fixed: [
      ['Housing & Bills', 'Apartment rent', 4_500_000, 'Bank BCA'],
      ['Internet', 'Home internet', 350_000, 'Bank BCA'],
      ['Subscription', 'Streaming & music', 185_000, 'Bank BCA'],
    ],
    flexible: [
      // The same category on both sides of the split, deliberately: a big
      // one-off stock-up is a fixed cost that month, the weekly shop is not.
      // This is the case the whole row-owns-its-bucket model exists for.
      ['Groceries', 'Big monthly stock-up', 2_100_000, 'Bank BCA', 'fixed'],
      ['Groceries', 'Weekly shop', 760_000, 'Bank BCA'],
      ['Food & Drinks', 'Coffee and lunches', 1_050_000, 'E-Wallet'],
      ['Transportation', 'Grab and fuel', 700_000, 'E-Wallet'],
      ['Shopping', 'Household bits', 430_000, 'Cash'],
    ],
  },
];

// Month strings only, built the same way the trend chart builds them: from
// Date.UTC, never the local constructor, which reports the previous month
// west of Greenwich.
export function sampleMonths(endMonth, count = MONTHLY.length) {
  const [year, month] = endMonth.split('-').map(Number);
  return Array.from({ length: count }, (_, i) =>
    new Date(Date.UTC(year, month - count + i, 1)).toISOString().slice(0, 7));
}

export function sampleTransactions(endMonth, makeId) {
  const rows = [];
  const months = sampleMonths(endMonth);

  months.forEach((month, index) => {
    const plan = MONTHLY[index];
    const on = (day) => `${month}-${String(day).padStart(2, '0')}`;

    for (const [category, name, amount, account] of plan.income) {
      rows.push({
        id: makeId(), date: on(25), account, amount: rupiah(amount),
        name, category, bucket: null, transfer_id: null, note: SAMPLE_NOTE,
      });
    }

    let day = 2;
    for (const group of ['fixed', 'flexible']) {
      for (const [category, name, amount, account, override] of plan[group]) {
        rows.push({
          id: makeId(), date: on(day), account, amount: -rupiah(amount),
          name, category, bucket: override ?? group, transfer_id: null, note: SAMPLE_NOTE,
        });
        day += 2;
      }
    }

    // One transfer a month, so the transfer rules have something to exclude:
    // it must never count as income or spending on either side.
    const outId = makeId();
    const inId = makeId();
    const moved = rupiah(1_000_000);
    rows.push({
      id: outId, date: on(26), account: 'Bank BCA', amount: -moved,
      name: 'Top up e-wallet', category: 'Transfer', bucket: null, transfer_id: inId, note: SAMPLE_NOTE,
    });
    rows.push({
      id: inId, date: on(26), account: 'E-Wallet', amount: moved,
      name: 'Top up e-wallet', category: 'Transfer', bucket: null, transfer_id: outId, note: SAMPLE_NOTE,
    });
  });

  return rows;
}
