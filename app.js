import * as db from './db.js';
import { toCents, fromCents, formatAmount } from './money.js';
import {
  filterMonth, monthlyTotals, categoryBreakdown, accountBalances, netTrend, bucketTotals,
} from './rollup.js';
import { BUCKETS, DEFAULT_SPLIT, validateSplit } from './budget.js';
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

// Names already used on a row stay offered even after their category is
// deleted, so re-filing an old row does not require re-creating the category.
async function fillDatalists() {
  const [accounts, txns, categories] = await Promise.all([
    db.allAccounts(), db.allTransactions(), db.allCategories(),
  ]);
  buildOptions('accounts', accounts.map((a) => a.name));
  const used = txns.map((t) => t.category).filter(Boolean);
  buildOptions('categories', [...new Set([...categories.map((c) => c.name), ...used])].sort());
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

const state = { month: new Date().toISOString().slice(0, 7), categories: [], split: DEFAULT_SPLIT };

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

const BUCKET_LABELS = { fixed: 'Fixed', flexible: 'Flexible' };

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
      cell(fromCents(budget), 'amount'),
      cell(fromCents(spent), 'amount'),
      cell(fromCents(remaining), `amount ${remaining < 0 ? 'amount--out' : ''}`),
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
    cell(fromCents(t.savings.budget), 'amount'),
    cell('—'),
    cell(fromCents(t.savings.projected), `amount ${t.savings.projected < 0 ? 'amount--out' : 'amount--in'}`),
  );
  rows.push(savings);
  document.querySelector('#budget tbody').replaceChildren(...rows);

  const parts = [];
  if (t.income === 0) {
    parts.push('No income recorded this month, so every budget is zero.');
  } else {
    parts.push(`Split from ${fromCents(t.income)} income.`);
    if (t.savings.unspent > 0) parts.push(`Savings includes ${fromCents(t.savings.unspent)} rolled over from budget you did not spend.`);
    else if (t.savings.unspent < 0) parts.push(`Overspending of ${fromCents(-t.savings.unspent)} comes out of savings.`);
  }

  // Only the unbucketed sentence is a warning. Colouring the whole note red
  // because of it makes the ordinary explanation look like an error too.
  const explanation = document.createElement('span');
  explanation.textContent = parts.join(' ');
  const children = [explanation];
  if (t.unbucketed > 0) {
    const warning = document.createElement('span');
    warning.className = 'budget-note__warning';
    warning.textContent = ` ${fromCents(t.unbucketed)} was spent in categories with no bucket and is not charged to either budget.`;
    children.push(warning);
  }
  document.getElementById('budget-note').replaceChildren(...children);
}

// txns here is already filtered to rows with an integer amount (see refresh()),
// so none of the calls below can coerce a bad value into a string/NaN and no
// try/catch is needed: every section renders fully from clean data. Rows that
// failed that filter are passed separately, only to name them in the banner.
function renderSummary(txns, accounts, invalidTxns) {
  const totals = monthlyTotals(txns, state.month);
  renderBudget(txns);
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
  const total = balances.reduce((sum, b) => sum + b.balance, 0);

  // Same figure as the Balances "Total" row, shown in the Add header so the
  // running total is visible on the view you open the app to.
  const headBalance = document.getElementById('head-balance');
  headBalance.textContent = accounts.length ? fromCents(total) : '';
  headBalance.classList.toggle('amount--out', total < 0);

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
  const [txns, accounts, categories, split] = await Promise.all([
    db.allTransactions(), db.allAccounts(), db.allCategories(), db.getSetting('split', DEFAULT_SPLIT),
  ]);
  state.categories = categories;
  state.split = split;
  await fillDatalists();
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
    const known = new Set((await db.allAccounts()).map((a) => a.name));
    // ponytail: N separate putAccount calls, not one IndexedDB transaction —
    // a mid-loop crash could leave some accounts written. Transactions are
    // always written last and separately, which is what keeps the "no
    // transactions were changed" message above truthful.
    for (const account of accounts) {
      await db.putAccount(account.name, account.opening_balance);
      known.add(account.name);
    }
    // Zero-fill only ever creates accounts the file did not describe.
    for (const name of new Set(rows.map((r) => r.account))) {
      if (!known.has(name)) await db.putAccount(name, 0);
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
}

splitForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const split = Object.fromEntries(
    Object.entries(splitFields).map(([key, id]) => [key, Number(document.getElementById(id).value)]),
  );
  try {
    validateSplit(split);
  } catch (error) {
    splitStatus.style.color = 'var(--color-destructive)';
    splitStatus.textContent = error.message;
    return;
  }
  await db.putSetting('split', split);
  splitStatus.style.color = 'var(--color-accent)';
  splitStatus.textContent = 'Saved.';
  await refresh();
});

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
  const sorted = [...categories].sort(
    (a, b) => a.bucket.localeCompare(b.bucket) || a.name.localeCompare(b.name),
  );
  document.getElementById('category-list').replaceChildren(...sorted.map(({ name, bucket }) => {
    const item = document.createElement('li');
    item.className = 'row';
    const main = document.createElement('div');
    main.className = 'row__main';
    const title = document.createElement('span');
    title.className = 'row__title';
    title.textContent = name;
    const meta = document.createElement('span');
    meta.className = 'row__meta';
    meta.textContent = BUCKET_LABELS[bucket];
    main.append(title, meta);

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
      categoryStatus.style.color = '';
      categoryStatus.textContent = '';
      await refresh();
    });

    item.append(main, remove);
    return item;
  }));
}

document.getElementById('account-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = document.getElementById('account-name').value.trim();
  if (!name) return;
  await db.putAccount(name, toCents(document.getElementById('account-opening').value || 0));
  event.target.reset();
  document.getElementById('account-opening').value = '0';
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
    main.textContent = name;
    const value = document.createElement('span');
    value.className = 'amount';
    value.textContent = fromCents(opening_balance);

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

const themeSelect = document.getElementById('theme-select');
themeSelect.value = document.documentElement.dataset.theme === 'peach' ? 'peach' : 'graphite';
themeSelect.addEventListener('change', () => {
  const peach = themeSelect.value === 'peach';
  document.documentElement.dataset.theme = peach ? 'peach' : '';
  document.querySelector('meta[name="theme-color"]').content = peach ? '#F3CEC2' : '#0D0E10';
  localStorage.setItem('moneytrack-theme', peach ? 'peach' : 'graphite');
});

document.getElementById('add-date').value = new Date().toISOString().slice(0, 10);
syncKind();
await refresh();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    // Registration fails on file:// and on some private-mode profiles. The
    // app works without it; only offline caching is lost.
  });
}
