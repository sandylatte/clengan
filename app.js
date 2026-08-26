import * as db from './db.js';
import { toCents, fromCents, formatAmount } from './money.js';
import {
  filterMonth, monthlyTotals, categoryBreakdown, accountBalances, netTrend,
} from './rollup.js';
import { exportXlsx, importXlsx } from './xlsx-io.js';

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

const SEED_CATEGORIES = ['Food', 'Rent', 'Transport', 'Salary', 'Utilities', 'Fun'];

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
}

for (const input of kindInputs) input.addEventListener('change', syncKind);

function buildOptions(datalistId, names) {
  const datalist = document.getElementById(datalistId);
  datalist.innerHTML = '';
  for (const name of names) {
    const option = document.createElement('option');
    option.value = name;
    datalist.appendChild(option);
  }
}

async function fillDatalists() {
  const [accounts, txns] = await Promise.all([db.allAccounts(), db.allTransactions()]);
  buildOptions('accounts', accounts.map((a) => a.name));
  const used = new Set(txns.map((t) => t.category).filter(Boolean));
  const categories = [...new Set([...SEED_CATEGORIES, ...used])].sort();
  buildOptions('categories', categories);
}

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

    let magnitude;
    try {
      magnitude = toCents(document.getElementById('add-amount').value);
    } catch {
      status.style.color = 'var(--color-destructive)';
      status.textContent = 'Enter a valid amount.';
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

    // Ensure any account name typed for the first time exists with a zero
    // opening balance, so it appears in balances and in the datalist.
    const accounts = new Set((await db.allAccounts()).map((a) => a.name));
    for (const name of [account, document.getElementById('add-to').value.trim()]) {
      if (name && !accounts.has(name)) await db.putAccount(name, 0);
    }

    form.reset();
    document.getElementById('add-date').value = new Date().toISOString().slice(0, 10);
    syncKind();
    status.style.color = 'var(--color-accent)';
    status.textContent = 'Saved.';
    await refresh();
  } finally {
    submitting = false;
    saveButton.disabled = false;
  }
});

const state = { month: new Date().toISOString().slice(0, 7) };

const monthInput = document.getElementById('list-month');
monthInput.value = state.month;
monthInput.addEventListener('change', () => {
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

// txns here is already filtered to rows with an integer amount (see refresh()),
// so none of the calls below can coerce a bad value into a string/NaN and no
// try/catch is needed: every section renders fully from clean data. Rows that
// failed that filter are passed separately, only to name them in the banner.
function renderSummary(txns, accounts, invalidTxns) {
  const totals = monthlyTotals(txns, state.month);
  document.getElementById('stat-income').textContent = fromCents(totals.income);
  document.getElementById('stat-spent').textContent = fromCents(-totals.spending);
  const net = document.getElementById('stat-net');
  net.textContent = formatAmount(totals.net);
  net.className = `amount ${totals.net >= 0 ? 'amount--in' : 'amount--out'}`;

  const breakdown = categoryBreakdown(txns, state.month);
  const largest = breakdown.length ? breakdown[0].total : 0;
  document.getElementById('bars-empty').hidden = breakdown.length > 0;
  document.querySelector('#bars tbody').replaceChildren(...breakdown.map(({ category, total }) => {
    const row = document.createElement('tr');
    // largest is 0 only when breakdown is empty, so this never divides by zero
    row.style.setProperty('--bar', `${Math.round((total / largest) * 100)}%`);
    const name = document.createElement('td');
    name.textContent = category;
    const value = document.createElement('td');
    value.className = 'amount';
    value.textContent = fromCents(total);
    row.append(name, value);
    return row;
  }));

  const balances = accountBalances(txns, accounts);
  document.querySelector('#balances tbody').replaceChildren(
    ...balances.map(({ account, balance }) => {
      const row = document.createElement('tr');
      const name = document.createElement('td');
      name.textContent = account;
      const value = document.createElement('td');
      value.className = `amount ${balance < 0 ? 'amount--out' : ''}`;
      value.textContent = fromCents(balance);
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
      const total = balances.reduce((sum, b) => sum + b.balance, 0);
      value.className = `amount ${total < 0 ? 'amount--out' : ''}`;
      value.textContent = fromCents(total);
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
    'Net by month: ' + points.map((p) => `${p.month} ${fromCents(p.net)}`).join(', ') + '.';
}

async function refresh() {
  const [txns, accounts] = await Promise.all([db.allTransactions(), db.allAccounts()]);
  await fillDatalists();
  renderList(txns);

  // The List view (renderList above) needs every row, including corrupt ones,
  // so its per-row placeholder (Task 6) can surface them individually. The
  // dashboard instead partitions once here and computes every total, bar,
  // balance and trend point from valid rows only, so one bad row can't poison
  // a shared value (e.g. `spending += 'lots'` silently string-concatenating)
  // or leave sections mid-render at different states of the data.
  const validTxns = txns.filter((t) => Number.isInteger(t.amount));
  const invalidTxns = txns.filter((t) => !Number.isInteger(t.amount));
  renderSummary(validTxns, accounts, invalidTxns);
  await renderAccounts(accounts);
}

const ioStatus = document.getElementById('io-status');

document.getElementById('export-button').addEventListener('click', async () => {
  try {
    const txns = await db.allTransactions();
    exportXlsx(txns);
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
    const rows = await importXlsx(file);
    // Create any account named in the file BEFORE writing transactions.
    // Account creation is additive and carries no money, so if it fails
    // nothing about the ledger has changed yet — the transaction write
    // below is the only step that commits money data, so it goes last.
    const known = new Set((await db.allAccounts()).map((a) => a.name));
    for (const name of new Set(rows.map((r) => r.account))) {
      if (!known.has(name)) await db.putAccount(name, 0);
    }
    await db.putTransactions(rows);
    ioStatus.style.color = 'var(--color-accent)';
    ioStatus.textContent = `Imported ${rows.length} transactions.`;
    await refresh();
  } catch (error) {
    ioStatus.style.color = 'var(--color-destructive)';
    ioStatus.textContent = `Import failed — no transactions were changed. ${error.message}`;
  }
  event.target.value = '';
});

document.getElementById('account-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = document.getElementById('account-name').value.trim();
  if (!name) return;
  await db.putAccount(name, toCents(document.getElementById('account-opening').value || 0));
  event.target.reset();
  document.getElementById('account-opening').value = '0';
  await refresh();
});

async function renderAccounts(accounts) {
  document.getElementById('account-list').replaceChildren(...accounts.map(({ name, opening_balance }) => {
    const item = document.createElement('li');
    item.className = 'row';
    const main = document.createElement('div');
    main.className = 'row__main';
    main.textContent = name;
    const value = document.createElement('span');
    value.className = 'amount';
    value.textContent = fromCents(opening_balance);
    item.append(main, value);
    return item;
  }));
}

document.getElementById('add-date').value = new Date().toISOString().slice(0, 10);
syncKind();
await refresh();
