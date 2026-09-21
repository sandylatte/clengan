import {
  DEFAULT_CATEGORIES, DEFAULT_INCOME_CATEGORIES, DEFAULT_SPLIT, DEFAULT_FUNDS,
  TRANSFER_CATEGORY,
} from './budget.js';

// Deliberately still 'moneytrack' after the app was renamed to Clengan. This
// string is the key to every transaction already on the device: change it and
// a user's ledger is not migrated, it is simply no longer found. The name is
// internal and nobody sees it, so there is nothing to gain by touching it.
const DB_NAME = 'moneytrack';
const DB_VERSION = 8;

// On disk a transaction references its account by `account_id`, a UUID that
// never changes. In memory every row above this module carries `account`, the
// account's current NAME, because that is what the List shows, what the search
// box matches, what the Excel column holds and what the editor's select is
// populated with.
//
// The translation happens here and only here. That is the whole point of v8:
// renaming an account used to rewrite every transaction row, because the name
// WAS the reference. Now it rewrites one row and every reader sees the new
// name on its next read, for free.
//
// On a write the NAME wins. A row handed back from the editor carries a stale
// `account_id` alongside the account the user just picked, so the id is
// re-derived from the name rather than trusted.

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
      if (event.oldVersion < 7) {
        // Seeded empty. A recurring rule describes a commitment only the user
        // knows about, so guessing one — even a plausible "Rent" — would put a
        // payment they never agreed to in front of them to approve.
        database.createObjectStore('recurring', { keyPath: 'id' });
      }
      // No `oldVersion >= 1` guard, unlike the v5 data migration above. This
      // one changes the SHAPE of the store, so a fresh database needs it as
      // much as an upgraded one — and running it on an empty store costs
      // nothing while keeping every database on one path to the same schema.
      if (event.oldVersion < 8) {
        giveAccountsIds(database, request.transaction);
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

// v8. Accounts were keyed by name and every transaction referenced that name
// as a string, so there was no identity underneath a rename — `renameAccount`
// had to rewrite every row across three stores to keep the ledger consistent.
//
// A keyPath cannot be altered in place, so the store is read, dropped and
// rebuilt on `id` inside the same versionchange transaction. If any step
// throws, the whole upgrade aborts and the database stays on v7: there is no
// state where the accounts have ids and the rows still point at names.
//
// A row naming an account that has no record gets one minted for it rather
// than a null id. Orphans should not exist — the Add form picks from a select
// and both importers go through ensureAccount — but a hand-edited Excel file
// can produce one, and nulling it would drop real money out of every
// per-account total with nothing on screen to say so.
function giveAccountsIds(database, transaction) {
  const request = transaction.objectStore('accounts').getAll();
  request.onsuccess = () => {
    const rows = request.result;

    database.deleteObjectStore('accounts');
    const accounts = database.createObjectStore('accounts', { keyPath: 'id' });
    // Names stay unique, now as an index rather than as the key. The
    // case-insensitive rule in matchAccountName still sits above this; the
    // index only catches an exact duplicate.
    accounts.createIndex('name', 'name', { unique: true });

    const idByName = new Map();
    for (const row of rows) {
      const id = crypto.randomUUID();
      idByName.set(row.name, id);
      accounts.put({ ...row, id });
    }

    const txns = transaction.objectStore('transactions');
    txns.deleteIndex('account');
    txns.createIndex('account_id', 'account_id');

    const cursor = txns.openCursor();
    cursor.onsuccess = () => {
      const at = cursor.result;
      if (!at) return;
      const { account, ...rest } = at.value;
      let id = idByName.get(account);
      if (id === undefined) {
        id = crypto.randomUUID();
        idByName.set(account, id);
        accounts.put({ name: account, opening_balance: 0, position: idByName.size - 1, id });
      }
      at.update({ ...rest, account_id: id });
      at.continue();
    };
  };
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

// Hydrated: every row comes back carrying `account`, the account's current
// name, alongside the `account_id` it is actually stored under. See the note
// at the top of the file — the rest of the app works in names.
export async function allTransactions() {
  const [rows, accounts] = await Promise.all([readAll('transactions'), readAll('accounts')]);
  const nameById = new Map(accounts.map((account) => [account.id, account.name]));
  return rows.map((row) => ({ ...row, account: nameById.get(row.account_id) ?? '' }));
}

export const allAccounts = () => readAll('accounts');
export const allCategories = () => readAll('categories');
export const allFunds = () => readAll('funds');
export const allRecurring = () => readAll('recurring');

export function putRecurring(rule) {
  return run('recurring', 'readwrite', (store) => {
    store.put(rule);
    return { value: undefined };
  });
}

export function deleteRecurring(id) {
  return run('recurring', 'readwrite', (store) => {
    store.delete(id);
    return { value: undefined };
  });
}

// Stamped only after the rows are safely written. Doing it in the same call
// that files them would mean a failure between the two silently swallowing an
// occurrence — the rule would believe the month was handled and never offer
// it again, and the payment would be missing with nothing to say so.
//
// Each rule is stamped with the month of ITS last filed occurrence, never with
// a shared "now". A rule for the 25th, caught up on the 3rd, has been filed
// only as far as last month; stamping it with this month would skip the 25th
// silently.
export function markRecurringRun(stamps) {
  return run('recurring', 'readwrite', (store) => {
    for (const [id, month] of stamps) {
      const request = store.get(id);
      request.onsuccess = () => {
        const rule = request.result;
        if (rule) store.put({ ...rule, last_run: month });
      };
    }
    return { value: undefined };
  });
}

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

// Accounts cannot use `reorder` any more: it does store.get(name), and since
// v8 the key is the id. The list the UI hands back is still names, because
// that is what it displays.
export function reorderAccounts(names) {
  return run('accounts', 'readwrite', (store) => {
    const all = store.getAll();
    all.onsuccess = () => {
      const rows = all.result;
      names.forEach((name, index) => {
        const current = rows.find((row) => row.name === name);
        if (current) store.put({ ...current, position: index });
      });
    };
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

// Every write path resolves the name the caller gave into the id the row is
// stored under. Refusing an unknown name rather than writing a null id is
// deliberate: a row filed under no account is money that disappears from every
// per-account total. Both importers call ensureAccount first, so the name is
// already real by the time it reaches here.
async function idForAccount(name) {
  const account = await findAccount(name);
  if (!account) throw new Error(`there is no account named "${name}"`);
  return account.id;
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

// One row, since v8. The account's id is the reference and it does not change,
// so no transaction is touched and nothing has to be kept consistent across
// stores — which is what the whole v8 migration bought.
//
// The default-account setting still stores a name, because it is written into
// the Excel settings sheet where a UUID would mean nothing to a reader and it
// is compared against the values of a select built from names. That is one
// more row in the same transaction, not a walk over the ledger.
export function renameAccount(from, to) {
  const wanted = String(to ?? '').trim();
  if (!wanted) return Promise.reject(new RangeError('an account needs a name'));

  return openDb().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(['accounts', 'settings'], 'readwrite');
    const accounts = transaction.objectStore('accounts');
    let failure = null;
    const fail = (message) => { failure = new Error(message); transaction.abort(); };

    const all = accounts.getAll();
    all.onsuccess = () => {
      const rows = all.result;
      const current = rows.find((row) => row.name === from);
      if (!current) { fail(`there is no account named "${from}"`); return; }

      // Same rule as creating one: two accounts differing only in casing are
      // one account to a reader and unrecoverable once rows are split.
      const clash = matchAccountName(rows.filter((row) => row.id !== current.id), wanted);
      if (clash) { fail(`"${clash.name}" already exists`); return; }
      if (wanted === from) { resolve(); return; }

      // Keyed by id now, so this is a put over the same record rather than a
      // delete plus an add. Position and opening balance ride along untouched.
      accounts.put({ ...current, name: wanted });

      const settings = transaction.objectStore('settings');
      const preference = settings.get('default-account');
      preference.onsuccess = () => {
        if (preference.result && preference.result.value === from) {
          settings.put({ key: 'default-account', value: wanted });
        }
      };
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(failure || transaction.error);
    transaction.onabort = () => reject(failure || transaction.error);
  }));
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
      store.put({ id: crypto.randomUUID(), name, opening_balance: openingBalance, position: nextPosition(rows) });
    };
    return { value: undefined };
  });
}

// `bucket` is the row's own answer to fixed-or-flexible and overrides its
// category's. Null means "no answer here", which sends the row back to the
// category — the behaviour every row written before this field had.
export async function addFlow({ date, account, amount, name = '', category = '', bucket = null, note }) {
  if (!Number.isInteger(amount)) throw new TypeError('amount must be integer cents');
  if (amount === 0) throw new RangeError('amount must not be zero');
  if (bucket !== null && bucket !== 'fixed' && bucket !== 'flexible') {
    throw new RangeError('bucket must be fixed, flexible, or null');
  }
  const accountId = await idForAccount(account);
  const id = crypto.randomUUID();
  return run('transactions', 'readwrite', (store) => {
    store.add({ id, date, account_id: accountId, amount, name, category, bucket, transfer_id: null, note });
    return { value: id };
  });
}

// Both rows are written inside one IndexedDB transaction. If either put
// fails the transaction aborts and neither row lands, so a transfer can
// never exist as a single orphaned half.
export async function addTransfer({ date, from, to, amount, name = '', note }) {
  if (!Number.isInteger(amount)) throw new TypeError('amount must be integer cents');
  if (amount <= 0) throw new RangeError('transfer amount must be positive');
  if (from === to) throw new RangeError('cannot transfer to the same account');
  const [fromAccount, toAccount] = await Promise.all([idForAccount(from), idForAccount(to)]);
  // Resolved names can collide where the raw strings did not: "bank" and
  // "Bank" are one account, and a transfer from an account to itself is not a
  // transfer, it is two rows that unbalance nothing and mean nothing.
  if (fromAccount === toAccount) throw new RangeError('cannot transfer to the same account');
  const fromId = crypto.randomUUID();
  const toId = crypto.randomUUID();
  return run('transactions', 'readwrite', (store) => {
    store.add({ id: fromId, date, account_id: fromAccount, amount: -amount, name, category: TRANSFER_CATEGORY, bucket: null, transfer_id: toId, note });
    store.add({ id: toId, date, account_id: toAccount, amount, name, category: TRANSFER_CATEGORY, bucket: null, transfer_id: fromId, note });
    return { value: [fromId, toId] };
  });
}

// Enforces the transfer-pair invariant on edits: a transfer half cannot be
// detached from its partner (transfer_id changed/cleared), a plain flow
// cannot be promoted into a transfer half, and an amount edit on one half
// cascades to the partner so the pair keeps summing to zero.
export async function updateTransaction(row) {
  if (!Number.isInteger(row.amount)) throw new TypeError('amount must be integer cents');
  // The row came from allTransactions and then through the editor, so its
  // `account` is whatever the user just picked and its `account_id` is what it
  // was before. The name is the one the user chose, so the name wins.
  const { account, ...rest } = row;
  const txn = account === undefined
    ? rest
    : { ...rest, account_id: await idForAccount(account) };
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

// Bulk, so the account list is read once rather than once per row — an import
// is thousands of rows and findAccount reads every account each time.
export async function putTransactions(txns) {
  const accounts = await allAccounts();
  const rows = txns.map((txn) => {
    if (txn.account === undefined) return txn;
    const { account, ...rest } = txn;
    const found = matchAccountName(accounts, account);
    if (!found) throw new Error(`there is no account named "${account}"`);
    return { ...rest, account_id: found.id };
  });
  return run('transactions', 'readwrite', (store) => {
    for (const row of rows) store.put(row);
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
