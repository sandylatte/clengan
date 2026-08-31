import { DEFAULT_CATEGORIES, DEFAULT_SPLIT, DEFAULT_FUNDS } from './budget.js';

const DB_NAME = 'moneytrack';
const DB_VERSION = 3;

let dbPromise = null;

// name is only honoured on the very first call in the module's lifetime —
// dbPromise is memoised at module scope, so a later call with a different
// name silently returns the already-open database.
export function openDb(name = DB_NAME) {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DB_VERSION);
    // Each version's block falls through to the next, so a v1 database and a
    // fresh one both arrive at the same schema by the same path. Seeding
    // happens here because a versionchange transaction is the only point
    // where "the store is new" is knowable without a separate read.
    request.onupgradeneeded = (event) => {
      const database = request.result;
      if (event.oldVersion < 1) {
        const txns = database.createObjectStore('transactions', { keyPath: 'id' });
        txns.createIndex('date', 'date');
        txns.createIndex('account', 'account');
        txns.createIndex('transfer_id', 'transfer_id');
        database.createObjectStore('accounts', { keyPath: 'name' });
      }
      if (event.oldVersion < 2) {
        const categories = database.createObjectStore('categories', { keyPath: 'name' });
        for (const category of DEFAULT_CATEGORIES) categories.add(category);
        const settings = database.createObjectStore('settings', { keyPath: 'key' });
        settings.add({ key: 'split', value: DEFAULT_SPLIT });
      }
      if (event.oldVersion < 3) {
        // keyPath is the name, so getAll returns funds alphabetically and the
        // seed order below is not preserved. That is fine for a list of six,
        // and cheaper than an order field that has to stay in sync. A rename
        // is a delete plus an add, same as categories.
        const funds = database.createObjectStore('funds', { keyPath: 'name' });
        for (const fund of DEFAULT_FUNDS) funds.add(fund);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function run(store, mode, work) {
  return openDb().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(store, mode);
    const result = work(transaction.objectStore(store));
    transaction.oncomplete = () => resolve(result.value);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  }));
}

function readAll(store) {
  return run(store, 'readonly', (objectStore) => {
    const result = { value: [] };
    const request = objectStore.getAll();
    request.onsuccess = () => { result.value = request.result; };
    return result;
  });
}

export const allTransactions = () => readAll('transactions');
export const allAccounts = () => readAll('accounts');
export const allCategories = () => readAll('categories');
export const allFunds = () => readAll('funds');

export function putFund(name, percent) {
  return run('funds', 'readwrite', (store) => {
    store.put({ name, percent });
    return { value: undefined };
  });
}

export function deleteFund(name) {
  return run('funds', 'readwrite', (store) => {
    store.delete(name);
    return { value: undefined };
  });
}

export function putCategory(name, bucket) {
  return run('categories', 'readwrite', (store) => {
    store.put({ name, bucket });
    return { value: undefined };
  });
}

// Deleting a category leaves its past rows alone. They keep the name they
// were filed under and surface as `unbucketed` in the budget, which is the
// honest reading: the money was spent, we just no longer classify it.
export function deleteCategory(name) {
  return run('categories', 'readwrite', (store) => {
    store.delete(name);
    return { value: undefined };
  });
}

export function getSetting(key, fallback) {
  return run('settings', 'readonly', (store) => {
    const result = { value: fallback };
    const request = store.get(key);
    request.onsuccess = () => { if (request.result) result.value = request.result.value; };
    return result;
  });
}

export function putSetting(key, value) {
  return run('settings', 'readwrite', (store) => {
    store.put({ key, value });
    return { value: undefined };
  });
}

export function putAccount(name, openingBalance) {
  return run('accounts', 'readwrite', (store) => {
    store.put({ name, opening_balance: openingBalance });
    return { value: undefined };
  });
}

export function addFlow({ date, account, amount, category, note }) {
  if (!Number.isInteger(amount)) throw new TypeError('amount must be integer cents');
  if (amount === 0) throw new RangeError('amount must not be zero');
  const id = crypto.randomUUID();
  return run('transactions', 'readwrite', (store) => {
    store.add({ id, date, account, amount, category, transfer_id: null, note });
    return { value: id };
  });
}

// Both rows are written inside one IndexedDB transaction. If either put
// fails the transaction aborts and neither row lands, so a transfer can
// never exist as a single orphaned half.
export function addTransfer({ date, from, to, amount, note }) {
  if (!Number.isInteger(amount)) throw new TypeError('amount must be integer cents');
  if (amount <= 0) throw new RangeError('transfer amount must be positive');
  if (from === to) throw new RangeError('cannot transfer to the same account');
  const fromId = crypto.randomUUID();
  const toId = crypto.randomUUID();
  return run('transactions', 'readwrite', (store) => {
    store.add({ id: fromId, date, account: from, amount: -amount, category: 'Transfer', transfer_id: toId, note });
    store.add({ id: toId, date, account: to, amount, category: 'Transfer', transfer_id: fromId, note });
    return { value: [fromId, toId] };
  });
}

// Enforces the transfer-pair invariant on edits: a transfer half cannot be
// detached from its partner (transfer_id changed/cleared), a plain flow
// cannot be promoted into a transfer half, and an amount edit on one half
// cascades to the partner so the pair keeps summing to zero.
export function updateTransaction(txn) {
  if (!Number.isInteger(txn.amount)) throw new TypeError('amount must be integer cents');
  return openDb().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction('transactions', 'readwrite');
    const store = transaction.objectStore('transactions');
    let failure = null;
    const fail = (message) => { failure = new Error(message); transaction.abort(); };

    const request = store.get(txn.id);
    request.onsuccess = () => {
      const existing = request.result;
      if (!existing) { store.put(txn); return; }

      if (existing.transfer_id) {
        if (txn.transfer_id !== existing.transfer_id) {
          fail('cannot change or clear transfer_id on a transfer half');
          return;
        }
        if (txn.amount === existing.amount) { store.put(txn); return; }
        const partnerRequest = store.get(existing.transfer_id);
        partnerRequest.onsuccess = () => {
          const partner = partnerRequest.result;
          if (!partner) { fail('transfer partner is missing'); return; }
          store.put(txn);
          store.put({ ...partner, amount: -txn.amount });
        };
      } else {
        if (txn.transfer_id) {
          fail('cannot promote a flow into a transfer half via update');
          return;
        }
        store.put(txn);
      }
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(failure || transaction.error);
    transaction.onabort = () => reject(failure || transaction.error);
  }));
}

// Deleting either side of a transfer deletes both. Leaving one half behind
// would unbalance the two accounts against each other permanently.
export function deleteTransaction(id) {
  return run('transactions', 'readwrite', (store) => {
    const request = store.get(id);
    request.onsuccess = () => {
      const txn = request.result;
      if (!txn) return;
      store.delete(id);
      if (txn.transfer_id) store.delete(txn.transfer_id);
    };
    return { value: undefined };
  });
}

export function putTransactions(txns) {
  return run('transactions', 'readwrite', (store) => {
    for (const txn of txns) store.put(txn);
    return { value: undefined };
  });
}

export function clearAll() {
  return openDb().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(['transactions', 'accounts'], 'readwrite');
    transaction.objectStore('transactions').clear();
    transaction.objectStore('accounts').clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  }));
}
