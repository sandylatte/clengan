import * as db from './db.js';
import { formatIDR, formatAmount, groupDigits, rupiahToCents, centsToRupiahDigits } from './money.js';
import {
  filterMonth, monthlyTotals, categoryBreakdown, accountBalances, netTrend, bucketTotals, fundsByYear,
} from './rollup.js';
import { BUCKETS, DEFAULT_SPLIT, validateSplit, allocateFunds } from './budget.js';
import { exportXlsx, importXlsx, importPlanner } from './xlsx-io.js';
import { attachCalendar, toISO } from './calendar.js';

function showView(name) {
  for (const section of document.querySelectorAll('.view')) {
    section.hidden = section.id !== `view-${name}`;
  }
  for (const button of document.querySelectorAll('.tabbar button')) {
    if (button.dataset.view === name) {
      button.setAttribute('aria-current', 'page');
    } else {
      button.removeAttribute('aria-current');
    }
  }
}

document.querySelector('.tabbar').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-view]');
  if (button) showView(button.dataset.view);
});

const form = document.getElementById('add-form');
const kindInputs = form.querySelectorAll('input[name="kind"]');
const toWrap = document.getElementById('add-to-wrap');
const categoryWrap = document.getElementById('add-category-wrap');
const accountLabel = document.getElementById('add-account-label');
const status = document.getElementById('add-status');

const selectedKind = () => form.querySelector('input[name="kind"]:checked').value;

function syncKind() {
  const transfer = selectedKind() === 'transfer';
  toWrap.hidden = !transfer;
  categoryWrap.hidden = transfer;
  document.getElementById('add-category').required = !transfer;
  document.getElementById('add-to').required = transfer;
  accountLabel.textContent = transfer ? 'From account' : 'Account';
  if (state.categories.length) syncCategoryOptions();
}

for (const input of kindInputs) input.addEventListener('change', syncKind);

// A select rather than a datalist, because a datalist offers no visible
// affordance that a list exists and silently accepts anything typed. That is
// what let one real account become two ("bank" and "Bank") and what made the
// category list look broken. Anything offered here is now something that
// exists; new names are created in Settings, deliberately.
function fillSelect(select, names, placeholder) {
  const previous = select.value;
  const options = [document.createElement('option')];
  options[0].value = '';
  options[0].textContent = placeholder;
  options[0].disabled = true;
  for (const name of names) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    options.push(option);
  }
  select.replaceChildren(...options);
  // Keep the selection across a refresh when it still exists, so saving a row
  // does not silently reset the account you are working through.
  select.value = names.includes(previous) ? previous : '';
}

function syncCategoryOptions() {
  const income = selectedKind() === 'income';
  const names = state.categories
    .filter((c) => (income ? c.bucket === 'income' : c.bucket !== 'income'))
    .map((c) => c.name)
    .sort();
  // Names on existing rows stay selectable even after their category is
  // deleted, so an old row can still be re-filed under what it already says.
  const used = state.usedCategories.filter((name) => !names.includes(name));
  fillSelect(
    document.getElementById('add-category'),
    [...names, ...used.sort()],
    income ? 'Choose an income category' : 'Choose a category',
  );
}

async function fillPickers() {
  const [accounts, txns] = await Promise.all([db.allAccounts(), db.allTransactions()]);
  const names = accounts.map((a) => a.name).sort();
  state.usedCategories = [...new Set(txns.map((t) => t.category).filter(Boolean))];
  fillSelect(document.getElementById('add-account'), names, 'Choose an account');
  fillSelect(document.getElementById('add-to'), names, 'Choose an account');
  syncCategoryOptions();

  // Without an account nothing can be saved at all, and an empty select with
  // no explanation is a dead end. Name the way out.
  const setup = document.getElementById('add-setup');
  setup.hidden = names.length > 0;
  setup.textContent = 'Add an account in Settings before recording anything.';
}

// A money field is text, not a number input: type="number" cannot render
// grouping dots, and without them a rupiah figure is a wall of zeros nobody
// can read back. The stepper buttons replace the spinner that choice gives up.
// The caret always lands at the end because reformatting on every keystroke
// invalidates any earlier position, and money is typed left to right anyway.
function attachMoneyInput(input) {
  const reformat = () => {
    const grouped = groupDigits(input.value);
    if (input.value !== grouped) input.value = grouped;
  };
  input.addEventListener('input', reformat);
  input.addEventListener('blur', reformat);
  reformat();
}

for (const input of document.querySelectorAll('.stepper input')) attachMoneyInput(input);

document.addEventListener('click', (event) => {
  const button = event.target.closest('.stepper__button');
  if (!button) return;
  const input = document.getElementById(button.dataset.target);
  const step = Number(button.dataset.step);
  const current = Number(String(input.value).replace(/\D/g, '') || 0);
  // Clamped at zero: the sign is chosen by the expense/income control, and a
  // negative in the field would contradict whichever one is selected.
  input.value = groupDigits(String(Math.max(0, current + step)));
});

const saveButton = form.querySelector('button[type="submit"]');
let submitting = false;

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (submitting) return;
  submitting = true;
  saveButton.disabled = true;
  try {
    const kind = selectedKind();
    const date = document.getElementById('add-date').value;
    const note = document.getElementById('add-note').value;
    const account = document.getElementById('add-account').value.trim();

    const magnitude = rupiahToCents(document.getElementById('add-amount').value);
    if (magnitude === null) {
      status.style.color = 'var(--color-destructive)';
      status.textContent = 'Enter an amount.';
      return;
    }
    if (magnitude <= 0) {
      status.style.color = 'var(--color-destructive)';
      status.textContent = 'Amount must be greater than zero.';
      return;
    }

    try {
      if (kind === 'transfer') {
        const to = document.getElementById('add-to').value.trim();
        await db.addTransfer({ date, from: account, to, amount: magnitude, note });
      } else {
        await db.addFlow({
          date,
          account,
          amount: kind === 'income' ? magnitude : -magnitude,
          category: document.getElementById('add-category').value.trim(),
          note,
        });
      }
    } catch (error) {
      status.style.color = 'var(--color-destructive)';
      status.textContent = error.message;
      return;
    }

    form.reset();
    addDate.set(toISO(new Date()));
    syncKind();
    status.style.color = 'var(--color-accent)';
    status.textContent = 'Saved.';
    await refresh();
  } finally {
    submitting = false;
    saveButton.disabled = false;
  }
});

const state = { month: new Date().toISOString().slice(0, 7), categories: [], usedCategories: [], funds: [], split: DEFAULT_SPLIT };

const monthInput = document.getElementById('list-month');
monthInput.value = state.month;
monthInput.addEventListener('change', () => {
  // Clearable on Android Chrome. An empty value has no month to render —
  // keep showing the last valid month rather than feeding '' downstream.
  if (!monthInput.value) return;
  state.month = monthInput.value;
  refresh();
});

const TRASH_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;

function showListStatus(message) {
  const status = document.getElementById('list-status');
  status.style.color = message ? 'var(--color-destructive)' : '';
  status.textContent = message;
}

function renderList(txns) {
  const rows = filterMonth(txns, state.month)
    .sort((a, b) => b.date.localeCompare(a.date));
  const list = document.getElementById('list-rows');
  document.getElementById('list-empty').hidden = rows.length > 0;

  function buildDeleteButton(txn, label) {
    const remove = document.createElement('button');
    remove.className = 'row__delete';
    remove.type = 'button';
    remove.innerHTML = TRASH_ICON;
    remove.setAttribute('aria-label', label);
    remove.addEventListener('click', async () => {
      if (!txn || !txn.id) {
        showListStatus('This row has no id and cannot be removed automatically.');
        return;
      }
      const isTransfer = Boolean(txn.transfer_id);
      const message = isTransfer
        ? 'Delete this transfer? Both sides will be removed.'
        : 'Delete this transaction?';
      if (!confirm(message)) return;
      try {
        await db.deleteTransaction(txn.id);
      } catch (error) {
        showListStatus(`Delete failed: ${error.message}`);
        return;
      }
      showListStatus('');
      await refresh();
    });
    return remove;
  }

  function buildRow(txn) {
    const item = document.createElement('li');
    item.className = 'row';

    const main = document.createElement('div');
    main.className = 'row__main';
    const title = document.createElement('span');
    title.className = 'row__title';
    title.textContent = txn.transfer_id ? 'Transfer' : (txn.category || '');
    const meta = document.createElement('span');
    meta.className = 'row__meta';
    meta.textContent = [txn.date, txn.account, txn.note].filter(Boolean).join(' · ');
    main.append(title, meta);

    const amount = document.createElement('span');
    amount.className = `amount ${txn.amount > 0 ? 'amount--in' : 'amount--out'}`;
    amount.textContent = formatAmount(txn.amount);

    const remove = buildDeleteButton(txn, `Delete ${title.textContent} ${formatAmount(txn.amount)} on ${txn.date}`);

    item.append(main, amount, remove);
    return item;
  }

  function buildErrorRow(txn) {
    const item = document.createElement('li');
    item.className = 'row';

    const main = document.createElement('div');
    main.className = 'row__main';
    const title = document.createElement('span');
    title.className = 'row__title';
    title.style.color = 'var(--color-destructive)';
    title.textContent = 'Unreadable transaction';
    const meta = document.createElement('span');
    meta.className = 'row__meta';
    meta.textContent = [txn && txn.id, txn && txn.date, txn && txn.account].filter(Boolean).join(' · ');
    main.append(title, meta);

    const remove = buildDeleteButton(txn, `Delete unreadable transaction ${(txn && txn.id) || ''}`);

    item.append(main, remove);
    return item;
  }

  list.replaceChildren(...rows.map((txn) => {
    try {
      return buildRow(txn);
    } catch {
      return buildErrorRow(txn);
    }
  }));
}

function lastSixMonths(endMonth) {
  const [year, month] = endMonth.split('-').map(Number);
  const months = [];
  for (let back = 5; back >= 0; back -= 1) {
    const date = new Date(Date.UTC(year, month - 1 - back, 1));
    months.push(date.toISOString().slice(0, 7));
  }
  return months;
}

const BUCKET_LABELS = { fixed: 'Fixed', flexible: 'Flexible', income: 'Income' };

function renderBudget(txns) {
  const t = bucketTotals(txns, state.categories, state.month, state.split);

  const cell = (text, className) => {
    const td = document.createElement('td');
    if (className) td.className = className;
    td.textContent = text;
    return td;
  };

  const rows = BUCKETS.map((bucket) => {
    const { budget, spent, remaining } = t[bucket];
    const row = document.createElement('tr');
    // The bar reads as "how much of this bucket is gone", so it saturates at
    // full width once spending passes the budget rather than overflowing.
    const used = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
    row.style.setProperty('--bar', `${used}%`);
    row.append(
      cell(BUCKET_LABELS[bucket]),
      cell(formatIDR(budget), 'amount'),
      cell(formatIDR(spent), 'amount'),
      cell(formatIDR(remaining), `amount ${remaining < 0 ? 'amount--out' : ''}`),
    );
    return row;
  });

  // Nothing is charged against savings, so its Spent cell stays empty rather
  // than carrying the rollover as a negative. A gain under a column headed
  // "Spent" reads as a mistake however the sign is arranged; the rollover is
  // named in the note below, where it can be labelled for what it is.
  const savings = document.createElement('tr');
  savings.className = 'budget__savings';
  savings.append(
    cell('Savings'),
    cell(formatIDR(t.savings.budget), 'amount'),
    cell('—'),
    cell(formatIDR(t.savings.projected), `amount ${t.savings.projected < 0 ? 'amount--out' : 'amount--in'}`),
  );
  rows.push(savings);
  document.querySelector('#budget tbody').replaceChildren(...rows);

  const parts = [];
  if (t.income === 0) {
    parts.push('No income recorded this month, so every budget is zero.');
  } else {
    parts.push(`Split from ${formatIDR(t.income)} income.`);
    if (t.savings.unspent > 0) parts.push(`Savings includes ${formatIDR(t.savings.unspent)} rolled over from budget you did not spend.`);
    else if (t.savings.unspent < 0) parts.push(`Overspending of ${formatIDR(-t.savings.unspent)} comes out of savings.`);
  }

  // Only the unbucketed sentence is a warning. Colouring the whole note red
  // because of it makes the ordinary explanation look like an error too.
  const explanation = document.createElement('span');
  explanation.textContent = parts.join(' ');
  const children = [explanation];
  if (t.unbucketed > 0) {
    const warning = document.createElement('span');
    warning.className = 'budget-note__warning';
    warning.textContent = ` ${formatIDR(t.unbucketed)} was spent in categories with no bucket and is not charged to either budget.`;
    children.push(warning);
  }
  document.getElementById('budget-note').replaceChildren(...children);
}

// Funds are edited one at a time, so the set is routinely mid-edit and not
// totalling 100. That is a state to report, not to throw on: allocateFunds
// would reject it and take the whole dashboard render down with it.
function renderFunds(txns) {
  const note = document.getElementById('funds-note');
  const body = document.querySelector('#funds tbody');
  const total = state.funds.reduce((sum, f) => sum + f.percent, 0);

  if (state.funds.length === 0 || Math.round(total) !== 100) {
    body.replaceChildren();
    note.className = 'budget-note__warning';
    note.textContent = state.funds.length === 0
      ? 'No savings funds defined. Add some in Settings to divide savings up.'
      : `Fund shares total ${total}%, not 100%. Fix them in Settings to see the split.`;
    return;
  }

  const month = bucketTotals(txns, state.categories, state.month, state.split).savings.projected;
  const year = fundsByYear(txns, state.categories, state.split, state.funds, Number(state.month.slice(0, 4)));
  const monthly = new Map(allocateFunds(month, state.funds).map((f) => [f.name, f.amount]));
  const yearly = new Map(year.funds.map((f) => [f.name, f.amount]));

  const cell = (text, className) => {
    const td = document.createElement('td');
    if (className) td.className = className;
    td.textContent = text;
    return td;
  };

  const rows = state.funds.map((fund) => {
    const amount = monthly.get(fund.name);
    const row = document.createElement('tr');
    row.style.setProperty('--bar', `${fund.percent}%`);
    row.append(
      cell(fund.name),
      cell(`${fund.percent}%`),
      cell(formatIDR(amount), `amount ${amount < 0 ? 'amount--out' : ''}`),
      cell(formatIDR(yearly.get(fund.name)), `amount ${yearly.get(fund.name) < 0 ? 'amount--out' : ''}`),
    );
    return row;
  });

  const totalRow = document.createElement('tr');
  totalRow.className = 'budget__savings';
  totalRow.append(
    cell('Total'),
    cell(''),
    cell(formatIDR(month), `amount ${month < 0 ? 'amount--out' : 'amount--in'}`),
    cell(formatIDR(year.total), `amount ${year.total < 0 ? 'amount--out' : 'amount--in'}`),
  );
  rows.push(totalRow);
  body.replaceChildren(...rows);

  note.className = '';
  const counted = year.months.length;
  note.textContent = counted === 0
    ? `No income recorded in ${year.year} yet.`
    : `Year column covers ${counted} month${counted === 1 ? '' : 's'} of ${year.year} with income recorded.`;
}

// DESIGN.md forbids a second chromatic accent, so slices are one hue: the
// largest takes the accent at full strength and each smaller one steps toward
// the card behind it. Receding toward the card reads as "less" on a dark tone
// and a light one alike, which a lightness ramp does not — on graphite the
// pale end advances, on peach it recedes.
//
// color-mix resolves the tokens at paint time, so this follows a tone switch
// with no JavaScript involved and no colour conversion here.
function sliceColours(count) {
  if (count === 0) return [];
  const FAINTEST = 35;
  return Array.from({ length: count }, (_, i) => {
    const strength = count === 1 ? 100 : 100 - ((100 - FAINTEST) * i) / (count - 1);
    return `color-mix(in srgb, var(--color-primary) ${strength.toFixed(1)}%, var(--color-muted))`;
  });
}

function renderPie(breakdown, colours) {
  const pie = document.getElementById('pie');
  const total = breakdown.reduce((sum, b) => sum + b.total, 0);
  pie.hidden = total === 0;
  if (total === 0) {
    pie.replaceChildren();
    document.getElementById('pie-desc').textContent = '';
    return;
  }

  const R = 42;
  const point = (fraction) => {
    // Start at twelve o'clock and run clockwise, which is how a reader
    // expects to pick up the largest slice first.
    const angle = (fraction * 2 * Math.PI) - Math.PI / 2;
    return [50 + R * Math.cos(angle), 50 + R * Math.sin(angle)];
  };

  let cursor = 0;
  const shapes = breakdown.map(({ total: value }, i) => {
    const share = value / total;
    const node = document.createElementNS('http://www.w3.org/2000/svg',
      share >= 0.999 ? 'circle' : 'path');
    node.setAttribute('fill', colours[i]);
    // A hairline in the card colour keeps neighbouring slices of a
    // single-hue ramp from bleeding into one another.
    node.setAttribute('stroke', 'var(--color-muted)');
    node.setAttribute('stroke-width', '1');
    if (share >= 0.999) {
      // One category owning everything: an arc from 0 to 360 degrees is
      // degenerate and renders as nothing at all.
      node.setAttribute('cx', '50');
      node.setAttribute('cy', '50');
      node.setAttribute('r', String(R));
    } else {
      const [x0, y0] = point(cursor);
      const [x1, y1] = point(cursor + share);
      node.setAttribute('d',
        `M 50 50 L ${x0.toFixed(2)} ${y0.toFixed(2)} `
        + `A ${R} ${R} 0 ${share > 0.5 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`);
    }
    cursor += share;
    return node;
  });
  pie.replaceChildren(...shapes);

  document.getElementById('pie-desc').textContent = 'Spending share: '
    + breakdown.map((b) => `${b.category} ${Math.round((b.total / total) * 100)}%`).join(', ') + '.';
}

// txns here is already filtered to rows with an integer amount (see refresh()),
// so none of the calls below can coerce a bad value into a string/NaN and no
// try/catch is needed: every section renders fully from clean data. Rows that
// failed that filter are passed separately, only to name them in the banner.
function renderSummary(txns, accounts, invalidTxns) {
  const totals = monthlyTotals(txns, state.month);
  renderBudget(txns);
  renderFunds(txns);
  document.getElementById('stat-income').textContent = formatIDR(totals.income);
  document.getElementById('stat-spent').textContent = formatIDR(-totals.spending);
  const net = document.getElementById('stat-net');
  net.textContent = formatAmount(totals.net);
  net.className = `amount ${totals.net >= 0 ? 'amount--in' : 'amount--out'}`;

  const breakdown = categoryBreakdown(txns, state.month);
  const largest = breakdown.length ? breakdown[0].total : 0;
  const slices = sliceColours(breakdown.length);
  document.getElementById('bars-empty').hidden = breakdown.length > 0;
  renderPie(breakdown, slices);
  document.querySelector('#bars tbody').replaceChildren(...breakdown.map(({ category, total }, i) => {
    const row = document.createElement('tr');
    // largest is 0 only when breakdown is empty, so this never divides by zero
    row.style.setProperty('--bar', `${Math.round((total / largest) * 100)}%`);
    const name = document.createElement('td');
    // The swatch makes this table the pie's legend, so the chart needs no
    // labels of its own and stays readable when a slice is a sliver.
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = slices[i];
    name.append(swatch, document.createTextNode(category));
    const value = document.createElement('td');
    value.className = 'amount';
    value.textContent = formatIDR(total);
    row.append(name, value);
    return row;
  }));

  const balances = accountBalances(txns, accounts);
  const total = balances.reduce((sum, b) => sum + b.balance, 0);

  // Same figure as the Balances "Total" row, shown in the Add header so the
  // running total is visible on the view you open the app to.
  const headBalance = document.getElementById('head-balance');
  headBalance.textContent = accounts.length ? formatIDR(total) : '';
  headBalance.classList.toggle('amount--out', total < 0);

  document.querySelector('#balances tbody').replaceChildren(
    ...balances.map(({ account, balance }) => {
      const row = document.createElement('tr');
      const name = document.createElement('td');
      name.textContent = account;
      const value = document.createElement('td');
      value.className = `amount ${balance < 0 ? 'amount--out' : ''}`;
      value.textContent = formatIDR(balance);
      row.append(name, value);
      return row;
    }),
    (() => {
      const row = document.createElement('tr');
      const name = document.createElement('td');
      const strong = document.createElement('strong');
      strong.textContent = 'Total';
      name.append(strong);
      const value = document.createElement('td');
      value.className = `amount ${total < 0 ? 'amount--out' : ''}`;
      value.textContent = formatIDR(total);
      row.append(name, value);
      return row;
    })(),
  );

  renderTrend(netTrend(txns, lastSixMonths(state.month)));

  const statusEl = document.getElementById('summary-status');
  if (invalidTxns.length) {
    statusEl.style.color = 'var(--color-destructive)';
    const label = invalidTxns.length === 1 ? 'transaction' : 'transactions';
    const list = invalidTxns
      .map((t) => [t && t.id, t && t.date, t && t.account].filter(Boolean).join(' '))
      .join('; ');
    statusEl.textContent =
      `Figures exclude ${invalidTxns.length} unreadable ${label} (fix or delete in List): ${list}.`;
  } else {
    statusEl.style.color = '';
    statusEl.textContent = '';
  }
}

function renderTrend(points) {
  const svg = document.getElementById('trend');
  const values = points.map((p) => p.net);
  const high = Math.max(...values, 0);
  const low = Math.min(...values, 0);
  const span = high - low || 1;
  const y = (value) => 75 - ((value - low) / span) * 70;
  const x = (index) => (index / Math.max(points.length - 1, 1)) * 300;

  const line = points.map((point, index) => `${x(index)},${y(point.net)}`).join(' ');
  const zero = y(0);

  svg.innerHTML = `
    <line x1="0" y1="${zero}" x2="300" y2="${zero}" stroke="var(--color-border)" stroke-width="1"/>
    <polyline points="${line}" fill="none" stroke="var(--color-primary)" stroke-width="2"
              stroke-linejoin="round" stroke-linecap="round"/>
    ${points.map((point, index) =>
      `<circle cx="${x(index)}" cy="${y(point.net)}" r="3"
               fill="${point.net >= 0 ? 'var(--color-accent)' : 'var(--color-destructive)'}"/>`).join('')}
  `;

  document.getElementById('trend-desc').textContent =
    'Net by month: ' + points.map((p) => `${p.month} ${formatIDR(p.net)}`).join(', ') + '.';
}

async function refresh() {
  const [txns, accounts, categories, funds, split] = await Promise.all([
    db.allTransactions(), db.allAccounts(), db.allCategories(), db.allFunds(),
    db.getSetting('split', DEFAULT_SPLIT),
  ]);
  state.categories = categories;
  state.funds = funds;
  state.split = split;
  await fillPickers();
  renderList(txns);

  // The List view (renderList above) needs every row, including corrupt ones,
  // so its per-row placeholder (Task 6) can surface them individually. The
  // dashboard instead partitions once here and computes every total, bar,
  // balance and trend point from valid rows only, so one bad row can't poison
  // a shared value (e.g. `spending += 'lots'` silently string-concatenating)
  // or leave sections mid-render at different states of the data.
  try {
    const validTxns = txns.filter((t) => Number.isInteger(t.amount));
    const invalidTxns = txns.filter((t) => !Number.isInteger(t.amount));
    renderSummary(validTxns, accounts, invalidTxns);
    await renderAccounts(accounts);
    renderCategories(categories);
    renderFundList(funds);
    renderSplit(split);
  } catch (error) {
    // A render failure used to fail silently (an unhandled rejection with
    // nothing on screen). Surface it instead of leaving a half-painted or
    // stale dashboard with no indication anything went wrong.
    const summaryStatus = document.getElementById('summary-status');
    summaryStatus.style.color = 'var(--color-destructive)';
    summaryStatus.textContent = `Could not render dashboard: ${error.message}`;
  }
}

const ioStatus = document.getElementById('io-status');

document.getElementById('export-button').addEventListener('click', async () => {
  try {
    const [txns, accounts] = await Promise.all([db.allTransactions(), db.allAccounts()]);
    exportXlsx(txns, accounts);
    const unreadable = txns.filter((t) => !Number.isInteger(t.amount)).length;
    ioStatus.style.color = 'var(--color-accent)';
    ioStatus.textContent = unreadable
      ? `Exported. ${unreadable} row${unreadable === 1 ? '' : 's'} had an unreadable amount — fix the raw value in the file and re-import.`
      : 'Exported.';
  } catch (error) {
    ioStatus.style.color = 'var(--color-destructive)';
    ioStatus.textContent = `Export failed. ${error.message}`;
  }
});

document.getElementById('import-input').addEventListener('change', async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  try {
    const { rows, accounts, sheetName } = await importXlsx(file);
    // Write accounts named in the file BEFORE writing transactions, with
    // their real opening balances. Account creation is additive and carries
    // no money by itself, so if it fails nothing about the ledger has
    // changed yet — the transaction write below is the only step that
    // commits money data, so it goes last.
    // ponytail: N separate writes, not one IndexedDB transaction — a mid-loop
    // crash could leave some accounts written. Transactions are always written
    // last and separately, which is what keeps the "no transactions were
    // changed" message above truthful.
    //
    // A backup names its own accounts, so those are written as given. The
    // zero-fill below goes through ensureAccount so a row referring to "bank"
    // when "Bank" exists is filed against the one account rather than minting
    // a second, and the row is rewritten to the surviving spelling.
    for (const account of accounts) {
      await db.putAccount(account.name, account.opening_balance);
    }
    for (const row of rows) {
      row.account = await db.ensureAccount(row.account, 0);
    }
    await db.putTransactions(rows);
    ioStatus.style.color = 'var(--color-accent)';
    // 0 rows is valid (an empty database backs up to an empty sheet), but
    // naming the sheet makes it obvious if the user actually picked the
    // wrong file or the data sits on a different sheet than expected.
    ioStatus.textContent = rows.length === 0
      ? `Imported 0 transactions from sheet "${sheetName}".`
      : `Imported ${rows.length} transactions.`;
    await refresh();
  } catch (error) {
    ioStatus.style.color = 'var(--color-destructive)';
    ioStatus.textContent = `Import failed — no transactions were changed. ${error.message}`;
  }
  event.target.value = '';
});

const plannerStatus = document.getElementById('planner-status');

document.getElementById('planner-input').addEventListener('change', async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  const account = document.getElementById('planner-account').value.trim();
  if (!account) {
    plannerStatus.style.color = 'var(--color-destructive)';
    plannerStatus.textContent = 'Name the account these rows belong to first.';
    event.target.value = '';
    return;
  }
  try {
    const { rows, categories, problems, months } = await importPlanner(file, account);
    if (rows.length === 0) throw new Error('found month sheets but no ledger rows in them');

    const summary = `Import ${rows.length} row${rows.length === 1 ? '' : 's'} from ${months.join(', ')} under "${account}"?`;
    const detail = problems.length ? `\n\n${problems.length} row${problems.length === 1 ? '' : 's'} needed adjusting:\n${problems.slice(0, 8).join('\n')}` : '';
    if (!confirm(summary + detail)) {
      plannerStatus.style.color = '';
      plannerStatus.textContent = 'Import cancelled. Nothing was changed.';
      return;
    }

    // Files rows against an existing account when one matches by name in any
    // casing, rather than creating a near-duplicate of it.
    const target = await db.ensureAccount(account, 0);
    for (const row of rows) row.account = target;
    // The planner's own filing is the whole point of reading it, so its
    // buckets are written before the rows that depend on them.
    for (const [name, bucket] of categories) await db.putCategory(name, bucket);
    await db.putTransactions(rows);

    plannerStatus.style.color = 'var(--color-accent)';
    plannerStatus.textContent = problems.length
      ? `Imported ${rows.length} rows and ${categories.size} categories. ${problems.length} row${problems.length === 1 ? ' was' : 's were'} adjusted — check the List view.`
      : `Imported ${rows.length} rows and ${categories.size} categories.`;
    await refresh();
  } catch (error) {
    plannerStatus.style.color = 'var(--color-destructive)';
    plannerStatus.textContent = `Import failed — nothing was changed. ${error.message}`;
  }
  event.target.value = '';
});

const splitForm = document.getElementById('split-form');
const splitStatus = document.getElementById('split-status');
const splitFields = { fixed: 'split-fixed', flexible: 'split-flexible', savings: 'split-savings' };

// Refresh runs after every save, so writing the stored values back into the
// inputs while one is focused would fight the user mid-keystroke.
function renderSplit(split) {
  if (splitForm.contains(document.activeElement)) return;
  for (const [key, id] of Object.entries(splitFields)) {
    document.getElementById(id).value = split[key];
  }
  showSplitBalance();
}

const readSplit = () => Object.fromEntries(
  Object.entries(splitFields).map(([key, id]) => [key, Number(document.getElementById(id).value)]),
);

// The three shares are edited one at a time, so the set spends most of its
// life not totalling 100. Reporting that only on submit means the user aims
// blind and finds out afterwards; the running total names the gap and which
// way to close it, and the save button says whether it will be accepted.
function showSplitBalance() {
  const split = readSplit();
  const values = Object.values(split);
  const saveButton = splitForm.querySelector('button[type="submit"]');

  if (!values.every((v) => Number.isFinite(v) && v >= 0)) {
    splitStatus.className = 'budget-note__warning';
    splitStatus.textContent = 'Each share must be zero or more.';
    saveButton.disabled = true;
    return;
  }
  const total = values.reduce((sum, v) => sum + v, 0);
  const gap = 100 - total;
  saveButton.disabled = Math.round(total) !== 100;
  if (gap === 0) {
    splitStatus.className = '';
    splitStatus.textContent = 'Shares total 100%.';
  } else {
    splitStatus.className = 'budget-note__warning';
    splitStatus.textContent = gap > 0
      ? `Shares total ${total}%. Add ${gap}% more.`
      : `Shares total ${total}%. Remove ${-gap}%.`;
  }
}

for (const id of Object.values(splitFields)) {
  document.getElementById(id).addEventListener('input', showSplitBalance);
}

splitForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const split = readSplit();
  try {
    validateSplit(split);
  } catch (error) {
    splitStatus.className = 'budget-note__warning';
    splitStatus.textContent = error.message;
    return;
  }
  await db.putSetting('split', split);
  // After the refresh, not before: renderSplit repaints the fields and calls
  // showSplitBalance, which would overwrite this the moment it appeared.
  await refresh();
  splitStatus.className = '';
  splitStatus.textContent = `Saved. Fixed ${split.fixed}%, flexible ${split.flexible}%, savings ${split.savings}%.`;
});

const fundStatus = document.getElementById('fund-status');

document.getElementById('fund-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = document.getElementById('fund-name').value.trim();
  const percent = Number(document.getElementById('fund-percent').value);
  if (!name) return;
  if (!Number.isFinite(percent) || percent < 0) {
    fundStatus.className = 'budget-note__warning';
    fundStatus.textContent = 'Share must be a non-negative number.';
    return;
  }
  await db.putFund(name, percent);
  event.target.reset();
  await refresh();
});

// The running total is the whole point of this list: a fund set only pays
// out at exactly 100%, and the user gets there by editing one row at a time.
// Showing the total after every edit is what makes that reachable without
// the app refusing the intermediate states.
function renderFundList(funds) {
  const total = funds.reduce((sum, f) => sum + f.percent, 0);
  document.getElementById('fund-list').replaceChildren(...funds.map(({ name, percent }) => {
    const item = document.createElement('li');
    item.className = 'row';
    const main = document.createElement('div');
    main.className = 'row__main';
    main.textContent = name;
    const value = document.createElement('span');
    value.className = 'amount';
    value.textContent = `${percent}%`;

    const remove = document.createElement('button');
    remove.className = 'row__delete';
    remove.type = 'button';
    remove.innerHTML = TRASH_ICON;
    remove.setAttribute('aria-label', `Delete fund ${name}`);
    remove.addEventListener('click', async () => {
      if (!confirm(`Remove ${name}? The remaining funds will need to total 100% again.`)) return;
      await db.deleteFund(name);
      await refresh();
    });

    item.append(main, value, remove);
    return item;
  }));

  const balanced = Math.round(total) === 100;
  fundStatus.className = balanced ? '' : 'budget-note__warning';
  fundStatus.textContent = balanced
    ? 'Shares total 100%.'
    : `Shares total ${total}%. Savings will not divide until this is 100%.`;
}

const categoryStatus = document.getElementById('category-status');

document.getElementById('category-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = document.getElementById('category-name').value.trim();
  if (!name) return;
  await db.putCategory(name, document.getElementById('category-bucket').value);
  event.target.reset();
  categoryStatus.style.color = 'var(--color-accent)';
  categoryStatus.textContent = `Saved ${name}.`;
  await refresh();
});

function renderCategories(categories) {
  // Group by bucket in the order the form offers them, not alphabetically,
  // so income does not sort itself in between fixed and flexible.
  const order = { fixed: 0, flexible: 1, income: 2 };
  const sorted = [...categories].sort(
    (a, b) => order[a.bucket] - order[b.bucket] || a.name.localeCompare(b.name),
  );
  document.getElementById('category-list').replaceChildren(...sorted.map(({ name, bucket }) => {
    const item = document.createElement('li');
    item.className = 'row';
    const main = document.createElement('div');
    main.className = 'row__main';
    const title = document.createElement('span');
    title.className = 'row__title';
    title.textContent = name;
    main.append(title);

    // Editable in place. Re-saving through the form above meant retyping the
    // name exactly, and a typo there created a second category rather than
    // moving this one. Changing the bucket re-files every transaction already
    // under this name, because the category owns the bucket.
    const bucketSelect = document.createElement('select');
    bucketSelect.className = 'row__select';
    bucketSelect.setAttribute('aria-label', `Bucket for ${name}`);
    for (const value of ['fixed', 'flexible', 'income']) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = BUCKET_LABELS[value];
      option.selected = value === bucket;
      bucketSelect.append(option);
    }
    bucketSelect.addEventListener('change', async () => {
      await db.putCategory(name, bucketSelect.value);
      categoryStatus.className = '';
      categoryStatus.textContent = `${name} is now ${BUCKET_LABELS[bucketSelect.value].toLowerCase()}.`;
      await refresh();
    });

    const remove = document.createElement('button');
    remove.className = 'row__delete';
    remove.type = 'button';
    remove.innerHTML = TRASH_ICON;
    remove.setAttribute('aria-label', `Delete category ${name}`);
    remove.addEventListener('click', async () => {
      const txns = await db.allTransactions();
      const count = txns.filter((t) => t.category === name).length;
      const warning = count
        ? `Remove ${name}? ${count} transaction${count === 1 ? '' : 's'} keep${count === 1 ? 's' : ''} the name but stop counting against a budget.`
        : `Remove ${name}?`;
      if (!confirm(warning)) return;
      await db.deleteCategory(name);
      categoryStatus.className = '';
      categoryStatus.textContent = '';
      await refresh();
    });

    item.append(main, bucketSelect, remove);
    return item;
  }));
}

document.getElementById('account-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = document.getElementById('account-name').value.trim();
  if (!name) return;

  const opening = rupiahToCents(document.getElementById('account-opening').value) ?? 0;

  // A plain put replaced the opening balance with no warning, which looked
  // like nothing had happened while silently rewriting the starting point of
  // every balance. Replacing is still allowed, but it is now a decision.
  const clash = await db.findAccount(name);
  if (clash) {
    const label = clash.name === name
      ? `${name} already exists.`
      : `${clash.name} already exists, and "${name}" differs only by capitalisation.`;
    const confirmed = confirm(
      `${label}\n\nReplace its initial balance with ${formatIDR(opening)}?`
      + `\nIt is currently ${formatIDR(clash.opening_balance)}.`
      + '\n\nEvery transaction already filed under it is kept, and its balance shifts by the difference.',
    );
    if (!confirmed) {
      showAccountStatus(`Kept ${clash.name} at ${formatIDR(clash.opening_balance)}.`);
      return;
    }
    // Written under the EXISTING spelling. Using what was typed would create
    // the casing variant this whole path exists to prevent.
    await db.putAccount(clash.name, opening);
    event.target.reset();
    document.getElementById('account-opening').value = '0';
    showAccountStatus('');
    await refresh();
    return;
  }

  await db.putAccount(name, opening);
  event.target.reset();
  document.getElementById('account-opening').value = '0';
  showAccountStatus('');
  await refresh();
});

function showAccountStatus(message) {
  const el = document.getElementById('account-status');
  el.style.color = message ? 'var(--color-destructive)' : '';
  el.textContent = message;
}

// Deleting an account is the only escape hatch for the case-typo trap
// (typing "bank" then "Bank" permanently splits one real account in two —
// see Task 10 final review): it must never orphan a transaction, so it
// refuses whenever any transaction still references the account by name.
// ponytail: check-then-delete — a transaction added between the check and
// the delete below would not be caught; acceptable in a single-user local app.
async function deleteAccount(name) {
  const txns = await db.allTransactions();
  const count = txns.filter((t) => t.account === name).length;
  if (count > 0) {
    showAccountStatus(`Cannot remove ${name} — ${count} transaction${count === 1 ? '' : 's'} still ${count === 1 ? 'uses' : 'use'} it.`);
    return;
  }
  const database = await db.openDb();
  await new Promise((resolve, reject) => {
    const tx = database.transaction('accounts', 'readwrite');
    tx.objectStore('accounts').delete(name);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  showAccountStatus('');
  await refresh();
}

async function renderAccounts(accounts) {
  document.getElementById('account-list').replaceChildren(...accounts.map(({ name, opening_balance }) => {
    const item = document.createElement('li');
    item.className = 'row';
    const main = document.createElement('div');
    main.className = 'row__main';
    const title = document.createElement('span');
    title.className = 'row__title';
    title.textContent = name;
    // The figure here is the starting point, not what the account holds now.
    // Unlabelled next to an account name it reads as the current balance,
    // which is on the Summary's Balances card and is usually a different
    // number entirely.
    const meta = document.createElement('span');
    meta.className = 'row__meta';
    meta.textContent = 'Initial balance';
    main.append(title, meta);
    const value = document.createElement('span');
    value.className = 'amount';
    value.textContent = formatIDR(opening_balance);

    const remove = document.createElement('button');
    remove.className = 'row__delete';
    remove.type = 'button';
    remove.innerHTML = TRASH_ICON;
    remove.setAttribute('aria-label', `Delete account ${name}`);
    remove.addEventListener('click', async () => {
      if (!confirm(`Remove account ${name}?`)) return;
      try {
        await deleteAccount(name);
      } catch (error) {
        showAccountStatus(`Delete failed: ${error.message}`);
      }
    });

    item.append(main, value, remove);
    return item;
  }));
}

// The cache name is the only honest version marker: it is what the fetch
// handler is actually serving, not what the source on disk says. When those
// two disagree the app looks broken in ways that have nothing to do with the
// code, which is exactly the confusion this exists to end.
const versionStatus = document.getElementById('version-status');

async function showVersion() {
  // On a first visit the worker is still installing when this runs, and
  // reading the cache list too early reports "none" for an app that is about
  // to have one. Wait for the worker to be ready before believing the answer.
  if ('serviceWorker' in navigator) {
    await navigator.serviceWorker.ready.catch(() => {});
  }
  const names = await caches.keys();
  versionStatus.textContent = names.length
    ? `Serving ${names.join(', ')}.`
    : 'No offline cache yet — everything is coming straight from the server.';
}

document.getElementById('update-button').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  versionStatus.textContent = 'Fetching…';
  // Unregister before clearing: a live worker can re-serve from a cache
  // between the delete and the reload, which puts the stale shell straight
  // back. Transactions live in IndexedDB and are untouched by any of this.
  for (const registration of await navigator.serviceWorker.getRegistrations()) {
    await registration.unregister();
  }
  for (const name of await caches.keys()) await caches.delete(name);
  location.reload();
});

showVersion();

const themeSelect = document.getElementById('theme-select');
themeSelect.value = document.documentElement.dataset.theme === 'peach' ? 'peach' : 'graphite';
themeSelect.addEventListener('change', () => {
  const peach = themeSelect.value === 'peach';
  document.documentElement.dataset.theme = peach ? 'peach' : '';
  document.querySelector('meta[name="theme-color"]').content = peach ? '#F3CEC2' : '#0D0E10';
  localStorage.setItem('moneytrack-theme', peach ? 'peach' : 'graphite');
});

const addDate = attachCalendar({
  button: document.getElementById('add-date-button'),
  input: document.getElementById('add-date'),
  popup: document.getElementById('add-date-popup'),
});
addDate.set(toISO(new Date()));
syncKind();
await refresh();

if ('serviceWorker' in navigator) {
  // updateViaCache: 'none' stops the browser answering the sw.js update check
  // out of its own HTTP cache. Without it a worker can keep serving a shell
  // from many versions ago while every reload looks like it checked, which is
  // how a peach tone from before the button was retuned came back red weeks
  // later alongside pre-rupiah formatting.
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((registration) => {
    // Ask on every launch rather than waiting for the browser's own schedule.
    // The worker calls skipWaiting, so a newer one takes over on the next
    // load instead of sitting behind the current one indefinitely.
    registration.update().catch(() => {});
  }).catch(() => {
    // Registration fails on file:// and on some private-mode profiles. The
    // app works without it; only offline caching is lost.
  });
}
