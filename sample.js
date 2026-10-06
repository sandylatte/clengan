// A worked example of a filled-in app: six months of a plausible Jakarta
// life, so every surface has something real to show. An empty app cannot be
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
  // Income too. Ten colours cover thirteen categories, so these repeat a hue
  // an expense already owns — acceptable because income and expense never
  // share a chart, and in the List an income row is already marked by a
  // signed amount in the credit colour before its rail is read.
  ['Salary', colour('Green')],
  ['Bonus', colour('Teal')],
  ['Other income', colour('Indigo')],
]);

// Every sample row carries this in its note. Settings promises the user they
// can find and delete them, and a promise made in the interface has to be
// something the data actually supports.
export const SAMPLE_NOTE = 'Sample data';

export const SAMPLE_ACCOUNTS = [
  { name: 'Bank BCA', opening_balance: rupiah(12_500_000) },
  { name: 'Cash', opening_balance: rupiah(1_200_000) },
  { name: 'E-Wallet', opening_balance: rupiah(1_000_000) },
  { name: 'Bank Jago', opening_balance: rupiah(5_000_000) },
];

const MONTH_COUNT = 6;

// Every month, to the rupiah: [day, category, name, amount, account].
const BILLS = [
  [1, 'Housing & Bills', 'Apartment rent', 4_500_000, 'Bank BCA'],
  [3, 'Internet', 'Home internet', 350_000, 'Bank BCA'],
  [5, 'Subscription', 'Streaming & music', 185_000, 'Bank BCA'],
  [8, 'Insurance', 'Health premium', 750_000, 'Bank BCA'],
];

// Spending that recurs but drifts, the way real spending does:
// [category, name, times a month, lowest, highest, account, bucket].
const HABITS = [
  ['Groceries', 'Weekly shop', 4, 260_000, 420_000, 'Bank BCA', 'flexible'],
  ['Food & Drinks', 'Coffee', 6, 28_000, 58_000, 'E-Wallet', 'flexible'],
  ['Food & Drinks', 'Lunch near the office', 5, 38_000, 85_000, 'E-Wallet', 'flexible'],
  ['Food & Drinks', 'Dinner out', 1, 220_000, 480_000, 'Bank BCA', 'flexible'],
  ['Transportation', 'Grab', 5, 22_000, 70_000, 'E-Wallet', 'flexible'],
  ['Transportation', 'Fuel', 2, 150_000, 230_000, 'Cash', 'flexible'],
  ['Housing & Bills', 'Electricity token', 1, 420_000, 680_000, 'Bank BCA', 'fixed'],
  ['Health & Skincare', 'Skincare and pharmacy', 1, 120_000, 380_000, 'E-Wallet', 'flexible'],
  ['Entertainment', 'Cinema', 1, 90_000, 160_000, 'Cash', 'flexible'],
];

// What makes one month unlike the next, oldest first:
// [day, category, name, signed amount, account, bucket].
const EVENTS = [
  [[12, 'Shopping', 'New running shoes', -1_100_000, 'Bank BCA', 'flexible']],
  [
    [9, 'Health & Skincare', 'Dentist', -1_400_000, 'Bank BCA', 'fixed'],
    [20, 'Entertainment', 'Concert tickets', -850_000, 'Bank BCA', 'flexible'],
  ],
  [
    // The same category on both sides of the split, deliberately: a big
    // one-off stock-up is a fixed cost that month, the weekly shop is not.
    // This is the case the whole row-owns-its-bucket model exists for.
    [2, 'Groceries', 'Big monthly stock-up', -2_100_000, 'Bank BCA', 'fixed'],
    [14, 'Food & Drinks', 'Family dinner', -1_320_000, 'Bank BCA', 'flexible'],
    [25, 'Bonus', 'Quarterly bonus', 4_200_000, 'Bank BCA'],
  ],
  [
    [11, 'Shopping', 'Phone case and charger', -430_000, 'E-Wallet', 'flexible'],
    [18, 'Other income', 'Freelance design job', 2_500_000, 'Bank Jago'],
  ],
  [
    [16, 'Shopping', 'Birthday gift', -650_000, 'Bank BCA', 'flexible'],
    [21, 'Health & Skincare', 'Eye test and glasses', -900_000, 'Bank BCA', 'flexible'],
  ],
  [
    [2, 'Groceries', 'Big monthly stock-up', -1_900_000, 'Bank BCA', 'fixed'],
    [6, 'Entertainment', 'Weekend in Bandung', -1_750_000, 'Bank BCA', 'flexible'],
    [13, 'Shopping', 'Work shirts', -380_000, 'Bank BCA', 'flexible'],
    [22, 'Other income', 'Freelance design job', 1_800_000, 'Bank Jago'],
  ],
];

// Money moved between the sample's own accounts every month, so the transfer
// rules have something to exclude: it must never count as income or spending.
const TRANSFERS = [
  [4, 'Cash withdrawal', 600_000, 'Bank BCA', 'Cash'],
  [26, 'Top up e-wallet', 1_500_000, 'Bank BCA', 'E-Wallet'],
  [27, 'Move to savings', 3_000_000, 'Bank BCA', 'Bank Jago'],
];

// mulberry32. Seeded per month, so the figures drift from month to month but
// the same month always comes out the same — the tests depend on that.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Month strings only, built the same way the trend chart builds them: from
// Date.UTC, never the local constructor, which reports the previous month
// west of Greenwich.
export function sampleMonths(endMonth, count = MONTH_COUNT) {
  const [year, month] = endMonth.split('-').map(Number);
  return Array.from({ length: count }, (_, i) =>
    new Date(Date.UTC(year, month - count + i, 1)).toISOString().slice(0, 7));
}

export function sampleTransactions(endMonth, makeId) {
  const rows = [];

  sampleMonths(endMonth).forEach((month, index) => {
    const on = (day) => `${month}-${String(day).padStart(2, '0')}`;
    const random = seeded(index + 1);
    const add = (day, category, name, amount, account, bucket = null) => rows.push({
      id: makeId(), date: on(day), account, amount: rupiah(amount),
      name, category, bucket, transfer_id: null, note: SAMPLE_NOTE,
    });

    add(25, 'Salary', 'Monthly salary', 18_000_000, 'Bank BCA');
    for (const [day, category, name, amount, account] of BILLS) add(day, category, name, -amount, account, 'fixed');

    for (const [category, name, times, low, high, account, bucket] of HABITS) {
      for (let k = 0; k < times; k += 1) {
        // Spread across the month, nudged a day either way. 28 is the last
        // day every month has.
        const day = Math.min(28, Math.max(1, Math.round(((k + 0.5) * 28) / times) + Math.floor(random() * 3) - 1));
        const amount = Math.round((low + random() * (high - low)) / 1000) * 1000;
        add(day, category, name, -amount, account, bucket);
      }
    }

    for (const [day, category, name, amount, account, bucket] of EVENTS[index % EVENTS.length]) {
      add(day, category, name, amount, account, amount < 0 ? bucket : null);
    }

    for (const [day, name, amount, from, to] of TRANSFERS) {
      const outId = makeId();
      const inId = makeId();
      rows.push({
        id: outId, date: on(day), account: from, amount: -rupiah(amount),
        name, category: 'Transfer', bucket: null, transfer_id: inId, note: SAMPLE_NOTE,
      });
      rows.push({
        id: inId, date: on(day), account: to, amount: rupiah(amount),
        name, category: 'Transfer', bucket: null, transfer_id: outId, note: SAMPLE_NOTE,
      });
    }
  });

  return rows;
}

// What "remove the sample" takes away: every row the sample wrote (its note
// says so), and each sample account that it would leave behind empty. An
// account is only the sample's to remove when it still has the sample's own
// opening balance and nothing else filed under it. Left in place, those
// made-up opening balances would keep inflating the Balance with money that
// never existed; an account the user already had, or has since used, stays.
export function sampleRemoval(txns, accounts) {
  const ids = txns.filter((t) => t.note === SAMPLE_NOTE).map((t) => t.id);
  const used = new Set(txns.filter((t) => t.note !== SAMPLE_NOTE).map((t) => t.account));
  const accountNames = SAMPLE_ACCOUNTS
    .map((sample) => accounts.find((a) => a.name === sample.name && a.opening_balance === sample.opening_balance))
    .filter((account) => account && !used.has(account.name))
    .map((account) => account.name);
  return { ids, accountNames };
}
