import {
  monthlyTotals, periodTotals, periodBuckets, fundsByYear, limitTotals,
  spendingBreakdown, chartSlices, accountBalances, netTrend, lastSixMonths,
} from './rollup.js';
import { allocateFunds, sortByPosition } from './budget.js';

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The one place a row's amount is judged readable. Every figure is built from
// `valid`; the List still shows every row so a bad one can be found and fixed.
export function splitValid(txns) {
  const valid = [];
  const invalid = [];
  for (const t of txns) (Number.isInteger(t?.amount) ? valid : invalid).push(t);
  return { valid, invalid };
}

export function netLabel(period, month, today) {
  if (period === 'year') {
    return month.slice(0, 4) === today.slice(0, 4) ? 'Net this year' : `Net in ${month.slice(0, 4)}`;
  }
  return month === today ? 'Net this month' : `Net in ${MONTH_ABBR[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

// Every figure the Summary draws, in cents, from one pass over the rows. Pure:
// formatting and masking stay in app.js. The budget card and the funds card
// read the SAME `buckets`, so their savings figures cannot drift apart.
export function dashboardModel(txns, {
  accounts, categories, funds, split, plans, limits, period, month, today, account = '', bucket = '',
}) {
  const { valid, invalid } = splitValid(txns);
  const buckets = periodBuckets(valid, period, month, split, plans);

  // Shares mid-edit (not totalling 100) are a state to report: allocateFunds
  // would throw and take the whole Summary down with it.
  const fundTotal = funds.reduce((sum, f) => sum + f.percent, 0);
  let fundsView = { ready: false, total: fundTotal, empty: funds.length === 0 };
  if (funds.length && Math.round(fundTotal) === 100) {
    const year = fundsByYear(valid, split, funds, Number(month.slice(0, 4)), plans);
    const period = buckets.savings.projected;
    const thisPeriod = new Map(allocateFunds(period, funds).map((f) => [f.name, f.amount]));
    fundsView = {
      ready: true,
      period,
      year,
      rows: funds.map((f) => ({ ...f, period: thisPeriod.get(f.name), year: year.funds.find((y) => y.name === f.name).amount })),
      yearTotal: year.funds.reduce((sum, f) => sum + f.amount, 0),
    };
  }

  const breakdown = spendingBreakdown(valid, { period, month, account, bucket });
  const balances = accountBalances(valid, accounts);

  return {
    invalid,
    headNet: monthlyTotals(valid, today).net,
    totals: periodTotals(valid, period, month),
    netLabel: netLabel(period, month, today),
    buckets,
    limits: period === 'month'
      ? limitTotals(valid, limits, month, sortByPosition(categories).map((c) => c.name))
      : [],
    funds: fundsView,
    breakdown,
    spentTotal: breakdown.reduce((sum, b) => sum + b.total, 0),
    slices: chartSlices(breakdown),
    balances,
    balanceTotal: balances.reduce((sum, b) => sum + b.balance, 0),
    trend: netTrend(valid, lastSixMonths(month)),
  };
}
