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

// The bucket every expense starts on. Most spending is flexible, and a
// required field with no default is a tap on every single entry.
export const DEFAULT_BUCKET = 'flexible';

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
  const names = categories
    .filter((c) => (income ? c.kind === 'income' : c.kind !== 'income'))
    .map((c) => c.name)
    .sort();
  // An orphan is a name with NO category record at all. Filtering against the
  // kind-filtered list instead let every income category through onto the
  // expense list the moment one income row existed: it was absent from `names`
  // there, so it looked orphaned. A name that still has a record is not
  // orphaned — it is simply wrong for this kind of row.
  const known = new Set(categories.map((c) => c.name));
  const orphans = [...new Set(usedNames)].filter((name) => !known.has(name)).sort();
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
