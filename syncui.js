// The Sync tile. Step 5 of ARCHITECTURE-SYNC.md.
//
// Kept out of app.js because it is the one part of Settings that can fail for
// reasons outside the device — a server that is down, a session that expired,
// a password that is wrong — and every one of those has to become a sentence
// on screen rather than a silent no-op.
//
// The DEK lives in a module-scoped variable and is never written down. Closing
// the app re-locks the vault, which is the point: a key sitting in IndexedDB
// beside the ciphertext it opens is not encryption, it is filing.

import { Transport, signUp, signIn, signOut, syncNow, session } from './sync.js';
import { getSyncMeta, putSyncMeta } from './db.js';
import { showRecoveryCode, alertDialog, confirmDialog } from './dialog.js';

let dek = null;
let transport = null;

const $ = (id) => document.getElementById(id);

const say = (message, ok = false) => {
  const line = $('sync-status');
  line.textContent = message;
  line.className = ok ? 'is-ok' : '';
};

// "Just now", then minutes, then a date. A bare timestamp on a sync line makes
// the reader do arithmetic to answer the only question they have, which is
// whether it happened recently.
function ago(at) {
  if (!at) return 'never';
  const seconds = Math.round((Date.now() - at) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  return new Date(at).toLocaleDateString();
}

async function paint() {
  const account = await session();
  const lastAt = await getSyncMeta('lastSyncAt', null);

  $('sync-signed-out').hidden = Boolean(account);
  $('sync-signed-in').hidden = !account;

  if (!account) {
    $('state-sync').textContent = 'Off';
    return;
  }
  $('sync-account').textContent = `Signed in as ${account.email}. Last sync ${ago(lastAt)}.`;
  // The face answers the question the tile exists to answer, same as every
  // other tile: not "is there an account" but "is my data anywhere else yet".
  $('state-sync').textContent = lastAt ? ago(lastAt) : 'Never synced';

  // A session survives a reload; an unlocked key does not. Say so rather than
  // letting "Sync now" fail with something cryptic.
  if (!dek) say('Signed in. Enter your password and sign in again to unlock syncing.');
}

async function currentTransport() {
  const base = (await getSyncMeta('server', '')) || $('sync-server').value.trim();
  if (!base) throw new Error('Set a server address first.');
  const account = await session();
  return new Transport(base, account?.token ?? null);
}

async function withBusy(button, work) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Working…';
  try {
    await work();
  } catch (error) {
    // Every failure gets a sentence. A 401 after a sign-in is not the same
    // problem as a server that is not there, and the reader cannot tell them
    // apart from "failed".
    if (error.status === 401) say('That email and password do not match an account.');
    else if (error.status === 429) say('Too many attempts. Wait a few minutes.');
    // `TypeError: Failed to fetch` is the network one. Matching on the name
    // alone swallowed real bugs: any TypeError thrown inside this module was
    // being reported to the user as "the server is unreachable", which sent me
    // looking at the server for a fault that was in the client.
    else if (error instanceof TypeError && /fetch/i.test(error.message)) {
      say('Could not reach that server. Check the address and that it is running.');
    } else say(error.message || 'Sync failed.');
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

function credentials() {
  const email = $('sync-email').value.trim();
  const password = $('sync-password').value;
  if (!email || !password) throw new Error('Enter an email and a password.');
  return { email, password };
}

export async function initSyncUi() {
  const server = await getSyncMeta('server', '');
  $('sync-server').value = server;

  $('sync-server').addEventListener('change', async (event) => {
    await putSyncMeta('server', event.target.value.trim());
    say('Server saved.', true);
  });

  $('sync-signup').addEventListener('click', () => withBusy($('sync-signup'), async () => {
    const { email, password } = credentials();
    transport = await currentTransport();
    const created = await signUp(transport, email, password);
    dek = created.dek;
    // Shown before the first sync, not after. If the code only appeared once
    // data had moved, a failure in between would leave an account whose only
    // key the user has never seen.
    await showRecoveryCode({ code: created.recoveryCode });
    $('sync-password').value = '';
    await paint();
    say('Account created. Syncing…');
    await runOnce();
  }));

  $('sync-form').addEventListener('submit', (event) => {
    event.preventDefault();
    withBusy($('sync-signin'), async () => {
      const { email, password } = credentials();
      transport = await currentTransport();
      ({ dek } = await signIn(transport, email, password));
      $('sync-password').value = '';
      await paint();
      say('Signed in. Syncing…');
      await runOnce();
    });
  });

  $('sync-now').addEventListener('click', () => withBusy($('sync-now'), runOnce));

  $('sync-signout').addEventListener('click', async () => {
    const sure = await confirmDialog({
      title: 'Sign out of sync on this device',
      body: 'Your records stay on this device. This only forgets the account, so nothing new will be sent or received until you sign in again.',
      confirmLabel: 'Sign out',
    });
    if (!sure) return;
    transport = transport ?? await currentTransport().catch(() => null);
    if (transport) await signOut(transport);
    dek = null;
    await paint();
    say('Signed out on this device.');
  });

  await paint();
}

async function runOnce() {
  if (!dek) {
    say('Enter your password and sign in again to unlock syncing.');
    return;
  }
  transport = transport ?? await currentTransport();
  const result = await syncNow(transport, dek);
  await putSyncMeta('lastSyncAt', Date.now());
  await paint();

  const parts = [];
  if (result.pushed) parts.push(`${result.pushed} sent`);
  if (result.tombstoned) parts.push(`${result.tombstoned} deleted`);
  if (result.applied) parts.push(`${result.applied} received`);
  if (result.removed) parts.push(`${result.removed} removed here`);
  say(parts.length ? `Synced — ${parts.join(', ')}.` : 'Synced. Nothing had changed.', true);

  // A record from a store this build does not know means the other device is
  // running a newer version. Worth saying, because the two will look like they
  // disagree until this one is updated.
  if (result.skipped) {
    await alertDialog({
      title: 'Some records need a newer version',
      body: `${result.skipped} record${result.skipped === 1 ? '' : 's'} came from a newer version of Clengan than this device is running.\n\nUpdate this device from the App version tile, then sync again.`,
    });
  }
}
