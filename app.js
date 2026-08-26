import * as db from './db.js';
import { toCents, formatAmount } from './money.js';
import { filterMonth } from './rollup.js';

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

function renderList(txns) {
  const rows = filterMonth(txns, state.month)
    .sort((a, b) => b.date.localeCompare(a.date));
  const list = document.getElementById('list-rows');
  document.getElementById('list-empty').hidden = rows.length > 0;

  list.replaceChildren(...rows.map((txn) => {
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

    const remove = document.createElement('button');
    remove.className = 'row__delete';
    remove.type = 'button';
    remove.innerHTML = TRASH_ICON;
    remove.setAttribute('aria-label', `Delete ${title.textContent} ${formatAmount(txn.amount)} on ${txn.date}`);
    remove.addEventListener('click', async () => {
      const isTransfer = Boolean(txn.transfer_id);
      const message = isTransfer
        ? 'Delete this transfer? Both sides will be removed.'
        : 'Delete this transaction?';
      if (!confirm(message)) return;
      await db.deleteTransaction(txn.id);
      await refresh();
    });

    item.append(main, amount, remove);
    return item;
  }));
}

async function refresh() {
  const txns = await db.allTransactions();
  await fillDatalists();
  renderList(txns);
}

document.getElementById('add-date').value = new Date().toISOString().slice(0, 10);
syncKind();
await refresh();
