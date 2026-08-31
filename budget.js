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
