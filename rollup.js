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

export function categoryBreakdown(txns, month) {
  const totals = new Map();
  for (const txn of filterMonth(txns, month)) {
    if (!isFlow(txn) || txn.amount >= 0) continue;
    totals.set(txn.category, (totals.get(txn.category) ?? 0) - txn.amount);
  }
  return [...totals]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category));
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
