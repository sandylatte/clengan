import { splitBudget, resolveBucket, allocateFunds, UNCATEGORISED } from './budget.js';

// A transfer moves money between the user's own accounts. It is neither
// income nor spending, and both of its rows must be excluded from every
// total, or moving 200.00 into savings would read as 200.00 of spending.
const isFlow = (txn) => txn.transfer_id === null || txn.transfer_id === undefined;

export function monthOf(date) {
  return date.slice(0, 7);
}

export function filterMonth(txns, month) {
  return txns.filter((txn) => monthOf(txn.date) === month);
}

export function monthlyTotals(txns, month) {
  let income = 0;
  let spending = 0;
  for (const txn of filterMonth(txns, month)) {
    if (!isFlow(txn)) continue;
    if (txn.amount > 0) income += txn.amount;
    else spending += txn.amount;
  }
  return { income, spending, net: income + spending };
}

// Every spending view runs through this one filter so the pie, the legend
// and the caption can never disagree about which rows they describe.
//
// An empty account or bucket means "all", not "blank": a filter nobody set
// must not silently exclude everything. `bucket: 'none'` is the deliberate
// opposite — show only what has no bucket at all.
export function selectSpending(txns, categories, { period = 'month', month, account = '', bucket = '' }) {
  const inPeriod = period === 'year'
    ? txns.filter((txn) => txn.date.slice(0, 4) === month.slice(0, 4))
    : filterMonth(txns, month);
  return inPeriod.filter((txn) => {
    if (!isFlow(txn) || txn.amount >= 0) return false;
    if (account && txn.account !== account) return false;
    if (bucket && (resolveBucket(txn, categories) ?? 'none') !== bucket) return false;
    return true;
  });
}

// A row with no category is a real row with real money on it. It groups
// under one visible label rather than an empty string, which would render as
// a nameless slice the reader cannot account for.
export function spendingBreakdown(txns, categories, filter) {
  const totals = new Map();
  for (const txn of selectSpending(txns, categories, filter)) {
    const key = txn.category || UNCATEGORISED;
    totals.set(key, (totals.get(key) ?? 0) - txn.amount);
  }
  return [...totals]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category));
}

// Budget comes from income actually recorded in the month, not from a
// separately entered forecast. One number the user already keys in drives
// the whole split, and there is no second figure to drift out of sync.
//
// Spending in a category with no bucket (deleted category, or an import that
// named one we do not know) is returned as `unbucketed` rather than being
// folded into either budget. Silently charging it to "flexible" would make a
// remaining figure the user cannot reconcile against their own rows.
export function bucketTotals(txns, categories, month, split) {
  const { income } = monthlyTotals(txns, month);
  const budget = splitBudget(income, split);

  const spent = { fixed: 0, flexible: 0 };
  let unbucketed = 0;
  for (const txn of filterMonth(txns, month)) {
    if (!isFlow(txn) || txn.amount >= 0) continue;
    const bucket = resolveBucket(txn, categories);
    if (bucket) spent[bucket] -= txn.amount;
    else unbucketed -= txn.amount;
  }

  const unspent = (budget.fixed - spent.fixed) + (budget.flexible - spent.flexible);
  return {
    income,
    unbucketed,
    fixed: { budget: budget.fixed, spent: spent.fixed, remaining: budget.fixed - spent.fixed },
    flexible: { budget: budget.flexible, spent: spent.flexible, remaining: budget.flexible - spent.flexible },
    // The planner's best idea: underspending is not just a smaller number,
    // it becomes savings. `projected` is the target plus whatever the two
    // spending buckets left on the table.
    savings: { budget: budget.savings, unspent, projected: budget.savings + unspent },
  };
}

// Date.UTC paired with toISOString, never the local constructor: west of
// Greenwich a local midnight-of-the-first reads back as the previous month,
// and the trend chart would silently start one month early.
export function lastSixMonths(endMonth) {
  const [year, month] = endMonth.split('-').map(Number);
  return Array.from({ length: 6 }, (_, i) =>
    new Date(Date.UTC(year, month - 6 + i, 1)).toISOString().slice(0, 7));
}

export function monthsOfYear(year) {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
}

// The source spreadsheet writes this as SUM('2026_SEPT'!R14,'2026_OCT'!R14),
// which silently stops counting the moment a month is added. Computing it
// from the transactions means a new month needs no edit anywhere.
//
// Each month allocates that month's own projected savings, so a month that
// overspent contributes negative shares and pulls the year total down. That
// is the honest reading: the year is what actually accumulated.
export function fundsByYear(txns, categories, split, funds, year) {
  const totals = new Map(funds.map((f) => [f.name, 0]));
  const months = [];
  for (const month of monthsOfYear(year)) {
    const { savings, income } = bucketTotals(txns, categories, month, split);
    if (income === 0) continue;
    months.push({ month, projected: savings.projected });
    for (const { name, amount } of allocateFunds(savings.projected, funds)) {
      totals.set(name, totals.get(name) + amount);
    }
  }
  return {
    year,
    months,
    funds: funds.map(({ name, percent }) => ({ name, percent, amount: totals.get(name) })),
    total: months.reduce((sum, m) => sum + m.projected, 0),
  };
}

export function accountBalances(txns, accounts) {
  return accounts.map(({ name, opening_balance }) => {
    let balance = opening_balance;
    for (const txn of txns) {
      if (txn.account === name) balance += txn.amount;
    }
    return { account: name, balance };
  });
}

export function netTrend(txns, months) {
  return months.map((month) => ({ month, net: monthlyTotals(txns, month).net }));
}
