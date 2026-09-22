// The crypto core for encrypted sync. See ARCHITECTURE-SYNC.md.
//
// Nothing in this module talks to a server or to IndexedDB. It turns a
// password into keys, wraps a data key under them, and encrypts records. That
// is the whole surface, and keeping it that narrow is what makes it testable
// under plain `node --test` rather than only in a browser.
//
// Three rules hold the design up, and breaking any one of them voids the
// guarantee the rest of the system is built on:
//
//   1. The value sent to the server to log in and the key that decrypts are
//      SEPARATE derivations. If they are the same value the server can read
//      everything the moment it decides to.
//   2. The password never encrypts a record. It unwraps a random data key
//      which does, so changing a password rewrites one wrapped key instead of
//      re-encrypting a ledger.
//   3. A record's id is authenticated alongside its ciphertext. Without that
//      the server can move a blob from one record to another and the client
//      decrypts it happily.

const subtle = globalThis.crypto.subtle;
const utf8 = new TextEncoder();

// Named parameter sets rather than bare numbers, and the name is stored on
// every identity. Raising the cost later — or moving to Argon2id — then means
// adding an entry here and re-deriving on next unlock, instead of locking out
// everyone whose identity was made under the old cost.
//
// PBKDF2 is the honest weak point of this file. It is native to WebCrypto, so
// it costs the project no dependency and no build step, but it is cheap to
// attack on a GPU in a way Argon2id deliberately is not. It defends a stolen
// blob against a casual attacker, not a funded one. ARCHITECTURE-SYNC.md
// records this as an open decision; this constant is where it gets settled.
export const KDFS = {
  'pbkdf2-sha256-600k': { name: 'PBKDF2', hash: 'SHA-256', iterations: 600000 },
};
export const CURRENT_KDF = 'pbkdf2-sha256-600k';

// Distinct info strings, so two keys derived from one password cannot collide
// even by accident. Versioned, because changing what a label means without
// changing the label is how you silently break every existing identity.
const INFO_AUTH = 'clengan/auth/v1';
const INFO_ENC = 'clengan/enc/v1';
const INFO_RECOVERY = 'clengan/recovery/v1';

// Domain separation for the two things AES-GCM is used for here. A wrapped DEK
// and an encrypted record must not be interchangeable as ciphertexts.
const AAD_DEK = 'clengan/dek/v1';

const bytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

export const toBase64 = (buffer) => {
  const view = new Uint8Array(buffer);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary);
};

export const fromBase64 = (text) => {
  const binary = atob(text);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

// No I, L, O or U. The user reads this off a screen and writes it on paper,
// and those four are the ones that come back wrong.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function toBase32(view) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of view) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function fromBase32(text) {
  const clean = String(text).toUpperCase().replace(/[^0-9A-Z]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const character of clean) {
    const index = ALPHABET.indexOf(character);
    if (index < 0) throw new Error('recovery code contains a character that is not in the alphabet');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

// Grouped for transcription. The groups are cosmetic — fromBase32 strips
// anything that is not in the alphabet, so a user may type it with or without.
export const formatRecoveryCode = (code) => (code.match(/.{1,5}/g) ?? []).join('-');

async function hkdf(keyMaterial, salt, info, length = 256) {
  const key = await subtle.importKey('raw', keyMaterial, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: utf8.encode(info) },
    key,
    length,
  ));
}

async function aesKey(raw, usages = ['encrypt', 'decrypt']) {
  return subtle.importKey('raw', raw, 'AES-GCM', true, usages);
}

// The password's single expensive step. Everything else is derived from this
// output cheaply, so the cost is paid once per unlock rather than per key.
async function stretch(password, salt, kdfName) {
  const params = KDFS[kdfName];
  if (!params) throw new Error(`unknown kdf "${kdfName}"`);
  const material = await subtle.importKey('raw', utf8.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await subtle.deriveBits(
    { name: params.name, hash: params.hash, iterations: params.iterations, salt },
    material,
    256,
  ));
}

// Rule 1 lives here. One expensive stretch, then two cheap HKDF expansions
// with different info strings: the verifier goes to the server, the KEK never
// leaves the device, and neither can be computed from the other.
async function deriveBoth(password, salt, kdfName) {
  const master = await stretch(password, salt, kdfName);
  const [verifier, kek] = await Promise.all([
    hkdf(master, salt, INFO_AUTH),
    hkdf(master, salt, INFO_ENC),
  ]);
  return { verifier, kek: await aesKey(kek) };
}

async function recoveryKey(code, salt) {
  // No stretching. A recovery code is 256 bits of machine-generated entropy,
  // so there is nothing for a KDF to defend — unlike a password, it cannot be
  // guessed. HKDF is here for domain separation, not for cost.
  return aesKey(await hkdf(fromBase32(code), salt, INFO_RECOVERY));
}

async function wrap(key, raw) {
  const iv = bytes(12);
  const data = await subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: utf8.encode(AAD_DEK) },
    key,
    raw,
  );
  return { iv: toBase64(iv), data: toBase64(data) };
}

async function unwrap(key, wrapped) {
  const raw = await subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(wrapped.iv), additionalData: utf8.encode(AAD_DEK) },
    key,
    fromBase64(wrapped.data),
  );
  return new Uint8Array(raw);
}

// Everything the server is given, plus the recovery code, which it is not.
// The caller shows the code once and never stores it.
export async function createIdentity(password, kdfName = CURRENT_KDF) {
  if (typeof password !== 'string' || password === '') {
    throw new RangeError('a password is required');
  }
  const salt = bytes(16);
  const { verifier, kek } = await deriveBoth(password, salt, kdfName);

  const dek = bytes(32);
  const code = toBase32(bytes(32));
  // Its own salt, generated once and never rotated by a password change. If
  // recovery shared the password's salt, changing the password would silently
  // invalidate the code the user wrote down at signup — they would not find
  // out until the day they needed it, which is the worst possible day.
  const recoverySalt = bytes(16);
  const recovery = await recoveryKey(code, recoverySalt);

  // Two wraps of ONE key. Two independent ways in, and the server holds both
  // and can open neither.
  const [wrapped, recoveryWrapped] = await Promise.all([wrap(kek, dek), wrap(recovery, dek)]);

  return {
    identity: {
      kdf: kdfName,
      salt: toBase64(salt),
      recoverySalt: toBase64(recoverySalt),
      authVerifier: toBase64(verifier),
      wrapped,
      recoveryWrapped,
    },
    recoveryCode: formatRecoveryCode(code),
  };
}

// Login without unlocking: the server compares this, and by rule 1 it is
// useless for decryption.
export async function authVerifierFor(password, identity) {
  const { verifier } = await deriveBoth(password, fromBase64(identity.salt), identity.kdf);
  return toBase64(verifier);
}

export async function unlock(password, identity) {
  const { kek } = await deriveBoth(password, fromBase64(identity.salt), identity.kdf);
  try {
    return await aesKey(await unwrap(kek, identity.wrapped));
  } catch {
    // AES-GCM authentication failed, which for a wrapped key means exactly one
    // thing. Re-thrown as a sentence rather than an OperationError so a caller
    // is not tempted to guess.
    throw new Error('wrong password');
  }
}

export async function unlockWithRecoveryCode(code, identity) {
  const key = await recoveryKey(code, fromBase64(identity.recoverySalt));
  try {
    return await aesKey(await unwrap(key, identity.recoveryWrapped));
  } catch {
    throw new Error('wrong recovery code');
  }
}

// Rule 2's payoff, and the reason the DEK exists at all: not one record is
// touched. The DEK is unwrapped under the old password and rewrapped under the
// new one, and `recoveryWrapped` rides along untouched — it is bound to
// `recoverySalt`, which a password change deliberately does not rotate, so the
// code the user wrote down at signup still opens the same DEK afterwards.
//
// A fresh password salt, and the KDF moves to whatever is current. An old
// identity therefore upgrades its cost parameters the next time its owner
// changes their password, rather than being stuck at the cost it was born with.
export async function changePassword(currentPassword, newPassword, identity) {
  if (typeof newPassword !== 'string' || newPassword === '') {
    throw new RangeError('a password is required');
  }
  const dekKey = await unlock(currentPassword, identity);
  const dek = new Uint8Array(await subtle.exportKey('raw', dekKey));

  const salt = bytes(16);
  const { verifier, kek } = await deriveBoth(newPassword, salt, CURRENT_KDF);

  return {
    ...identity,
    kdf: CURRENT_KDF,
    salt: toBase64(salt),
    authVerifier: toBase64(verifier),
    wrapped: await wrap(kek, dek),
  };
}

// For a code that has been used, photographed, or lost. Needs the password,
// because issuing a new way into the DEK to someone who cannot already open it
// would be a backdoor rather than a feature.
//
// The old code stops working the moment this is stored: its wrap is replaced,
// not kept alongside.
export async function rotateRecoveryCode(password, identity) {
  const dekKey = await unlock(password, identity);
  const dek = new Uint8Array(await subtle.exportKey('raw', dekKey));

  const code = toBase32(bytes(32));
  const recoverySalt = bytes(16);
  const recovery = await recoveryKey(code, recoverySalt);

  return {
    identity: {
      ...identity,
      recoverySalt: toBase64(recoverySalt),
      recoveryWrapped: await wrap(recovery, dek),
    },
    recoveryCode: formatRecoveryCode(code),
  };
}

// Per-record encryption. `id` is authenticated but not encrypted: the server
// needs it to address the row, and binding it into the tag is what stops a
// blob being moved to a different record (rule 3).
export async function encryptRecord(dek, id, value) {
  const iv = bytes(12);
  const data = await subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: utf8.encode(String(id)) },
    dek,
    utf8.encode(JSON.stringify(value)),
  );
  return { id: String(id), iv: toBase64(iv), data: toBase64(data) };
}

export async function decryptRecord(dek, id, blob) {
  const plain = await subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(blob.iv), additionalData: utf8.encode(String(id)) },
    dek,
    fromBase64(blob.data),
  );
  return JSON.parse(new TextDecoder().decode(plain));
}
