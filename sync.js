// The sync engine. Step 4 of ARCHITECTURE-SYNC.md.
//
// The outbox is DERIVED, not maintained. Every sync reads the local stores,
// hashes each record, and compares against the hashes from last time: changed
// or new goes up, present-then-missing becomes a tombstone.
//
// The alternative was hooking every write path in db.js to append to a queue.
// There are about fifteen of them and some open their own transaction, so one
// missed hook means a record that lives on one device forever with nothing on
// screen to say so. A derived outbox cannot miss a write path because it does
// not know write paths exist. The cost is reading the ledger on each sync,
// which is what the Summary already does on every repaint.
//
// Push happens before pull, always. The server resolves last-write-wins as it
// accepts a push, so pushing first means the pull that follows brings back the
// merged truth rather than clobbering local edits that never left.

import { encryptRecord, decryptRecord } from './vault.js';
import {
  SYNCABLE, readStoreRaw, putRaw, deleteRaw, getSyncMeta, putSyncMeta, clearSyncMeta,
} from './db.js';
import {
  createIdentity, authVerifierFor, unlock, unlockWithRecoveryCode,
} from './vault.js';

const utf8 = new TextEncoder();

// -- pure core ---------------------------------------------------------------
// Everything below this line to the transport section is deterministic and
// tested under plain node.

/**
 * A record's address on the server: the store name, and the record's key put
 * through an HMAC under a key derived from the DEK.
 *
 * The key cannot travel in the clear. The server needs SOMETHING stable to
 * address a record by, and the first version of this used `store:key`
 * directly — which is fine for transactions and accounts, keyed by UUIDs that
 * mean nothing, and a genuine leak for categories, funds and settings, which
 * are keyed by NAME. A category list is a sketch of someone's private life and
 * it was arriving at the server in plain text.
 *
 * HMAC rather than a plain hash so the mapping is not enumerable: names come
 * from a small, guessable space, and SHA-256("Groceries") is the same value for
 * everyone. Under a per-account key the server sees an opaque token it cannot
 * reverse or compare across users.
 *
 * The store name is still visible, and that is intended — it is structural
 * metadata, not the user's.
 */
export async function deriveIdKey(dek) {
  const raw = await globalThis.crypto.subtle.exportKey('raw', dek);
  const material = await globalThis.crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveBits']);
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(16), info: utf8.encode('clengan/syncid/v1') },
    material,
    256,
  );
  return globalThis.crypto.subtle.importKey(
    'raw', bits, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
}

export async function syncId(idKey, store, key) {
  const mac = await globalThis.crypto.subtle.sign('HMAC', idKey, utf8.encode(`${store}:${key}`));
  const hex = [...new Uint8Array(mac)].slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${store}:${hex}`;
}

/** Only the store survives the trip. The key is recovered from the ciphertext. */
export function storeOf(id) {
  const at = String(id).indexOf(':');
  return at < 1 ? null : id.slice(0, at);
}

// Stable across key order, because IndexedDB hands records back with whatever
// property order they were written in and a reordered object is not an edit.
// Numbers and strings are distinguished so 1 and "1" do not collide.
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}

export async function hashRecord(value) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', utf8.encode(canonical(value)));
  return [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Hash every local record. `stores` is {name: [records]}, `keyPaths` is {name: field}. */
/**
 * {syncId: {hash, store, key}} for every local record.
 *
 * The store and key are kept beside the hash, not for comparison but for
 * deletion: a record that has been deleted locally is by definition no longer
 * in the database to look up, and the sync id is an HMAC that cannot be
 * reversed. The snapshot is the only remaining record of what the grave is for.
 */
export async function snapshot(stores, keyPaths, idKey) {
  const out = {};
  for (const [store, records] of Object.entries(stores)) {
    const keyPath = keyPaths[store];
    for (const record of records) {
      const key = record[keyPath];
      out[await syncId(idKey, store, key)] = { hash: await hashRecord(record), store, key };
    }
  }
  return out;
}

/**
 * What to push. `baseline` is the snapshot as of the last successful sync.
 *
 * A record missing from `current` but present in `baseline` was deleted here,
 * and becomes a tombstone rather than simply vanishing: a hard delete lets a
 * device that was offline at the time push the row straight back on its next
 * sync.
 */
export function outbox(current, baseline) {
  const changed = [];
  const deleted = [];
  for (const [id, entry] of Object.entries(current)) {
    if (baseline[id]?.hash !== entry.hash) changed.push(id);
  }
  for (const id of Object.keys(baseline)) {
    if (!(id in current)) deleted.push(id);
  }
  return { changed, deleted };
}

/**
 * What a pull means for the local database.
 *
 * Anything the server sends wins: it is the merge point, and this runs after
 * our own push, so its version already accounts for what we sent. A record we
 * have never seen and that arrives as a tombstone is dropped rather than
 * written — there is nothing here to delete and storing it would resurrect a
 * grave on every device that ever syncs.
 */
export function plan(records, localIds) {
  const writes = [];
  const tombstones = [];
  for (const record of records) {
    const store = storeOf(record.id);
    if (!store) continue;
    if (record.deleted) {
      // Only if we actually hold it. Otherwise this is a grave being dug on a
      // device that never had the row, and every device that ever syncs would
      // keep one.
      if (localIds.has(record.id)) tombstones.push({ store, id: record.id, blob: record });
      continue;
    }
    writes.push({ store, id: record.id, blob: record });
  }
  return { writes, tombstones };
}

// -- transport ---------------------------------------------------------------

export class Transport {
  constructor(base, token = null) {
    this.base = String(base).replace(/\/+$/, '');
    this.token = token;
  }

  async call(method, path, body) {
    const response = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || `sync failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  salt = (email) => this.call('GET', `/salt?email=${encodeURIComponent(email)}`);
  signup = (email, identity) => this.call('POST', '/signup', { email, identity });
  login = (email, authVerifier) => this.call('POST', '/login', { email, authVerifier });
  pull = (since) => this.call('GET', `/pull?since=${Number(since) || 0}`);
  push = (records) => this.call('POST', '/push', { records });
  putIdentity = (identity) => this.call('POST', '/identity', { identity });
  deleteAccount = () => this.call('POST', '/account/delete');
}

// -- the run -----------------------------------------------------------------

/**
 * One sync. `io` is the seam the tests replace:
 *
 *   readAll()               -> {store: [records]}
 *   write(store, record)    -> void
 *   remove(store, key)      -> void
 *   getMeta(key, fallback)  -> value
 *   setMeta(key, value)     -> void
 *
 * Returns a summary rather than throwing on a partial result, because a sync
 * that pushed but failed to pull is a real and recoverable state and the UI
 * has to be able to say which half happened.
 */
export async function runSync({ io, transport, dek, keyPaths }) {
  const idKey = await deriveIdKey(dek);
  const [baseline, cursor] = await Promise.all([
    io.getMeta('snapshot', {}),
    io.getMeta('cursor', 0),
  ]);

  const stores = await io.readAll();
  const current = await snapshot(stores, keyPaths, idKey);
  const { changed, deleted } = outbox(current, baseline);

  // Indexed once so a changed record can be found without rescanning. The
  // baseline stores the key alongside the hash so a DELETED record — which by
  // definition is no longer in `stores` — can still say what to remove.
  const byId = new Map();
  for (const [store, records] of Object.entries(stores)) {
    for (const record of records) {
      byId.set(await syncId(idKey, store, record[keyPaths[store]]), { store, record });
    }
  }

  const now = Date.now();
  const payload = [];
  for (const id of changed) {
    const blob = await encryptRecord(dek, id, byId.get(id).record);
    payload.push({ ...blob, updatedAt: now });
  }
  for (const id of deleted) {
    // The tombstone carries the store and key INSIDE its ciphertext. It has to:
    // the sync id is an HMAC now and cannot be reversed, so a receiving device
    // has no other way to learn which local record the grave belongs to.
    const gone = baseline[id];
    const blob = await encryptRecord(dek, id, {
      deleted: true, store: gone?.store ?? storeOf(id), key: gone?.key,
    });
    payload.push({ ...blob, updatedAt: now, deleted: true });
  }

  if (payload.length) await transport.push(payload);

  const pulled = await transport.pull(cursor);
  const { writes, tombstones } = plan(pulled.records, new Set(Object.keys(current)));

  let applied = 0;
  let skipped = 0;
  let removed = 0;
  for (const item of writes) {
    // A record from a store this version has never heard of — an older client
    // meeting data written by a newer one. Skipping keeps it syncing instead of
    // crashing, and the cursor still advances past it, so this device will not
    // see that record again. A version that later adds the store recovers it by
    // resetting the cursor to 0 and re-pulling, which is cheap and exact.
    if (!(item.store in keyPaths)) { skipped += 1; continue; }
    const value = await decryptRecord(dek, item.id, item.blob);
    await io.write(item.store, value);
    applied += 1;
  }
  for (const item of tombstones) {
    if (!(item.store in keyPaths)) { skipped += 1; continue; }
    const marker = await decryptRecord(dek, item.id, item.blob);
    if (marker.key === undefined) continue;
    await io.remove(marker.store ?? item.store, marker.key);
    removed += 1;
  }

  // The new baseline is what is on disk AFTER applying the pull, so the next
  // sync does not re-push everything the server just sent us.
  const settled = await snapshot(await io.readAll(), keyPaths, idKey);
  await io.setMeta('snapshot', settled);
  await io.setMeta('cursor', pulled.seq ?? cursor);

  return {
    pushed: changed.length,
    tombstoned: deleted.length,
    applied,
    skipped,
    removed,
    cursor: pulled.seq ?? cursor,
  };
}

// -- wiring to the real database ---------------------------------------------
//
// From here down the module touches IndexedDB, so it runs in a browser only.
// Everything above is pure or transport-shaped and is what the node suite
// exercises.

export const dbIo = {
  keyPaths: SYNCABLE,
  async readAll() {
    const entries = await Promise.all(
      Object.keys(SYNCABLE).map(async (store) => [store, await readStoreRaw(store)]),
    );
    return Object.fromEntries(entries);
  },
  write: (store, record) => putRaw(store, record),
  remove: (store, key) => deleteRaw(store, key),
  getMeta: (key, fallback) => getSyncMeta(key, fallback),
  setMeta: (key, value) => putSyncMeta(key, value),
};

/**
 * The account this device is signed into, or null. The DEK is deliberately NOT
 * part of it: an unlocked key is held in memory for the session and never
 * written down, so closing the app re-locks the vault.
 */
export async function session() {
  const [identity, token, email] = await Promise.all([
    getSyncMeta('identity'), getSyncMeta('token'), getSyncMeta('email'),
  ]);
  return identity && token ? { identity, token, email } : null;
}

async function remember(transport, email, identity, token) {
  await Promise.all([
    putSyncMeta('identity', identity),
    putSyncMeta('token', token),
    putSyncMeta('email', email),
  ]);
  transport.token = token;
}

export async function signUp(transport, email, password) {
  const { identity, recoveryCode } = await createIdentity(password);
  const { token } = await transport.signup(email, identity);
  await remember(transport, email, identity, token);
  // Returned once and never stored. Writing it down anywhere on this device
  // would make it a second copy of the key sitting beside the first.
  return { recoveryCode, dek: await unlock(password, identity) };
}

export async function signIn(transport, email, password) {
  const pre = await transport.salt(email);
  const verifier = await authVerifierFor(password, pre);
  const { token, identity } = await transport.login(email, verifier);
  await remember(transport, email, identity, token);
  return { dek: await unlock(password, identity) };
}

export async function signInWithRecoveryCode(transport, email, code) {
  const pre = await transport.salt(email);
  // Recovery proves possession of the DEK, not of the password, so there is no
  // verifier to send. The server cannot be asked for the wrapped key without a
  // login — which is why this only works on a device already signed in, and
  // why the UI has to route a forgotten password through setting a new one.
  const existing = await session();
  if (!existing) throw new Error('a recovery code needs a device that is already signed in');
  return { dek: await unlockWithRecoveryCode(code, { ...existing.identity, kdf: pre.kdf }) };
}

/**
 * Forget the account on THIS device. Local records are untouched — the ledger
 * was always local first and signing out of sync is not a reason to delete it.
 * The cursor and snapshot go, so signing back in re-syncs from scratch rather
 * than trusting a baseline from a previous session.
 */
export async function signOut(transport) {
  try {
    await transport.call('POST', '/logout');
  } catch {
    // An expired or unreachable session still gets forgotten locally.
  }
  transport.token = null;
  await clearSyncMeta();
}

export async function syncNow(transport, dek) {
  return runSync({ io: dbIo, transport, dek, keyPaths: SYNCABLE });
}
