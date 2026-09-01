// The planner this model came from keeps two parallel ledgers, one fixed and
// one flexible, and rolls a category up with SUMIF across BOTH of them. That
// lets "Groceries" be fixed on one row and flexible on the next, which no
// reader can reconcile. Here the category owns the bucket, so a category has
// exactly one answer and the add form needs no extra field.
// The two buckets a spend is charged against. Income categories exist too and
// carry bucket 'income', but they are not budget buckets — nothing is
// budgeted against income, income is what the budget is divided from. Keep
// BUCKETS meaning "spending buckets" and every consumer stays correct.
export const BUCKETS = ['fixed', 'flexible'];
export const CATEGORY_BUCKETS = ['fixed', 'flexible', 'income'];

export const DEFAULT_INCOME_CATEGORIES = [
  { name: 'Salary', bucket: 'income' },
  { name: 'Bonus', bucket: 'income' },
  { name: 'Other income', bucket: 'income' },
];

export const DEFAULT_CATEGORIES = [
  ...DEFAULT_INCOME_CATEGORIES,
  { name: 'Housing & Bills', bucket: 'fixed' },
  { name: 'Insurance', bucket: 'fixed' },
  { name: 'Internet', bucket: 'fixed' },
  { name: 'Subscription', bucket: 'fixed' },
  { name: 'Health & Skincare', bucket: 'fixed' },
  { name: 'Food & Drinks', bucket: 'flexible' },
  { name: 'Groceries', bucket: 'flexible' },
  { name: 'Transportation', bucket: 'flexible' },
  { name: 'Shopping', bucket: 'flexible' },
  { name: 'Entertainment', bucket: 'flexible' },
  { name: 'Others', bucket: 'flexible' },
];

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
    .filter((c) => (income ? c.bucket === 'income' : c.bucket !== 'income'))
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

export function bucketOf(categories, name) {
  return categories.find((c) => c.name === name)?.bucket ?? null;
}

// The same category is genuinely fixed one month and flexible the next —
// rent paid on a plan versus a one-off top-up, groceries versus a big shop.
// So the row owns its bucket and the category only supplies the default the
// form starts from. A row written before this existed has no bucket of its
// own and falls back to its category, which is what it was always charged to.
//
// Returns null for "no answer", which bucketTotals reports as unbucketed
// rather than guessing. An income category never yields a spending bucket.
export function resolveBucket(txn, categories) {
  if (txn.bucket === 'fixed' || txn.bucket === 'flexible') return txn.bucket;
  const fromCategory = bucketOf(categories, txn.category);
  return fromCategory === 'fixed' || fromCategory === 'flexible' ? fromCategory : null;
}

export const UNCATEGORISED = 'Uncategorised';
