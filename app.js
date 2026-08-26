import * as db from './db.js';
import { toCents } from './money.js';

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

async function refresh() {
  await fillDatalists();
}

document.getElementById('add-date').value = new Date().toISOString().slice(0, 10);
syncKind();
await refresh();
