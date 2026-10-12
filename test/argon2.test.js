import test from 'node:test';
import assert from 'node:assert/strict';
import { argon2id, blake2b } from '../argon2.js';
import { KDFS, CURRENT_KDF } from '../vault.js';

const hex = (bytes) => Buffer.from(bytes).toString('hex');
const text = (s) => new TextEncoder().encode(s);

test('BLAKE2b matches RFC 7693 and b2sum', () => {
  assert.equal(hex(blake2b(text('abc'))),
    'ba80a53f981c4d0d6a2797b69f12f6e94c212f14685ac4b74b12bb6fdbffa2d17d87c5392aab792dc252d5de4533cc9518d38aa8dbf1925ab92386edd4009923');
  assert.equal(hex(blake2b(new Uint8Array(0))),
    '786a02f742015903c6c6fd852552d272912f4740e15847618a86e217f71f5419d25e1031afee585313896444934eb04b903a685b1448b755d56f701afe9be2ce');
});

test('Argon2id matches the RFC 9106 test vector', () => {
  const tag = argon2id(new Uint8Array(32).fill(1), new Uint8Array(16).fill(2),
    { memory: 32, passes: 3, lanes: 4 }, 32,
    { secret: new Uint8Array(8).fill(3), ad: new Uint8Array(12).fill(4) });
  assert.equal(hex(tag), '0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659');
});

// Each expected value is OpenSSL 3.5.4's answer to the same question:
//   openssl kdf -keylen L -kdfopt pass:P -kdfopt salt:S -kdfopt iter:T
//     -kdfopt memcost:M -kdfopt lanes:N -kdfopt threads:1 ARGON2ID
const OPENSSL = [
  // The parameters vault.js ships, so the exact shipped path is pinned.
  ['correct horse battery staple', 'clengan-salt-001', { memory: 19456, passes: 2, lanes: 1 }, 32,
    '9489ba06c7f48ba176b03ba012125f6703b06b6544e311494a83c0a21cc3efcc'],
  // Four lanes referencing each other, and segments long enough to need a
  // second block of addresses.
  ['kata sandi', 'garam-garam-garam', { memory: 2100, passes: 3, lanes: 4 }, 65,
    'b596df052800d288c8305dc63967657ed1fc7c2cfba000df449469380f51e14669fad56562d465eea33cec78cc4fa299bd07595461df12d5a2a68168b70a8da340'],
  ['pw', 'saltsalt', { memory: 8, passes: 1, lanes: 1 }, 4, '198c5ea3'],
  ['', 'saltsaltsalt', { memory: 64, passes: 2, lanes: 2 }, 100,
    '05b0495ae1f83640ccb0240dad8eb4edef376afd504c2a1ef4d3ff2edc6b2c0356244a18cac7919452e08b756592d9f06d90d0c72f9a8afd219d7ba1ed3a9482d20bd8d2d46decf7c2f30b6f03b8425d5fb8df1880b1e23900a0df2de2b8ba22060183b5'],
];

test('Argon2id matches OpenSSL across lanes, passes and tag lengths', () => {
  for (const [password, salt, params, length, expected] of OPENSSL) {
    assert.equal(hex(argon2id(text(password), text(salt), params, length)), expected,
      JSON.stringify({ password, ...params, length }));
  }
});

test('the vector above is the KDF vault.js actually uses', () => {
  const { name, ...params } = KDFS[CURRENT_KDF];
  assert.equal(name, 'Argon2id');
  assert.deepEqual(params, OPENSSL[0][2]);
});

test('parameters Argon2 does not define are refused, not run', () => {
  const salt = text('saltsalt');
  assert.throws(() => argon2id(text('pw'), salt, { memory: 7, passes: 1, lanes: 1 }), RangeError);
  assert.throws(() => argon2id(text('pw'), salt, { memory: 64, passes: 0, lanes: 1 }), RangeError);
  assert.throws(() => argon2id(text('pw'), text('short'), { memory: 64, passes: 1, lanes: 1 }), RangeError);
  assert.throws(() => argon2id(text('pw'), salt, { memory: 64, passes: 1, lanes: 1 }, 3), RangeError);
});
