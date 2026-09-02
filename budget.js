// Fixed and flexible describe a SPEND, not a category. The same groceries
// category is a flexible weekly shop one row and a fixed monthly stock-up
// the next, so the bucket lives on the transaction and nowhere else.
//
// A category answers a different question — is this money coming in or going
// out — and that one it can answer for good. Keeping both on the category is
// what the source planner did, via a SUMIF across two ledgers, and it is why
// a category there could contradict itself.
export const BUCKETS = ['fixed', 'flexible'];
export const CATEGORY_KINDS = ['expense', 'income'];

export const DEFAULT_INCOME_CATEGORIES = [
  { name: 'Salary', kind: 'income' },
  { name: 'Bonus', kind: 'income' },
  { name: 'Other income', kind: 'income' },
];

export const DEFAULT_CATEGORIES = [
  ...DEFAULT_INCOME_CATEGORIES,
  { name: 'Housing & Bills', kind: 'expense' },
  { name: 'Insurance', kind: 'expense' },
  { name: 'Internet', kind: 'expense' },
  { name: 'Subscription', kind: 'expense' },
  { name: 'Health & Skincare', kind: 'expense' },
  { name: 'Food & Drinks', kind: 'expense' },
  { name: 'Groceries', kind: 'expense' },
  { name: 'Transportation', kind: 'expense' },
  { name: 'Shopping', kind: 'expense' },
  { name: 'Entertainment', kind: 'expense' },
  { name: 'Others', kind: 'expense' },
];

// A category colour is DATA, not theme: it is stored per category and paints
// the same in both tones. So each of these has to be legible on the graphite
// card (#17191C) and the peach card (#F7DCD3) alike, which rules out anything
// very light or very dark. They sit in the middle of the lightness range and
// carry their identity by hue instead.
//
// Ten, and no more, on purpose. A pie with fifteen colours stops being
// readable, and a fixed set means two categories can be told apart at a
// glance rather than being two neighbouring shades of the same guess.
// Solved rather than eyeballed. Clearing 3:1 against BOTH cards at once pins
// relative luminance into a narrow band — roughly 0.13 to 0.22 — so these are
// one hue sweep at the lightness that balances the two ratios. The first
// hand-picked set failed: amber came out 2.33:1 on peach.
export const CATEGORY_COLOURS = [
  { name: 'Clay', value: '#AB5D46' },     /* 3.7:1 graphite, 3.7:1 peach */
  { name: 'Amber', value: '#906C37' },    /* 3.7:1 graphite, 3.7:1 peach */
  { name: 'Olive', value: '#657A33' },    /* 3.7:1 graphite, 3.7:1 peach */
  { name: 'Green', value: '#2B8159' },    /* 3.7:1 graphite, 3.7:1 peach */
  { name: 'Teal', value: '#257D8B' },     /* 3.7:1 graphite, 3.7:1 peach */
  { name: 'Blue', value: '#4975A7' },     /* 3.7:1 graphite, 3.7:1 peach */
  { name: 'Indigo', value: '#7369B2' },   /* 3.7:1 graphite, 3.7:1 peach */
  { name: 'Violet', value: '#9F54B2' },   /* 3.7:1 graphite, 3.7:1 peach */
  { name: 'Pink', value: '#AC567E' },     /* 3.7:1 graphite, 3.7:1 peach */
  { name: 'Stone', value: '#7E7063' },    /* 3.7:1 graphite, 3.7:1 peach */
];

const COLOUR_VALUES = new Set(CATEGORY_COLOURS.map((c) => c.value));

// Anything not from the set becomes "no colour" rather than being trusted.
// Colours arrive from imported workbooks and hand-edited backups too, and an
// arbitrary value would defeat the legibility the fixed set exists to give.
export function normaliseColour(value) {
  const wanted = String(value ?? '').trim().toUpperCase();
  return COLOUR_VALUES.has(wanted) ? wanted : null;
}

// Ordering is the user's, so it is stored, not derived. Ties fall back to the
// name so a set that has never been reordered still comes out stable rather
// than in whatever order the store happened to return.
function byPosition(a, b) {
  const left = Number.isFinite(a.position) ? a.position : Number.MAX_SAFE_INTEGER;
  const right = Number.isFinite(b.position) ? b.position : Number.MAX_SAFE_INTEGER;
  return left - right || String(a.name).localeCompare(String(b.name));
}

export function sortByPosition(items) {
  return [...items].sort(byPosition);
}

// Moving one item by one place, returned as a new list of names. Out-of-range
// moves return the order unchanged rather than throwing, because the caller
// is a button that can be pressed at either end of the list.
export function moveByOne(names, name, direction) {
  const from = names.indexOf(name);
  const to = from + direction;
  if (from === -1 || to < 0 || to >= names.length) return [...names];
  const next = [...names];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

// Dropping an item onto an index, for drag and drop. Same tolerance: an index
// off either end clamps rather than throwing.
export function moveTo(names, name, index) {
  const from = names.indexOf(name);
  if (from === -1) return [...names];
  const next = [...names];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(index, next.length)), 0, item);
  return next;
}

// Percent of income, matching the planner's 50%/20%/30%. Savings is not a
// spending bucket: nothing is charged against it. It is the target, and
// whatever fixed and flexible leave unspent lands on top of it.
export const DEFAULT_SPLIT = { fixed: 50, flexible: 20, savings: 30 };

// Savings is one number until it is named. The planner's own funds are the
// seed because a fund only changes behaviour once it has a purpose on it.
export const DEFAULT_FUNDS = [
  { name: 'Emergency Fund', percent: 35 },
  { name: 'Home Fund', percent: 30 },
  { name: 'Vehicle Fund', percent: 15 },
  { name: 'Travel Fund', percent: 10 },
  { name: 'Gift Fund', percent: 5 },
  { name: 'Others', percent: 5 },
];

// The budget split and the savings funds are one operation: name a set of
// percentages, check they total 100, divide a pool by them. Both go through
// the pair below rather than each growing its own copy of the rounding rule.
export function validatePercentages(percents) {
  if (!percents.every((p) => Number.isFinite(p) && p >= 0)) {
    throw new RangeError('each share must be a non-negative number');
  }
  const total = percents.reduce((sum, p) => sum + p, 0);
  if (Math.round(total) !== 100) {
    throw new RangeError(`shares must total 100, got ${total}`);
  }
  return percents;
}

// Integer cents in, integer cents out. Rounding each share independently
// leaves the parts summing to a cent more or less than the pool, so the last
// share takes the remainder instead of being rounded like the others.
export function allocate(poolCents, percents) {
  validatePercentages(percents);
  const parts = percents.slice(0, -1).map((p) => Math.round(poolCents * p / 100));
  return [...parts, poolCents - parts.reduce((sum, p) => sum + p, 0)];
}

export function validateSplit(split) {
  validatePercentages([split.fixed, split.flexible, split.savings]);
  return split;
}

// The three shares are edited one at a time, so the set spends most of its
// life not totalling 100. Reporting that only on submit means aiming blind;
// this names the gap and which way to close it while it is still open.
//
// `ok` and the message come from ONE comparison on purpose. They used to come
// from two — one rounded, one exact — which put "add 0.4% more" beside an
// enabled save button. validatePercentages rounds, so this rounds.
export function splitBalance(split) {
  const values = [split.fixed, split.flexible, split.savings];
  if (!values.every((v) => Number.isFinite(v) && v >= 0)) {
    return { ok: false, message: 'A share cannot be negative. Enter zero or more.' };
  }
  const total = values.reduce((sum, v) => sum + v, 0);
  if (Math.round(total) === 100) return { ok: true, message: 'Shares total 100%.' };
  const gap = 100 - total;
  return {
    ok: false,
    message: gap > 0
      ? `Shares total ${total}%. Add ${gap}% more.`
      : `Shares total ${total}%. Remove ${-gap}%.`,
  };
}

// Income rows and spending rows never share a category list: offering
// "Groceries" under Income is how a wrong bucket gets recorded in the first
// place. Names carried by existing rows stay selectable even once their
// category is gone, so an old row can still be re-filed under what it says.
export function categoryOptions(categories, usedNames, kind) {
  const income = kind === 'income';
  // The user's own order, not alphabetical: the whole point of letting them
  // arrange the list in Settings is that the dropdown they use every day
  // comes out in that arrangement.
  const names = sortByPosition(categories.filter((c) => (income ? c.kind === 'income' : c.kind !== 'income')))
    .map((c) => c.name);
  // An orphan is a name with NO category record at all. Filtering against the
  // kind-filtered list instead let every income category through onto the
  // expense list the moment one income row existed: it was absent from `names`
  // there, so it looked orphaned. A name that still has a record is not
  // orphaned — it is simply wrong for this kind of row.
  const known = new Set(categories.map((c) => c.name));
  const orphans = [...new Set(usedNames)]
    .filter((name) => !known.has(name) && name !== TRANSFER_CATEGORY)
    .sort();
  return [...names, ...orphans];
}

export function splitBudget(incomeCents, split) {
  const [fixed, flexible, savings] = allocate(incomeCents, [split.fixed, split.flexible, split.savings]);
  return { fixed, flexible, savings };
}

// Funds divide whatever savings actually lands, not the 30% target — the
// point of the rollover is that underspending reaches the funds. A negative
// pool (overspending ate the savings) allocates negative shares rather than
// clamping, so the shortfall is visible against the funds it came out of.
export function allocateFunds(poolCents, funds) {
  const amounts = allocate(poolCents, funds.map((f) => f.percent));
  return funds.map((fund, i) => ({ ...fund, amount: amounts[i] }));
}

export function kindOf(categories, name) {
  return categories.find((c) => c.name === name)?.kind ?? null;
}

// The row is the only place a bucket can come from. There is deliberately no
// fallback to the category any more: every expense row carries its own answer
// (the v5 migration stamped the old category bucket onto the rows that
// predate the field), and anything without one is genuinely unbucketed, which
// bucketTotals reports separately rather than charging to a guess.
export function resolveBucket(txn) {
  return txn.bucket === 'fixed' || txn.bucket === 'flexible' ? txn.bucket : null;
}

export const UNCATEGORISED = 'Uncategorised';

// The List shows a category as a short code in a coloured tag. A code is only
// worth reading if it is UNIQUE — two categories sharing one would quietly
// mislabel money, which is worse than no tag at all. So codes are derived for
// the whole set at once and collisions are resolved, rather than each name
// being abbreviated on its own.
//
// Candidates are tried in order of how well they read, and the first unused
// one wins. Order of the input decides who gets the nicest code, so it is the
// user's own category order — stable unless they rearrange it.
function codeCandidates(name) {
  const words = String(name).toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  if (words.length === 0) return [];
  const [first, second = ''] = words;
  const squashed = words.join('');
  return [
    first.slice(0, 3),                                   // GROCERIES -> GRO
    words.map((w) => w[0]).join('').slice(0, 3),         // HOUSING BILLS -> HB
    first.replace(/[AEIOU]/g, '').slice(0, 3),           // TRANSFER -> TRN, once TRA is taken
    (first.slice(0, 2) + (second[0] ?? '')).slice(0, 3), // TRANSPORTATION FEE -> TRF
    squashed.slice(0, 3),
    first.slice(0, 2) + first.slice(-1),
  ].filter(Boolean);
}

export function categoryCodes(names) {
  const taken = new Set();
  const codes = new Map();
  for (const name of names) {
    const candidate = codeCandidates(name).find((c) => c.length >= 2 && !taken.has(c));
    // Everything readable was taken, so fall back to a numbered code. Ugly on
    // purpose: it should look like something to fix by renaming.
    let code = candidate;
    for (let n = 2; !code; n += 1) {
      const numbered = `${String(name).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 2)}${n}`;
      if (!taken.has(numbered)) code = numbered;
    }
    taken.add(code);
    codes.set(name, code);
  }
  return codes;
}

// Written onto both halves of a transfer by the data layer. It is not a
// category anyone creates, so it must never be offered as one — a spend
// filed under it would look like a transfer to every reader of the list.
export const TRANSFER_CATEGORY = 'Transfer';
