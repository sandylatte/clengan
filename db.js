import {
  DEFAULT_CATEGORIES, DEFAULT_INCOME_CATEGORIES, DEFAULT_SPLIT, DEFAULT_FUNDS,
  TRANSFER_CATEGORY,
} from './budget.js';

const DB_NAME = 'moneytrack';
const DB_VERSION = 6;

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
        // Seeded WITH a position, because the authored order of
        // DEFAULT_CATEGORIES is meaningful and the store keys on name, so
        // getAll would otherwise hand them back alphabetically and lose it.
        DEFAULT_CATEGORIES.forEach((category, index) => categories.add({ ...category, position: index }));
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
      if (event.oldVersion < 4) {
        // Income categories were free text until the Add form became a
        // select, at which point an unlisted category is unenterable. `put`
        // rather than `add` so a name the user already created by typing it
        // is adopted into the income bucket instead of colliding.
        const categories = request.transaction.objectStore('categories');
        for (const category of DEFAULT_INCOME_CATEGORIES) categories.put(category);
      }
      if (event.oldVersion >= 1 && event.oldVersion < 5) {
        migrateBucketsOntoRows(request.transaction);
      }
      if (event.oldVersion < 6) {
        stampPositions(request.transaction);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

// v5. Fixed and flexible stopped being a property of the category and became
// a property of the spend. Every existing row was bucketed THROUGH its
// category, so removing that link without doing anything else would blank the
// budget history: months already reconciled would report their whole spend as
// unbucketed.
//
// So the old category bucket is stamped onto the rows first, then the
// categories are rewritten to carry only expense-or-income. Every past row
// therefore lands exactly where it landed before, and no figure on any
// closed month moves.
//
// Both cursors run inside the versionchange transaction the caller passes in.
// If either fails the whole upgrade aborts and the database stays on v4 —
// there is no state where the rows are half-stamped and the categories have
// already forgotten what the buckets were.
// v6. Categories and accounts became orderable, so every record needs a
// position. Only records missing one are touched: a fresh database seeds its
// own positions from the authored order, and re-stamping those would replace
// a deliberate arrangement with an alphabetical one.
//
// The starting order is the one the lists were already displayed in, so
// turning ordering on changes nothing visible until the user moves something.
function stampPositions(transaction) {
  const assign = (storeName, compare) => {
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => {
      const rows = request.result;
      if (rows.every((row) => Number.isFinite(row.position))) return;
      [...rows].sort(compare).forEach((row, index) => {
        if (!Number.isFinite(row.position)) store.put({ ...row, position: index });
      });
    };
  };

  // Expenses before income, alphabetical inside each — exactly what
  // renderCategories was already sorting by.
  const kindRank = (row) => (row.kind === 'income' ? 1 : 0);
  assign('categories', (a, b) => kindRank(a) - kindRank(b) || a.name.localeCompare(b.name));
  assign('accounts', (a, b) => a.name.localeCompare(b.name));
}

function migrateBucketsOntoRows(transaction) {
  const categories = transaction.objectStore('categories');
  const oldBuckets = new Map();

  const walk = categories.openCursor();
  walk.onsuccess = () => {
    const cursor = walk.result;
    if (cursor) {
      const category = cursor.value;
      oldBuckets.set(category.name, category.bucket);
      // 'income' is the only bucket that was ever a kind. Everything else was
      // a spending bucket, which makes it an expense.
      cursor.update({ name: category.name, kind: category.bucket === 'income' ? 'income' : 'expense' });
      cursor.continue();
      return;
    }
    // The map is only complete once the cursor is exhausted, so the rows are
    // not touched until here.
    const rows = transaction.objectStore('transactions').openCursor();
    rows.onsuccess = () => {
      const rowCursor = rows.result;
      if (!rowCursor) return;
      const txn = rowCursor.value;
      const inherited = oldBuckets.get(txn.category);
      const needsBucket = txn.bucket !== 'fixed' && txn.bucket !== 'flexible';
      // Transfer halves and income rows are not charged to a bucket and must
      // not acquire one here.
      const chargeable = !txn.transfer_id && txn.amount < 0;
      if (needsBucket && chargeable && (inherited === 'fixed' || inherited === 'flexible')) {
        rowCursor.update({ ...txn, bucket: inherited });
      } else if (txn.bucket === undefined) {
        rowCursor.update({ ...txn, bucket: null });
      }
      rowCursor.continue();
    };
  };
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

// Merges rather than replaces. A plain put here would silently wipe a
// category's colour every time its kind changed, and its position every time
// it was recoloured — the fields are edited from three different controls
// and each one only knows about its own.
//
// A category that does not exist yet is appended, so a new one lands at the
// end of the list rather than jumping to wherever its name sorts.
// ONE getAll, and the existing record is found in its result.
//
// This previously issued store.get(name) AND store.getAll(), then read the
// getAll result inside the get callback. IndexedDB runs requests in the order
// they are made, so at that moment the getAll had not finished and reading
// .result threw InvalidStateError — which broke saving a category, saving an
// account, and loading the sample data.
export function putCategory(name, changes) {
  return run('categories', 'readwrite', (store) => {
    const all = store.getAll();
    all.onsuccess = () => {
      const rows = all.result;
      const current = rows.find((row) => row.name === name);
      if (current) {
        store.put({ ...current, ...changes, name });
        return;
      }
      store.put({ kind: 'expense', colour: null, ...changes, name, position: nextPosition(rows) });
    };
    return { value: undefined };
  });
}

// A new record goes to the end of the list rather than sorting itself into
// the middle by name.
function nextPosition(rows) {
  return rows.reduce(
    (max, row) => (Number.isFinite(row.position) ? Math.max(max, row.position) : max),
    -1,
  ) + 1;
}

// Writes the given order onto the named records. Names not present are
// skipped rather than created, so a list that raced with a delete cannot
// resurrect the deleted row.
function reorder(storeName, names) {
  return run(storeName, 'readwrite', (store) => {
    names.forEach((name, index) => {
      const request = store.get(name);
      request.onsuccess = () => {
        if (request.result) store.put({ ...request.result, position: index });
      };
    });
    return { value: undefined };
  });
}

export const reorderCategories = (names) => reorder('categories', names);
export const reorderAccounts = (names) => reorder('accounts', names);

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

// "bank" and "Bank" are distinct keys to IndexedDB and the same account to a
// reader, and one real account split across two of them is unrecoverable
// without editing rows by hand. The check lives here rather than on the form
// because accounts are also created by the Excel import and the planner
// import, and guarding only the form left both of those able to mint a
// casing variant.
// Pure, and exported so it can be tested. Everything else in this module
// needs a live IndexedDB, which node has none of; keeping the rule itself
// separate from the read means the rule is the part under test.
export function matchAccountName(accounts, name) {
  const wanted = String(name ?? '').trim().toLowerCase();
  if (wanted === '') return null;
  return accounts.find((a) => String(a.name).trim().toLowerCase() === wanted) ?? null;
}

export async function findAccount(name) {
  return matchAccountName(await allAccounts(), name);
}

// Refuses to create a second casing of an account that already exists.
// Returns the name actually written, which is the existing spelling when one
// was found, so callers file rows against a single account.
export async function ensureAccount(name, openingBalance = 0) {
  const existing = await findAccount(name);
  if (existing) return existing.name;
  await putAccount(name, openingBalance);
  return name;
}

// The unguarded write. Replacing an account's opening balance is a real
// operation, but it is destructive and silent, so every caller reaching for
// it has to have decided that on purpose — the Settings form confirms with
// the user first.
export function putAccount(name, openingBalance) {
  return run('accounts', 'readwrite', (store) => {
    const all = store.getAll();
    all.onsuccess = () => {
      const rows = all.result;
      const current = rows.find((row) => row.name === name);
      // Keep the position an existing account already has. Replacing its
      // opening balance is a deliberate act; sending it to the bottom of the
      // list at the same time is not.
      if (current) {
        store.put({ ...current, name, opening_balance: openingBalance });
        return;
      }
      store.put({ name, opening_balance: openingBalance, position: nextPosition(rows) });
    };
    return { value: undefined };
  });
}

// `bucket` is the row's own answer to fixed-or-flexible and overrides its
// category's. Null means "no answer here", which sends the row back to the
// category — the behaviour every row written before this field had.
export function addFlow({ date, account, amount, name = '', category = '', bucket = null, note }) {
  if (!Number.isInteger(amount)) throw new TypeError('amount must be integer cents');
  if (amount === 0) throw new RangeError('amount must not be zero');
  if (bucket !== null && bucket !== 'fixed' && bucket !== 'flexible') {
    throw new RangeError('bucket must be fixed, flexible, or null');
  }
  const id = crypto.randomUUID();
  return run('transactions', 'readwrite', (store) => {
    store.add({ id, date, account, amount, name, category, bucket, transfer_id: null, note });
    return { value: id };
  });
}

// Both rows are written inside one IndexedDB transaction. If either put
// fails the transaction aborts and neither row lands, so a transfer can
// never exist as a single orphaned half.
export function addTransfer({ date, from, to, amount, name = '', note }) {
  if (!Number.isInteger(amount)) throw new TypeError('amount must be integer cents');
  if (amount <= 0) throw new RangeError('transfer amount must be positive');
  if (from === to) throw new RangeError('cannot transfer to the same account');
  const fromId = crypto.randomUUID();
  const toId = crypto.randomUUID();
  return run('transactions', 'readwrite', (store) => {
    store.add({ id: fromId, date, account: from, amount: -amount, name, category: TRANSFER_CATEGORY, bucket: null, transfer_id: toId, note });
    store.add({ id: toId, date, account: to, amount, name, category: TRANSFER_CATEGORY, bucket: null, transfer_id: fromId, note });
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
        // Amount AND date cascade. Amount was always cascaded, because a pair
        // that stops netting to zero unbalances two accounts permanently.
        // Date was not, and editing became possible today — leaving one half
        // on the 10th and the other on the 12th, which shows the money
        // leaving one account a day before it arrives in the other.
        const sameAmount = txn.amount === existing.amount;
        const sameDate = txn.date === existing.date;
        if (sameAmount && sameDate) { store.put(txn); return; }
        const partnerRequest = store.get(existing.transfer_id);
        partnerRequest.onsuccess = () => {
          const partner = partnerRequest.result;
          if (!partner) { fail('transfer partner is missing'); return; }
          store.put(txn);
          store.put({ ...partner, amount: -txn.amount, date: txn.date });
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
