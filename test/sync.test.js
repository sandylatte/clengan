import test from 'node:test';
import assert from 'node:assert/strict';
import {
  syncId, storeOf, deriveIdKey, canonical, hashRecord, snapshot, outbox, plan, runSync,
} from '../sync.js';
import { KDFS, createIdentity, unlock, decryptRecord } from '../vault.js';

KDFS['test-cheap'] = { name: 'PBKDF2', hash: 'SHA-256', iterations: 1 };

const KEY_PATHS = { transactions: 'id', accounts: 'id', settings: 'key' };

async function dekFor(password = 'pw') {
  const { identity } = await createIdentity(password, 'test-cheap');
  return unlock(password, identity);
}

/** An in-memory stand-in for db.js, so the engine is tested without IndexedDB. */
function fakeIo(initial = {}) {
  const stores = { transactions: [], accounts: [], settings: [], ...initial };
  const meta = {};
  return {
    stores,
    meta,
    readAll: async () => JSON.parse(JSON.stringify(stores)),
    write: async (store, record) => {
      const keyPath = KEY_PATHS[store];
      const at = stores[store].findIndex((r) => r[keyPath] === record[keyPath]);
      if (at >= 0) stores[store][at] = record;
      else stores[store].push(record);
    },
    remove: async (store, key) => {
      const keyPath = KEY_PATHS[store];
      stores[store] = stores[store].filter((r) => String(r[keyPath]) !== String(key));
    },
    getMeta: async (key, fallback) => (key in meta ? meta[key] : fallback),
    setMeta: async (key, value) => { meta[key] = value; },
  };
}

/** A server that records what it was given. */
function fakeTransport() {
  const held = new Map();
  let seq = 0;
  return {
    pushes: [],
    async push(records) {
      this.pushes.push(records);
      for (const record of records) {
        seq += 1;
        held.set(record.id, { ...record, seq });
      }
      return { seq };
    },
    async pull(since) {
      const records = [...held.values()].filter((r) => r.seq > Number(since))
        .sort((a, b) => a.seq - b.seq);
      return { records, seq: records.length ? records[records.length - 1].seq : Number(since) };
    },
    held,
    inject(record) { seq += 1; held.set(record.id, { ...record, seq }); },
  };
}

test('a sync id names its store and hides its key', async () => {
  const idKey = await deriveIdKey(await dekFor());
  const id = await syncId(idKey, 'categories', 'Groceries');
  assert.equal(storeOf(id), 'categories');
  assert.ok(!id.includes('Groceries'), 'the key must not be readable in the address');
  assert.match(id, /^categories:[0-9a-f]{32}$/);
  assert.equal(storeOf('nocolon'), null);
});

test('a sync id is stable for one account and different across accounts', async () => {
  const mine = await deriveIdKey(await dekFor('one'));
  const theirs = await deriveIdKey(await dekFor('two'));
  const a = await syncId(mine, 'categories', 'Groceries');
  const b = await syncId(mine, 'categories', 'Groceries');
  const other = await syncId(theirs, 'categories', 'Groceries');
  assert.equal(a, b, 'the same record must address the same way every sync');
  assert.notEqual(a, other, 'two users must not share an address for the same name');
});

// The leak this replaced: category, fund and setting keys ARE their names, and
// a plain `store:key` address put them on the wire in clear text.
test('a name-keyed record does not leak its name to the transport', async () => {
  const io = fakeIo({ settings: [{ key: 'default-account', value: 'Bank BCA' }] });
  const transport = fakeTransport();
  await runSync({ io, transport, dek: await dekFor(), keyPaths: KEY_PATHS });
  const wire = JSON.stringify(transport.pushes);
  assert.ok(!wire.includes('default-account'), 'the key travelled in the clear');
  assert.ok(!wire.includes('Bank BCA'));
});

test('canonical form ignores key order but not values', () => {
  assert.equal(canonical({ a: 1, b: 2 }), canonical({ b: 2, a: 1 }));
  assert.notEqual(canonical({ a: 1 }), canonical({ a: 2 }));
  assert.notEqual(canonical({ a: 1 }), canonical({ a: '1' }), 'a number is not its string');
  assert.notEqual(canonical([1, 2]), canonical([2, 1]), 'array order is meaningful');
});

test('a reordered record hashes the same, an edited one does not', async () => {
  const a = await hashRecord({ id: 'x', amount: -100, note: 'kopi' });
  const b = await hashRecord({ note: 'kopi', id: 'x', amount: -100 });
  const c = await hashRecord({ id: 'x', amount: -101, note: 'kopi' });
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('the outbox is everything new or changed', async () => {
  const k = await deriveIdKey(await dekFor());
  const current = await snapshot({ transactions: [{ id: 'a', v: 1 }, { id: 'b', v: 1 }] }, KEY_PATHS, k);
  const baseline = await snapshot({ transactions: [{ id: 'a', v: 1 }] }, KEY_PATHS, k);
  const { changed, deleted } = outbox(current, baseline);
  assert.deepEqual(changed, [await syncId(k, 'transactions', 'b')]);
  assert.deepEqual(deleted, []);
});

test('an edit is detected, an untouched record is not re-pushed', async () => {
  const k = await deriveIdKey(await dekFor());
  const baseline = await snapshot({ transactions: [{ id: 'a', v: 1 }, { id: 'b', v: 1 }] }, KEY_PATHS, k);
  const current = await snapshot({ transactions: [{ id: 'a', v: 2 }, { id: 'b', v: 1 }] }, KEY_PATHS, k);
  assert.deepEqual(outbox(current, baseline).changed, [await syncId(k, 'transactions', 'a')]);
});

test('a record that disappeared locally becomes a tombstone', async () => {
  const k = await deriveIdKey(await dekFor());
  const baseline = await snapshot({ transactions: [{ id: 'a', v: 1 }, { id: 'b', v: 1 }] }, KEY_PATHS, k);
  const current = await snapshot({ transactions: [{ id: 'a', v: 1 }] }, KEY_PATHS, k);
  assert.deepEqual(outbox(current, baseline).deleted, [await syncId(k, 'transactions', 'b')]);
});

test('a tombstone for something we never had is ignored, not stored', () => {
  const { writes, tombstones } = plan(
    [{ id: 'transactions:ghost', deleted: true }],
    new Set(['transactions:aaaa']),
  );
  assert.deepEqual(writes, []);
  assert.deepEqual(tombstones, [], 'a grave must not be dug on a device that never had the row');
});

test('a tombstone for something we do have is kept for decryption', () => {
  const { tombstones } = plan(
    [{ id: 'transactions:aaaa', deleted: true }], new Set(['transactions:aaaa']),
  );
  assert.deepEqual(tombstones.map((t) => t.store), ['transactions']);
});

// -- the whole run -----------------------------------------------------------

test('a first sync pushes everything and pulls it back without duplicating', async () => {
  const io = fakeIo({ transactions: [{ id: 'a', amount: -100 }, { id: 'b', amount: 200 }] });
  const transport = fakeTransport();
  const result = await runSync({ io, transport, dek: await dekFor(), keyPaths: KEY_PATHS });

  assert.equal(result.pushed, 2);
  assert.equal(io.stores.transactions.length, 2, 'a pull of our own push must not duplicate rows');
  assert.deepEqual(io.stores.transactions.map((r) => r.id).sort(), ['a', 'b']);
});

test('a second sync with no changes pushes nothing', async () => {
  const io = fakeIo({ transactions: [{ id: 'a', amount: -100 }] });
  const transport = fakeTransport();
  const dek = await dekFor();
  await runSync({ io, transport, dek, keyPaths: KEY_PATHS });
  const second = await runSync({ io, transport, dek, keyPaths: KEY_PATHS });
  assert.equal(second.pushed, 0, 'the baseline must absorb what the pull just wrote');
  assert.equal(second.tombstoned, 0);
});

test('what reaches the transport is ciphertext, not the row', async () => {
  const io = fakeIo({ transactions: [{ id: 'a', amount: -125000, note: 'kopi' }] });
  const transport = fakeTransport();
  await runSync({ io, transport, dek: await dekFor(), keyPaths: KEY_PATHS });
  const wire = JSON.stringify(transport.pushes);
  assert.ok(!wire.includes('kopi'));
  assert.ok(!wire.includes('125000'));
  assert.ok(/transactions:[0-9a-f]{32}/.test(wire), 'the store is addressable, the key is not');
});

test('an edit made after a sync is the only thing the next one sends', async () => {
  const io = fakeIo({ transactions: [{ id: 'a', v: 1 }, { id: 'b', v: 1 }] });
  const transport = fakeTransport();
  const dek = await dekFor();
  await runSync({ io, transport, dek, keyPaths: KEY_PATHS });

  io.stores.transactions[0].v = 2;
  const second = await runSync({ io, transport, dek, keyPaths: KEY_PATHS });
  assert.equal(second.pushed, 1);
  assert.equal(transport.pushes[1].length, 1);
  assert.equal(storeOf(transport.pushes[1][0].id), 'transactions');
});

test('deleting locally sends a tombstone and does not resurrect on the pull', async () => {
  const io = fakeIo({ transactions: [{ id: 'a', v: 1 }, { id: 'b', v: 1 }] });
  const transport = fakeTransport();
  const dek = await dekFor();
  await runSync({ io, transport, dek, keyPaths: KEY_PATHS });

  io.stores.transactions = io.stores.transactions.filter((r) => r.id !== 'b');
  const second = await runSync({ io, transport, dek, keyPaths: KEY_PATHS });

  assert.equal(second.tombstoned, 1);
  assert.deepEqual(io.stores.transactions.map((r) => r.id), ['a'],
    'the pull must not bring the deleted row back');
});

test('a second device receives what the first one pushed', async () => {
  const transport = fakeTransport();
  const dek = await dekFor();

  const first = fakeIo({ transactions: [{ id: 'a', amount: -100, note: 'kopi' }] });
  await runSync({ io: first, transport, dek, keyPaths: KEY_PATHS });

  const second = fakeIo();
  const result = await runSync({ io: second, transport, dek, keyPaths: KEY_PATHS });

  assert.equal(result.applied, 1);
  assert.deepEqual(second.stores.transactions, [{ id: 'a', amount: -100, note: 'kopi' }]);
});

test('a delete on one device removes the row on the other', async () => {
  const transport = fakeTransport();
  const dek = await dekFor();
  const first = fakeIo({ transactions: [{ id: 'a', v: 1 }, { id: 'b', v: 1 }] });
  const second = fakeIo();

  await runSync({ io: first, transport, dek, keyPaths: KEY_PATHS });
  await runSync({ io: second, transport, dek, keyPaths: KEY_PATHS });
  assert.equal(second.stores.transactions.length, 2);

  first.stores.transactions = first.stores.transactions.filter((r) => r.id !== 'b');
  await runSync({ io: first, transport, dek, keyPaths: KEY_PATHS });
  await runSync({ io: second, transport, dek, keyPaths: KEY_PATHS });

  assert.deepEqual(second.stores.transactions.map((r) => r.id), ['a']);
});

test('every syncable store round-trips, not just transactions', async () => {
  const transport = fakeTransport();
  const dek = await dekFor();
  const first = fakeIo({
    transactions: [{ id: 't1', amount: -1 }],
    accounts: [{ id: 'acc-1', name: 'Bank BCA', opening_balance: 500 }],
    settings: [{ key: 'default-account', value: 'Bank BCA' }],
  });
  await runSync({ io: first, transport, dek, keyPaths: KEY_PATHS });

  const second = fakeIo();
  await runSync({ io: second, transport, dek, keyPaths: KEY_PATHS });

  assert.deepEqual(second.stores.accounts, [{ id: 'acc-1', name: 'Bank BCA', opening_balance: 500 }]);
  assert.deepEqual(second.stores.settings, [{ key: 'default-account', value: 'Bank BCA' }]);
});

test('a record from a store this version does not know is skipped, not crashed on', async () => {
  const transport = fakeTransport();
  const dek = await dekFor();
  const io = fakeIo();
  const blob = await (await import('../vault.js')).encryptRecord(dek, 'fromthefuture:abcd', { x: 1 });
  transport.inject({ ...blob, updatedAt: Date.now() });

  const result = await runSync({ io, transport, dek, keyPaths: KEY_PATHS });
  assert.equal(result.applied, 0);
});

test('the cursor advances so the next pull is not the whole history again', async () => {
  const io = fakeIo({ transactions: [{ id: 'a', v: 1 }] });
  const transport = fakeTransport();
  const dek = await dekFor();
  const first = await runSync({ io, transport, dek, keyPaths: KEY_PATHS });
  assert.ok(first.cursor > 0);
  const second = await runSync({ io, transport, dek, keyPaths: KEY_PATHS });
  assert.equal(second.applied, 0, 'nothing new should come back');
});

test('the pushed blob decrypts to exactly the record that went in', async () => {
  const row = { id: 'a', date: '2026-09-22', amount: -125000, bucket: 'flexible', note: 'kopi' };
  const io = fakeIo({ transactions: [row] });
  const transport = fakeTransport();
  const dek = await dekFor();
  await runSync({ io, transport, dek, keyPaths: KEY_PATHS });
  const id = await syncId(await deriveIdKey(dek), 'transactions', 'a');
  const blob = transport.held.get(id);
  assert.deepEqual(await decryptRecord(dek, id, blob), row);
});
