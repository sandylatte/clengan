// Argon2id (RFC 9106, version 0x13), for vault.js.
//
// Written out here because no browser ships it: WebCrypto has PBKDF2, which a
// GPU attacks cheaply, and nothing memory-hard. A vendored WASM build would be
// faster, but it is an opaque blob in a privacy app whose whole argument is
// "read the code"; this is a few hundred readable lines, and
// test/argon2.test.js holds it to the RFC's own vector and to OpenSSL's output
// across lane counts, passes and tag lengths.
//
// Every 64-bit word is a pair of 32-bit halves, low then high, because a JS
// number cannot hold one. Products go through 16-bit halves so that no
// intermediate passes 2^53 and every bit stays exact.
//
// ponytail: runs on the calling thread. At vault.js's cost that is about
// 0.3 s on a desktop (node and Chromium alike); a phone is slower and has not
// been measured. Move it into a Worker if the freeze ever shows.

const TWO_32 = 4294967296;

// -- BLAKE2b (RFC 7693), the hash Argon2 is built from ------------------------

const IV = new Uint32Array([
  0xf3bcc908, 0x6a09e667, 0x84caa73b, 0xbb67ae85, 0xfe94f82b, 0x3c6ef372, 0x5f1d36f1, 0xa54ff53a,
  0xade682d1, 0x510e527f, 0x2b3e6c1f, 0x9b05688c, 0xfb41bd6b, 0x1f83d9ab, 0x137e2179, 0x5be0cd19,
]);

const SIGMA = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
  [11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4],
  [7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8],
  [9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13],
  [2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9],
  [12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11],
  [13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10],
  [6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5],
  [10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0],
];

// v[a] += v[b] + m[x], in place on word indices (each word is two slots).
function add3(v, a, b, m, x) {
  const lo = v[a] + v[b] + m[x];
  v[a] = lo;
  v[a + 1] = v[a + 1] + v[b + 1] + m[x + 1] + ((lo / TWO_32) | 0);
}

function add2(v, a, b) {
  const lo = v[a] + v[b];
  v[a] = lo;
  v[a + 1] = v[a + 1] + v[b + 1] + (lo > 0xffffffff ? 1 : 0);
}

// v[d] = (v[d] ^ v[a]) rotated right by n, for the four n BLAKE2b uses.
function xorRotate(v, d, a, n) {
  const lo = v[d] ^ v[a];
  const hi = v[d + 1] ^ v[a + 1];
  if (n === 32) {
    v[d] = hi;
    v[d + 1] = lo;
  } else if (n === 63) {
    v[d] = (lo << 1) | (hi >>> 31);
    v[d + 1] = (hi << 1) | (lo >>> 31);
  } else {
    v[d] = (lo >>> n) | (hi << (32 - n));
    v[d + 1] = (hi >>> n) | (lo << (32 - n));
  }
}

function mix(v, a, b, c, d, m, x, y) {
  add3(v, a, b, m, x);
  xorRotate(v, d, a, 32);
  add2(v, c, d);
  xorRotate(v, b, c, 24);
  add3(v, a, b, m, y);
  xorRotate(v, d, a, 16);
  add2(v, c, d);
  xorRotate(v, b, c, 63);
}

function compress(h, block, bytesSoFar, last) {
  const v = new Uint32Array(32);
  v.set(h);
  v.set(IV, 16);
  v[24] ^= bytesSoFar >>> 0;
  v[25] ^= (bytesSoFar / TWO_32) >>> 0;
  if (last) {
    v[28] = ~v[28];
    v[29] = ~v[29];
  }
  const m = new Uint32Array(block.buffer, block.byteOffset, 32);
  for (let round = 0; round < 12; round += 1) {
    const s = SIGMA[round % 10];
    mix(v, 0, 8, 16, 24, m, s[0] * 2, s[1] * 2);
    mix(v, 2, 10, 18, 26, m, s[2] * 2, s[3] * 2);
    mix(v, 4, 12, 20, 28, m, s[4] * 2, s[5] * 2);
    mix(v, 6, 14, 22, 30, m, s[6] * 2, s[7] * 2);
    mix(v, 0, 10, 20, 30, m, s[8] * 2, s[9] * 2);
    mix(v, 2, 12, 22, 24, m, s[10] * 2, s[11] * 2);
    mix(v, 4, 14, 16, 26, m, s[12] * 2, s[13] * 2);
    mix(v, 6, 8, 18, 28, m, s[14] * 2, s[15] * 2);
  }
  for (let i = 0; i < 16; i += 1) h[i] ^= v[i] ^ v[i + 16];
}

// Unkeyed, 1 to 64 bytes out. The digest length is mixed into the first
// state word, so a 32-byte BLAKE2b is not a truncated 64-byte one.
// Assumes a little-endian platform, which every browser and node target is.
export function blake2b(input, length = 64) {
  const h = IV.slice();
  h[0] ^= 0x01010000 ^ length;
  const block = new Uint8Array(128);
  let offset = 0;
  // The last block is compressed with the final flag even when it is full,
  // so a whole block is held back until there is more input after it.
  while (input.length - offset > 128) {
    block.set(input.subarray(offset, offset + 128));
    offset += 128;
    compress(h, block, offset, false);
  }
  block.fill(0);
  block.set(input.subarray(offset));
  compress(h, block, input.length, true);
  return new Uint8Array(h.buffer).slice(0, length);
}

// -- Argon2id -----------------------------------------------------------------

const BLOCK_WORDS = 256; // 1024 bytes as 32-bit slots
const VERSION = 0x13;
const TYPE_ID = 2;

const le32 = (n) => new Uint8Array(new Uint32Array([n]).buffer);

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

// H', the variable-length hash: chained 64-byte BLAKE2b, 32 bytes kept from
// each link, the whole of the last.
function hashLong(input, length) {
  const head = concat(le32(length), input);
  if (length <= 64) return blake2b(head, length);
  const out = new Uint8Array(length);
  const links = Math.ceil(length / 32) - 2;
  let v = blake2b(head, 64);
  out.set(v.subarray(0, 32), 0);
  for (let i = 1; i < links; i += 1) {
    v = blake2b(v, 64);
    out.set(v.subarray(0, 32), i * 32);
  }
  out.set(blake2b(v, length - 32 * links), links * 32);
  return out;
}

// x + y + 2 * low(x) * low(y), mod 2^64: the multiplication Argon2 adds to
// BLAKE2b's round so that a GPU pays for a multiplier, not just adders.
function blamka(v, x, y) {
  const xl = v[x];
  const yl = v[y];
  const x0 = xl & 0xffff;
  const x1 = xl >>> 16;
  const y0 = yl & 0xffff;
  const y1 = yl >>> 16;
  const mid = x1 * y0 + x0 * y1;
  const midLo = mid & 0xffff;
  const low = x0 * y0 + midLo * 65536;
  const productLo = low >>> 0;
  const productHi = x1 * y1 + (mid - midLo) / 65536 + (low > 0xffffffff ? 1 : 0);
  const lo = xl + yl + ((productLo << 1) >>> 0);
  v[x] = lo;
  v[x + 1] = v[x + 1] + v[y + 1] + ((productHi << 1) | (productLo >>> 31)) + ((lo / TWO_32) | 0);
}

function round(v, a, b, c, d) {
  blamka(v, a, b);
  xorRotate(v, d, a, 32);
  blamka(v, c, d);
  xorRotate(v, b, c, 24);
  blamka(v, a, b);
  xorRotate(v, d, a, 16);
  blamka(v, c, d);
  xorRotate(v, b, c, 63);
}

// BLAKE2b's round without a message, over sixteen of the block's words.
function permute(v, i0, i1, i2, i3, i4, i5, i6, i7, i8, i9, i10, i11, i12, i13, i14, i15) {
  round(v, i0, i4, i8, i12);
  round(v, i1, i5, i9, i13);
  round(v, i2, i6, i10, i14);
  round(v, i3, i7, i11, i15);
  round(v, i0, i5, i10, i15);
  round(v, i1, i6, i11, i12);
  round(v, i2, i7, i8, i13);
  round(v, i3, i4, i9, i14);
}

const R = new Uint32Array(BLOCK_WORDS);
const KEEP = new Uint32Array(BLOCK_WORDS);

// The compression function G, writing G(prev, ref) over `next` in memory.
// From the second pass on it XORs into what was there instead (`fold`),
// which is the 0x13 change that stops an attacker discarding old blocks.
function fill(memory, prev, ref, next, fold) {
  for (let i = 0; i < BLOCK_WORDS; i += 1) {
    R[i] = memory[prev + i] ^ memory[ref + i];
    KEEP[i] = fold ? R[i] ^ memory[next + i] : R[i];
  }
  for (let row = 0; row < 8; row += 1) {
    const w = row * 32;
    permute(R, w, w + 2, w + 4, w + 6, w + 8, w + 10, w + 12, w + 14,
      w + 16, w + 18, w + 20, w + 22, w + 24, w + 26, w + 28, w + 30);
  }
  for (let col = 0; col < 8; col += 1) {
    const w = col * 4;
    permute(R, w, w + 2, w + 32, w + 34, w + 64, w + 66, w + 96, w + 98,
      w + 128, w + 130, w + 160, w + 162, w + 192, w + 194, w + 224, w + 226);
  }
  for (let i = 0; i < BLOCK_WORDS; i += 1) memory[next + i] = KEEP[i] ^ R[i];
}

// The high 32 bits of a * b, for two 32-bit values.
function mulHigh(a, b) {
  const a0 = a & 0xffff;
  const a1 = a >>> 16;
  const b0 = b & 0xffff;
  const b1 = b >>> 16;
  const mid = a1 * b0 + a0 * b1;
  const low = a0 * b0 + (mid & 0xffff) * 65536;
  return a1 * b1 + (mid - (mid & 0xffff)) / 65536 + (low > 0xffffffff ? 1 : 0);
}

/**
 * Argon2id. `memory` is in KiB, as every Argon2 tool counts it.
 * `secret` and `ad` are the spec's optional K and X; vault.js uses neither.
 */
export function argon2id(password, salt, { memory, passes, lanes }, length = 32,
  { secret = new Uint8Array(0), ad = new Uint8Array(0) } = {}) {
  if (!(lanes >= 1 && passes >= 1 && memory >= 8 * lanes && length >= 4 && salt.length >= 8)) {
    throw new RangeError('argon2id parameters out of range');
  }
  const h0 = blake2b(concat(
    le32(lanes), le32(length), le32(memory), le32(passes), le32(VERSION), le32(TYPE_ID),
    le32(password.length), password, le32(salt.length), salt,
    le32(secret.length), secret, le32(ad.length), ad,
  ), 64);

  const segment = Math.floor(memory / (4 * lanes));
  const laneLength = segment * 4;
  const blocks = laneLength * lanes;
  const mem = new Uint32Array(blocks * BLOCK_WORDS);
  const at = (lane, index) => (lane * laneLength + index) * BLOCK_WORDS;

  for (let lane = 0; lane < lanes; lane += 1) {
    for (const index of [0, 1]) {
      const bytes = hashLong(concat(h0, le32(index), le32(lane)), 1024);
      mem.set(new Uint32Array(bytes.buffer), at(lane, index));
    }
  }

  // The first half of the first pass picks its reference blocks from a
  // counter rather than from the data, so its memory access pattern says
  // nothing about the password to anyone timing it. That is the "i" in "id".
  const zero = new Uint32Array(BLOCK_WORDS);
  const input = new Uint32Array(BLOCK_WORDS);
  const addresses = new Uint32Array(BLOCK_WORDS);
  const scratch = new Uint32Array(BLOCK_WORDS * 3);
  const nextAddresses = () => {
    input[12] += 1;
    scratch.set(zero, 0);
    scratch.set(input, BLOCK_WORDS);
    fill(scratch, 0, BLOCK_WORDS, 2 * BLOCK_WORDS, false);
    scratch.set(scratch.subarray(2 * BLOCK_WORDS), BLOCK_WORDS);
    fill(scratch, 0, BLOCK_WORDS, 2 * BLOCK_WORDS, false);
    addresses.set(scratch.subarray(2 * BLOCK_WORDS));
  };

  for (let pass = 0; pass < passes; pass += 1) {
    for (let slice = 0; slice < 4; slice += 1) {
      for (let lane = 0; lane < lanes; lane += 1) {
        const independent = pass === 0 && slice < 2;
        if (independent) {
          input.fill(0);
          input[0] = pass;
          input[2] = lane;
          input[4] = slice;
          input[6] = blocks;
          input[8] = passes;
          input[10] = TYPE_ID;
        }
        const start = pass === 0 && slice === 0 ? 2 : 0;
        if (independent && start === 2) nextAddresses();

        for (let i = start; i < segment; i += 1) {
          const index = slice * segment + i;
          const prev = at(lane, index === 0 ? laneLength - 1 : index - 1);
          let j1;
          let j2;
          if (independent) {
            if (i % 128 === 0) nextAddresses();
            j1 = addresses[(i % 128) * 2];
            j2 = addresses[(i % 128) * 2 + 1];
          } else {
            j1 = mem[prev];
            j2 = mem[prev + 1];
          }

          const refLane = pass === 0 && slice === 0 ? lane : j2 % lanes;
          const sameLane = refLane === lane;
          // How many blocks this one may reference: everything finished, less
          // the block just before it, and only finished segments of other lanes.
          let area;
          if (pass === 0) {
            area = slice * segment + (sameLane ? i - 1 : (i === 0 ? -1 : 0));
          } else {
            area = laneLength - segment + (sameLane ? i - 1 : (i === 0 ? -1 : 0));
          }
          // A non-uniform pick that favours recent blocks: area - 1 - area * (j1^2 / 2^64).
          const relative = area - 1 - mulHigh(area, mulHigh(j1, j1));
          const startAt = pass === 0 || slice === 3 ? 0 : (slice + 1) * segment;
          const refIndex = (startAt + relative) % laneLength;

          fill(mem, prev, at(refLane, refIndex), at(lane, index), pass > 0);
        }
      }
    }
  }

  const last = new Uint32Array(BLOCK_WORDS);
  for (let lane = 0; lane < lanes; lane += 1) {
    const end = at(lane, laneLength - 1);
    for (let i = 0; i < BLOCK_WORDS; i += 1) last[i] ^= mem[end + i];
  }
  return hashLong(new Uint8Array(last.buffer), length);
}
