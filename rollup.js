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

// Search deliberately ignores the month. The month control answers "what did
// March look like"; search answers "where is that one payment", and a search
// that could only see the month already on screen would never once answer it.
// Every word must match somewhere in the row, in any field and any order, so
// "grab jan" finds a January Grab ride without the user recalling which field
// held which word.
const SEARCH_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function searchTransactions(txns, query) {
  const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return txns.filter((txn) => {
    // Both spellings of the date: the ISO string so "2026-03" works, and the
    // month's name so "jan" does. A reader remembers the month, not the digit.
    const named = SEARCH_MONTHS[Number(txn.date.slice(5, 7)) - 1] ?? '';
    const hay = [txn.name, txn.category, txn.account, txn.note, txn.date, named]
      .filter(Boolean).join(' ').toLowerCase();
    return words.every((word) => hay.includes(word));
  });
}

// The List groups rows under a date instead of repeating it on every row.
// Each group carries that day's net, which is the figure a reader wants when
// scanning: "what did this day cost me". Transfers are excluded from the net
// for the same reason they are excluded everywhere else — moving money
// between your own accounts is not a day's spending — but the ROWS stay, so
// nothing disappears from the list.
export function groupByDay(txns) {
  const days = new Map();
  for (const txn of txns) {
    if (!days.has(txn.date)) days.set(txn.date, []);
    days.get(txn.date).push(txn);
  }
  return [...days]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, rows]) => ({
      date,
      rows,
      net: rows.reduce((sum, txn) => (isFlow(txn) ? sum + txn.amount : sum), 0),
    }));
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
export function selectSpending(txns, { period = 'month', month, account = '', bucket = '' }) {
  const inPeriod = period === 'year'
    ? txns.filter((txn) => txn.date.slice(0, 4) === month.slice(0, 4))
    : filterMonth(txns, month);
  return inPeriod.filter((txn) => {
    if (!isFlow(txn) || txn.amount >= 0) return false;
    if (account && txn.account !== account) return false;
    if (bucket && (resolveBucket(txn) ?? 'none') !== bucket) return false;
    return true;
  });
}

// A row with no category is a real row with real money on it. It groups
// under one visible label rather than an empty string, which would render as
// a nameless slice the reader cannot account for.
export function spendingBreakdown(txns, filter) {
  const totals = new Map();
  for (const txn of selectSpending(txns, filter)) {
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
export function bucketTotals(txns, month, split) {
  const { income } = monthlyTotals(txns, month);
  const budget = splitBudget(income, split);

  const spent = { fixed: 0, flexible: 0 };
  let unbucketed = 0;
  for (const txn of filterMonth(txns, month)) {
    if (!isFlow(txn) || txn.amount >= 0) continue;
    const bucket = resolveBucket(txn);
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

// A period is either one month or the twelve of its year. Every figure on the
// Summary now runs through this, so the balance, the budget, the funds and the
// chart cannot disagree about which span they describe — until now only the
// chart could switch, and the rest of the screen silently stayed monthly.
export function monthsInPeriod(period, month) {
  return period === 'year' ? monthsOfYear(Number(month.slice(0, 4))) : [month];
}

export function periodTotals(txns, period, month) {
  return monthsInPeriod(period, month).reduce((sum, each) => {
    const { income, spending } = monthlyTotals(txns, each);
    return { income: sum.income + income, spending: sum.spending + spending,
      net: sum.net + income + spending };
  }, { income: 0, spending: 0, net: 0 });
}

// Budgets are summed per month rather than derived from the year's income in
// one go. They are not the same number: each month's split comes from that
// month's own income, so a year with uneven earnings budgets differently month
// by month, and totalling the months is the only honest answer.
export function periodBuckets(txns, period, month, split) {
  const months = monthsInPeriod(period, month);
  if (months.length === 1) return bucketTotals(txns, months[0], split);

  const zero = { budget: 0, spent: 0, remaining: 0 };
  return months.reduce((sum, each) => {
    const t = bucketTotals(txns, each, split);
    const add = (a, b) => ({ budget: a.budget + b.budget, spent: a.spent + b.spent,
      remaining: a.remaining + b.remaining });
    return {
      income: sum.income + t.income,
      unbucketed: sum.unbucketed + t.unbucketed,
      fixed: add(sum.fixed, t.fixed),
      flexible: add(sum.flexible, t.flexible),
      savings: {
        budget: sum.savings.budget + t.savings.budget,
        unspent: sum.savings.unspent + t.savings.unspent,
        projected: sum.savings.projected + t.savings.projected,
      },
    };
  }, { income: 0, unbucketed: 0, fixed: { ...zero }, flexible: { ...zero },
       savings: { budget: 0, unspent: 0, projected: 0 } });
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
export function fundsByYear(txns, split, funds, year) {
  const totals = new Map(funds.map((f) => [f.name, 0]));
  const months = [];
  for (const month of monthsOfYear(year)) {
    const { savings, income } = bucketTotals(txns, month, split);
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
