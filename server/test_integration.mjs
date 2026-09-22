// End to end: real vault.js keys, real HTTP, real SQLite.
//
// The unit suites each prove one half. This proves they fit: an identity made
// by the browser's crypto is accepted by the server, a record encrypted with
// the resulting DEK survives a push and a pull, and what comes back decrypts
// to the row that went in — while the server's own database holds nothing
// readable.
//
// Run: node server/test_integration.mjs   (spawns the Python server itself)

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

import {
  KDFS, createIdentity, authVerifierFor, unlock, unlockWithRecoveryCode,
  changePassword, encryptRecord, decryptRecord,
} from '../vault.js';
import { Transport, runSync } from '../sync.js';

// The real 600k KDF three times over is ~2s of nothing. The cost parameter is
// tested in test/vault.test.js; this file is about the wiring.
KDFS['test-cheap'] = { name: 'PBKDF2', hash: 'SHA-256', iterations: 1 };

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8798;
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = 'a password the server never sees';

const server = spawn('python3', [path.join(here, 'app.py')], {
  env: { ...process.env, CLENGAN_PORT: String(PORT), CLENGAN_DB: ':memory:' },
  stdio: ['ignore', 'inherit', 'inherit'],
});

const done = (code) => { server.kill('SIGTERM'); process.exit(code); };
process.on('uncaughtException', (error) => { console.error(error); done(1); });

async function ready() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return;
    } catch { /* not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('server never came up');
}

const call = async (method, path_, { body, token } = {}) => {
  const response = await fetch(`${BASE}${path_}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};

const checks = [];
const check = (label, fn) => checks.push({ label, fn });

check('an identity built by vault.js is accepted by the server', async (state) => {
  const made = await createIdentity(PASSWORD, 'test-cheap');
  state.identity = made.identity;
  state.recoveryCode = made.recoveryCode;
  const { status, body } = await call('POST', '/signup', {
    body: { email: 'e2e@example.com', identity: made.identity },
  });
  assert.equal(status, 201, JSON.stringify(body));
  state.token = body.token;
});

check('the salt endpoint returns what the client needs to derive', async (state) => {
  const { body } = await call('GET', '/salt?email=e2e@example.com');
  assert.equal(body.salt, state.identity.salt);
  assert.equal(body.kdf, 'test-cheap');
});

check('logging in with a verifier derived from the password works', async (state) => {
  const { body: pre } = await call('GET', '/salt?email=e2e@example.com');
  // Exactly what the client does: fetch the salt, derive, send the verifier.
  const verifier = await authVerifierFor(PASSWORD, pre);
  const { status, body } = await call('POST', '/login', {
    body: { email: 'e2e@example.com', authVerifier: verifier },
  });
  assert.equal(status, 200, JSON.stringify(body));
  state.token = body.token;
  state.served = body.identity;
});

check('the wrapped DEK survives the round trip through the database', async (state) => {
  const fromServer = { ...state.served, kdf: state.identity.kdf };
  const dek = await unlock(PASSWORD, fromServer);
  const local = await unlock(PASSWORD, state.identity);
  const raw = (key) => globalThis.crypto.subtle.exportKey('raw', key);
  assert.deepEqual(new Uint8Array(await raw(dek)), new Uint8Array(await raw(local)));
  state.dek = dek;
});

check('a real encrypted row pushes and pulls back intact', async (state) => {
  const row = { id: 'txn-1', date: '2026-09-22', amount: -125000, category: 'Food', note: 'kopi' };
  const blob = await encryptRecord(state.dek, row.id, row);
  const { status } = await call('POST', '/push', {
    token: state.token,
    body: { records: [{ ...blob, updatedAt: Date.now() }] },
  });
  assert.equal(status, 200);

  const { body } = await call('GET', '/pull?since=0', { token: state.token });
  assert.equal(body.records.length, 1);
  const back = await decryptRecord(state.dek, 'txn-1', body.records[0]);
  assert.deepEqual(back, row);
  state.cursor = body.seq;
});

check('what the server returned contains no plaintext of the row', async (state) => {
  const { body } = await call('GET', '/pull?since=0', { token: state.token });
  const wire = JSON.stringify(body);
  for (const leak of ['kopi', 'Food', '125000', '2026-09-22']) {
    assert.ok(!wire.includes(leak), `"${leak}" travelled in the clear`);
  }
});

check('a second device pulls and decrypts with only the password', async (state) => {
  const { body: pre } = await call('GET', '/salt?email=e2e@example.com');
  const verifier = await authVerifierFor(PASSWORD, pre);
  const { body: session } = await call('POST', '/login', {
    body: { email: 'e2e@example.com', authVerifier: verifier },
  });
  // Nothing carried over from the first device but the password itself.
  const dek = await unlock(PASSWORD, { ...session.identity, kdf: state.identity.kdf });
  const { body } = await call('GET', '/pull?since=0', { token: session.token });
  const row = await decryptRecord(dek, 'txn-1', body.records[0]);
  assert.equal(row.note, 'kopi');
});

check('the recovery code opens the same data', async (state) => {
  const { body: session } = await call('POST', '/login', {
    body: {
      email: 'e2e@example.com',
      authVerifier: await authVerifierFor(PASSWORD, state.identity),
    },
  });
  const dek = await unlockWithRecoveryCode(state.recoveryCode, {
    ...session.identity, kdf: state.identity.kdf,
  });
  const { body } = await call('GET', '/pull?since=0', { token: session.token });
  assert.equal((await decryptRecord(dek, 'txn-1', body.records[0])).note, 'kopi');
});

check('a password change re-reads the same rows and touches no blob', async (state) => {
  const next = await changePassword(PASSWORD, 'a different password', state.identity);
  const { status, body } = await call('POST', '/identity', {
    token: state.token,
    body: { identity: next },
  });
  assert.equal(status, 200, JSON.stringify(body));

  const { body: pre } = await call('GET', '/salt?email=e2e@example.com');
  const verifier = await authVerifierFor('a different password', pre);
  const { body: session } = await call('POST', '/login', {
    body: { email: 'e2e@example.com', authVerifier: verifier },
  });
  const dek = await unlock('a different password', { ...session.identity, kdf: next.kdf });
  const { body: pulled } = await call('GET', '/pull?since=0', { token: session.token });
  const row = await decryptRecord(dek, 'txn-1', pulled.records[0]);
  assert.equal(row.note, 'kopi', 'a password change must not cost the user their data');

  // And the code written down at signup still works afterwards.
  const viaCode = await unlockWithRecoveryCode(state.recoveryCode, {
    ...session.identity, kdf: next.kdf,
  });
  assert.equal((await decryptRecord(viaCode, 'txn-1', pulled.records[0])).note, 'kopi');
});

// -- the sync engine against the real server ---------------------------------
//
// Everything above proves the crypto and the endpoints. This proves the engine
// that drives them: two devices, one account, real ciphertext over real HTTP.

const KEY_PATHS = { transactions: 'id', accounts: 'id', settings: 'key' };

function device(initial = {}) {
  const stores = { transactions: [], accounts: [], settings: [], ...initial };
  const meta = {};
  return {
    stores,
    readAll: async () => JSON.parse(JSON.stringify(stores)),
    write: async (store, record) => {
      const kp = KEY_PATHS[store];
      const at = stores[store].findIndex((r) => r[kp] === record[kp]);
      if (at >= 0) stores[store][at] = record; else stores[store].push(record);
    },
    remove: async (store, key) => {
      const kp = KEY_PATHS[store];
      stores[store] = stores[store].filter((r) => String(r[kp]) !== String(key));
    },
    getMeta: async (key, fallback) => (key in meta ? meta[key] : fallback),
    setMeta: async (key, value) => { meta[key] = value; },
  };
}

check('two devices converge through the real server', async (state) => {
  const email = 'engine@example.com';
  const made = await createIdentity('engine password', 'test-cheap');
  const signup = new Transport(BASE);
  const { token } = await signup.call('POST', '/signup', { email, identity: made.identity });
  const dek = await unlock('engine password', made.identity);

  const phone = new Transport(BASE, token);
  const laptop = new Transport(BASE, token);

  const a = device({
    transactions: [{ id: 't1', date: '2026-09-22', amount: -125000, note: 'kopi' }],
    accounts: [{ id: 'acc1', name: 'Bank BCA', opening_balance: 500000 }],
  });
  const first = await runSync({ io: a, transport: phone, dek, keyPaths: KEY_PATHS });
  assert.equal(first.pushed, 2);

  const b = device();
  const second = await runSync({ io: b, transport: laptop, dek, keyPaths: KEY_PATHS });
  assert.equal(second.applied, 2, 'the second device must receive both records');
  assert.deepEqual(b.stores.transactions[0], a.stores.transactions[0]);
  assert.deepEqual(b.stores.accounts[0], a.stores.accounts[0]);
  state.engine = { dek, phone, laptop, a, b };
});

check('an edit on one device reaches the other and nothing else moves', async (state) => {
  const { dek, phone, laptop, a, b } = state.engine;
  a.stores.transactions[0].note = 'kopi susu';
  const pushed = await runSync({ io: a, transport: phone, dek, keyPaths: KEY_PATHS });
  assert.equal(pushed.pushed, 1, 'only the edited row should go up');

  await runSync({ io: b, transport: laptop, dek, keyPaths: KEY_PATHS });
  assert.equal(b.stores.transactions[0].note, 'kopi susu');
  assert.equal(b.stores.accounts.length, 1);
});

check('a delete propagates and does not come back', async (state) => {
  const { dek, phone, laptop, a, b } = state.engine;
  a.stores.transactions = [];
  await runSync({ io: a, transport: phone, dek, keyPaths: KEY_PATHS });
  await runSync({ io: b, transport: laptop, dek, keyPaths: KEY_PATHS });
  assert.deepEqual(b.stores.transactions, [], 'the row should be gone on the second device');

  // And a further sync on either side must not resurrect it.
  await runSync({ io: b, transport: laptop, dek, keyPaths: KEY_PATHS });
  await runSync({ io: a, transport: phone, dek, keyPaths: KEY_PATHS });
  assert.deepEqual(a.stores.transactions, []);
  assert.deepEqual(b.stores.transactions, []);
});

check('a quiet sync sends nothing at all', async (state) => {
  const { dek, phone, a } = state.engine;
  const result = await runSync({ io: a, transport: phone, dek, keyPaths: KEY_PATHS });
  assert.equal(result.pushed, 0);
  assert.equal(result.tombstoned, 0);
  assert.equal(result.applied, 0);
});

check('the server holds ciphertext for every record the engine sent', async (state) => {
  const { laptop } = state.engine;
  const { records } = await laptop.pull(0);
  assert.ok(records.length > 0);
  const wire = JSON.stringify(records);
  for (const leak of ['kopi', 'Bank BCA', '125000', '500000']) {
    assert.ok(!wire.includes(leak), `"${leak}" is readable on the server`);
  }
  // The store IS visible and that is the documented metadata cost: the server
  // knows a transaction exists. The key is an HMAC under a key derived from the
  // DEK, so it learns nothing about WHICH record, and for name-keyed stores it
  // never sees the name.
  assert.match(wire, /transactions:[0-9a-f]{32}/);
  assert.ok(!wire.includes('transactions:t1'), 'the raw key must not be addressable');
});

await ready();
const state = {};
let failed = 0;
for (const { label, fn } of checks) {
  try {
    await fn(state);
    console.log(`pass — ${label}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL — ${label}\n      ${error.message}`);
  }
}
console.log(`\n${checks.length - failed}/${checks.length}`);
done(failed ? 1 : 0);
