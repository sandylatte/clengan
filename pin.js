// An optional four-digit PIN in front of "show amounts".
//
// A privacy screen, not a lock. It stops someone holding the phone from
// tapping the eye; it does not encrypt anything, and exports and backups
// still carry every figure. So it is kept on this device only (localStorage,
// never the settings store that sync would upload) and stored as a salted
// PBKDF2 hash rather than the digits themselves.

export const PIN_KEY = 'clengan-pin';            // { salt, hash, ask, minutes, resetAt? }
export const PIN_LOCK_KEY = 'clengan-pin-lock';  // { fails, until }

// When the PIN is asked for again after it has been entered once.
export const ASK_EVERY = 'every';      // each time amounts go from hidden to shown
export const ASK_LEAVE = 'leave';      // once, then again after leaving the app
export const ASK_MINUTES = 'minutes';  // once, then again after `minutes`
export const DEFAULT_MINUTES = 5;

// Wrong tries before the first lockout, and how long "Forgot the PIN?" takes
// to remove it. The wait is what keeps the lockout meaningful: anyone could
// press Forgot, but they would have to hold the phone for an hour first.
export const FREE_TRIES = 5;
export const RESET_DELAY = 60 * 60_000;

export const isPin = (text) => /^\d{4}$/.test(String(text));

const toHex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)));

export const newSalt = () => toHex(crypto.getRandomValues(new Uint8Array(16)));

// Ten thousand PINs is a small space whatever the hash, so the iterations
// only make reading one back out of storage slower, not impossible. That is
// the honest ceiling of a four-digit PIN.
export async function hashPin(pin, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(salt), iterations: 100_000 }, key, 256,
  );
  return toHex(bits);
}

// The first FREE_TRIES wrong tries cost nothing; each one after that locks
// the PIN for twice as long as the last — 30 s, 1 min, 2 min — up to 30 min.
export function lockFor(fails) {
  if (fails < FREE_TRIES) return 0;
  return Math.min(30_000 * 2 ** (fails - FREE_TRIES), 30 * 60_000);
}

// Whether showing amounts has to ask for the PIN right now. `unlockedAt` is
// when it was last entered correctly, or 0; the app clears it on leaving
// when the choice is ASK_LEAVE, which is all that choice needs.
export function pinNeeded(pin, unlockedAt, now) {
  if (!pin) return false;
  if (!unlockedAt) return true;
  if (pin.ask === ASK_LEAVE) return false;
  if (pin.ask === ASK_MINUTES) return now - unlockedAt >= (pin.minutes || DEFAULT_MINUTES) * 60_000;
  return true;
}

// "Try again in 1 min 30 s", for the lockout message.
export function waitText(ms) {
  const seconds = Math.ceil(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (!m) return `${s} s`;
  return s ? `${m} min ${s} s` : `${m} min`;
}
