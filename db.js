const DB_NAME = 'moneytrack';
const DB_VERSION = 1;

let dbPromise = null;

export function openDb(name = DB_NAME) {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const txns = database.createObjectStore('transactions', { keyPath: 'id' });
      txns.createIndex('date', 'date');
      txns.createIndex('account', 'account');
      txns.createIndex('transfer_id', 'transfer_id');
      database.createObjectStore('accounts', { keyPath: 'name' });
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

export function updateTransaction(txn) {
  if (!Number.isInteger(txn.amount)) throw new TypeError('amount must be integer cents');
  return run('transactions', 'readwrite', (store) => {
    store.put(txn);
    return { value: undefined };
  });
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
