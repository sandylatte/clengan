// The planner this model came from keeps two parallel ledgers, one fixed and
// one flexible, and rolls a category up with SUMIF across BOTH of them. That
// lets "Groceries" be fixed on one row and flexible on the next, which no
// reader can reconcile. Here the category owns the bucket, so a category has
// exactly one answer and the add form needs no extra field.
export const BUCKETS = ['fixed', 'flexible'];

export const DEFAULT_CATEGORIES = [
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

export function validateSplit(split) {
  const values = [split.fixed, split.flexible, split.savings];
  if (!values.every((v) => Number.isFinite(v) && v >= 0)) {
    throw new RangeError('each share must be a non-negative number');
  }
  const total = values.reduce((sum, v) => sum + v, 0);
  if (Math.round(total) !== 100) {
    throw new RangeError(`shares must total 100, got ${total}`);
  }
  return split;
}

// Integer cents in, integer cents out. Rounding each share independently
// would leave the three budgets summing to a cent more or less than income,
// so the last share absorbs the remainder instead of being rounded.
export function splitBudget(incomeCents, split) {
  validateSplit(split);
  const fixed = Math.round(incomeCents * split.fixed / 100);
  const flexible = Math.round(incomeCents * split.flexible / 100);
  return { fixed, flexible, savings: incomeCents - fixed - flexible };
}

export function bucketOf(categories, name) {
  return categories.find((c) => c.name === name)?.bucket ?? null;
}
