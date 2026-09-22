import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KDFS, CURRENT_KDF, createIdentity, authVerifierFor, unlock, unlockWithRecoveryCode,
  changePassword, rotateRecoveryCode, encryptRecord, decryptRecord,
  toBase64, fromBase64, formatRecoveryCode,
} from '../vault.js';

// A deliberately cheap KDF for the suite. The real cost parameter is the
// point of the file, but paying it on every one of these tests turns a
// sub-second run into a minute and nothing here is testing PBKDF2 itself.
KDFS['test-cheap'] = { name: 'PBKDF2', hash: 'SHA-256', iterations: 1 };
const make = (password = 'correct horse battery staple') => createIdentity(password, 'test-cheap');

const raw = async (key) => new Uint8Array(await globalThis.crypto.subtle.exportKey('raw', key));

test('base64 survives every byte value', () => {
  const all = Uint8Array.from({ length: 256 }, (_, i) => i);
  assert.deepEqual(fromBase64(toBase64(all)), all);
});

test('an identity carries no plaintext of the password or the keys', async () => {
  const { identity } = await make('hunter2');
  const serialised = JSON.stringify(identity);
  assert.ok(!serialised.includes('hunter2'));
  // Everything stored is base64 of ciphertext or of a public salt.
  assert.deepEqual(
    Object.keys(identity).sort(),
    ['authVerifier', 'kdf', 'recoverySalt', 'recoveryWrapped', 'salt', 'wrapped'],
  );
});

test('two identities from the SAME password share no material', async () => {
  const a = await make('same password');
  const b = await make('same password');
  assert.notEqual(a.identity.salt, b.identity.salt);
  assert.notEqual(a.identity.authVerifier, b.identity.authVerifier);
  assert.notEqual(a.identity.wrapped.data, b.identity.wrapped.data);
  assert.notEqual(a.recoveryCode, b.recoveryCode);
});

// Rule 1. The single most important assertion in this file: if the value the
// server is given were also the key, everything else here would be theatre.
test('the auth verifier is not the encryption key', async () => {
  const { identity } = await make();
  const dek = await unlock('correct horse battery staple', identity);
  const verifier = fromBase64(identity.authVerifier);
  assert.notDeepEqual(await raw(dek), verifier);
  // And the verifier cannot open the wrapped DEK either.
  const asKey = await globalThis.crypto.subtle.importKey('raw', verifier, 'AES-GCM', false, ['decrypt']);
  await assert.rejects(() => globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(identity.wrapped.iv), additionalData: new TextEncoder().encode('clengan/dek/v1') },
    asKey,
    fromBase64(identity.wrapped.data),
  ));
});

test('the verifier is reproducible from the password, for login', async () => {
  const { identity } = await make('let me in');
  assert.equal(await authVerifierFor('let me in', identity), identity.authVerifier);
  assert.notEqual(await authVerifierFor('let me out', identity), identity.authVerifier);
});

test('unlock returns the same key every time', async () => {
  const { identity } = await make();
  const first = await unlock('correct horse battery staple', identity);
  const second = await unlock('correct horse battery staple', identity);
  assert.deepEqual(await raw(first), await raw(second));
});

test('the wrong password is refused, and named', async () => {
  const { identity } = await make('right');
  await assert.rejects(() => unlock('wrong', identity), /wrong password/);
});

test('an empty password is refused at creation', async () => {
  await assert.rejects(() => createIdentity('', 'test-cheap'), RangeError);
});

test('the recovery code opens the same DEK as the password', async () => {
  const { identity, recoveryCode } = await make();
  const viaPassword = await unlock('correct horse battery staple', identity);
  const viaCode = await unlockWithRecoveryCode(recoveryCode, identity);
  assert.deepEqual(await raw(viaCode), await raw(viaPassword));
});

test('a recovery code is accepted however the user retypes it', async () => {
  const { identity, recoveryCode } = await make();
  const expected = await raw(await unlockWithRecoveryCode(recoveryCode, identity));
  for (const variant of [
    recoveryCode.toLowerCase(),
    recoveryCode.replace(/-/g, ''),
    recoveryCode.replace(/-/g, ' '),
    `  ${recoveryCode}  `,
  ]) {
    assert.deepEqual(await raw(await unlockWithRecoveryCode(variant, identity)), expected, variant);
  }
});

test('a wrong recovery code is refused', async () => {
  const { identity } = await make();
  const { recoveryCode: other } = await make();
  await assert.rejects(() => unlockWithRecoveryCode(other, identity), /wrong recovery code/);
});

test('the recovery code avoids the letters people mistype', async () => {
  const { recoveryCode } = await make();
  assert.match(recoveryCode, /^[0-9A-HJKMNP-TV-Z-]+$/);
  assert.equal(formatRecoveryCode('ABCDEFGHIJ'), 'ABCDE-FGHIJ');
});

// Rule 2. The reason a DEK exists rather than encrypting under the password.
test('changing the password keeps the same DEK and rewrites one wrap', async () => {
  const { identity } = await make('first');
  const before = await raw(await unlock('first', identity));

  const next = await changePassword('first', 'second', identity);
  const after = await raw(await unlock('second', next));

  assert.deepEqual(after, before, 'the data key must survive a password change');
  assert.notEqual(next.wrapped.data, identity.wrapped.data);
  assert.notEqual(next.salt, identity.salt);
  assert.notEqual(next.authVerifier, identity.authVerifier);
});

test('the old password stops working after a change', async () => {
  const { identity } = await make('first');
  const next = await changePassword('first', 'second', identity);
  await assert.rejects(() => unlock('first', next), /wrong password/);
});

test('changing the password cannot be done without the current one', async () => {
  const { identity } = await make('first');
  await assert.rejects(() => changePassword('not it', 'second', identity), /wrong password/);
});

// The bug this file shipped with for one draft: recovery was salted with the
// password's salt, so a password change silently invalidated the code the user
// wrote down at signup — discoverable only on the day they needed it.
test('the recovery code still works after a password change', async () => {
  const { identity, recoveryCode } = await make('first');
  const next = await changePassword('first', 'second', identity);
  const recovered = await unlockWithRecoveryCode(recoveryCode, next);
  assert.deepEqual(await raw(recovered), await raw(await unlock('second', next)));
});

test('a password change carries the KDF forward to the current one', async () => {
  const { identity } = await make('first');
  assert.equal(identity.kdf, 'test-cheap');
  const next = await changePassword('first', 'second', identity);
  assert.equal(next.kdf, CURRENT_KDF);
});

test('rotating the recovery code invalidates the old one and keeps the DEK', async () => {
  const { identity, recoveryCode: old } = await make('pw');
  const before = await raw(await unlock('pw', identity));

  const { identity: next, recoveryCode: fresh } = await rotateRecoveryCode('pw', identity);
  assert.notEqual(fresh, old);
  assert.deepEqual(await raw(await unlockWithRecoveryCode(fresh, next)), before);
  await assert.rejects(() => unlockWithRecoveryCode(old, next), /wrong recovery code/);
  assert.deepEqual(await raw(await unlock('pw', next)), before, 'the password must still work');
});

test('rotating a recovery code needs the password', async () => {
  const { identity } = await make('pw');
  await assert.rejects(() => rotateRecoveryCode('not it', identity), /wrong password/);
});

test('a record round-trips', async () => {
  const { identity } = await make();
  const dek = await unlock('correct horse battery staple', identity);
  const row = { id: 'abc', date: '2026-09-22', amount: -125000, note: 'kopi' };
  const blob = await encryptRecord(dek, row.id, row);
  assert.deepEqual(await decryptRecord(dek, row.id, blob), row);
});

test('a blob carries no plaintext of its contents', async () => {
  const { identity } = await make();
  const dek = await unlock('correct horse battery staple', identity);
  const blob = await encryptRecord(dek, 'r1', { note: 'salary', amount: 900000 });
  const serialised = JSON.stringify(blob);
  assert.ok(!serialised.includes('salary'));
  assert.ok(!serialised.includes('900000'));
});

// Rule 3. Without the id in the AAD the server could move a blob between
// records and the client would decrypt it without complaint.
test('a blob cannot be moved to another record id', async () => {
  const { identity } = await make();
  const dek = await unlock('correct horse battery staple', identity);
  const blob = await encryptRecord(dek, 'row-1', { amount: 100 });
  await assert.rejects(() => decryptRecord(dek, 'row-2', blob));
});

test('a blob cannot be read with another identity key', async () => {
  const a = await make('one');
  const b = await make('two');
  const dekA = await unlock('one', a.identity);
  const dekB = await unlock('two', b.identity);
  const blob = await encryptRecord(dekA, 'r', { secret: true });
  await assert.rejects(() => decryptRecord(dekB, 'r', blob));
});

test('a tampered ciphertext is rejected rather than returning garbage', async () => {
  const { identity } = await make();
  const dek = await unlock('correct horse battery staple', identity);
  const blob = await encryptRecord(dek, 'r', { amount: 100 });
  const bad = fromBase64(blob.data);
  bad[0] ^= 1;
  await assert.rejects(() => decryptRecord(dek, 'r', { ...blob, data: toBase64(bad) }));
});

test('every record gets its own IV', async () => {
  const { identity } = await make();
  const dek = await unlock('correct horse battery staple', identity);
  const ivs = new Set();
  for (let i = 0; i < 50; i += 1) {
    ivs.add((await encryptRecord(dek, `r${i}`, { i })).iv);
  }
  assert.equal(ivs.size, 50, 'an IV reused under one key breaks AES-GCM outright');
});

test('encrypting the same value twice gives different ciphertext', async () => {
  const { identity } = await make();
  const dek = await unlock('correct horse battery staple', identity);
  const value = { amount: -4500 };
  const first = await encryptRecord(dek, 'r', value);
  const second = await encryptRecord(dek, 'r', value);
  assert.notEqual(first.data, second.data);
});

test('the shipped KDF is a real cost, not the test one', () => {
  assert.ok(KDFS[CURRENT_KDF].iterations >= 600000, 'the default KDF must not be weakened by accident');
});
