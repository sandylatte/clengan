import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';

// The service worker is the one file where a mistake is INVISIBLE: the app
// keeps working, it just keeps working like an old version of itself. Every
// rule below is one that has already cost a debugging session.

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const read = (name) => readFileSync(resolve(root, name), 'utf8');

const sw = read('sw.js');
const shell = [...sw.matchAll(/'(\.\/[^']*)'/g)].map((m) => m[1]);

// Rule 1. cache.addAll() fetches through the browser's ordinary HTTP cache,
// so bumping CACHE creates a new cache and says nothing about what fills it.
// On any host that does not send no-store, a cache named for today's version
// gets stale bytes — which is exactly how the peach tone kept reappearing in
// last month's salmon.
test('the shell is fetched past the HTTP cache, not through it', () => {
  const install = sw.slice(sw.indexOf("addEventListener('install'"), sw.indexOf("addEventListener('activate'"));
  assert.match(
    install,
    /cache:\s*'reload'/,
    'install must populate the cache with Requests marked cache: "reload", or a '
    + 'freshly named cache can be filled from the browser HTTP cache with an old shell',
  );
});

// Rule 2. A bare caches.match(request) searches EVERY cache in the origin,
// oldest first. One leftover then shadows the current cache permanently.
test('the fetch handler reads only the current cache', () => {
  const fetchHandler = sw.slice(sw.indexOf("addEventListener('fetch'"));
  assert.equal(
    /caches\.match\s*\(/.test(fetchHandler),
    false,
    'caches.match searches every cache in the origin; scope the lookup to CACHE',
  );
  assert.match(fetchHandler, /caches\.open\(CACHE\)/);
});

// Rule 3. The one I keep getting wrong by hand. A module missing from SHELL
// is fetched from the network instead — so the app half-works offline, and a
// claimed client can mix a new module with an old cached one. Derived from
// what the page actually loads rather than from a list I maintain twice.
function reachableFiles() {
  const html = read('index.html');
  const entries = [...html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)].map((m) => m[1]);
  const seen = new Set(entries);
  const queue = entries.filter((f) => f.endsWith('.js'));
  while (queue.length) {
    const file = queue.pop();
    let source;
    try {
      source = read(file);
    } catch {
      continue; // vendor bundles and assets are listed, not walked
    }
    for (const match of source.matchAll(/from\s+'(\.\/[^']+)'/g)) {
      const dep = match[1];
      if (seen.has(dep)) continue;
      seen.add(dep);
      queue.push(dep);
    }
  }
  return [...seen];
}

test('every file the page loads is in SHELL', () => {
  const missing = reachableFiles().filter((file) => !shell.includes(file));
  assert.deepEqual(
    missing,
    [],
    'files reachable from index.html but absent from SHELL in sw.js. They will be '
    + 'fetched from the network, so the app breaks offline and a claimed client can '
    + 'mix a new module with an old cached one.',
  );
});

test('SHELL does not list a file that no longer exists', () => {
  const gone = shell
    .filter((file) => file !== './')
    .filter((file) => {
      try {
        readFileSync(resolve(root, file));
        return false;
      } catch {
        return true;
      }
    });
  // addAll rejects atomically: one 404 and the whole install fails, leaving
  // the previous worker serving the previous shell indefinitely.
  assert.deepEqual(gone, [], 'SHELL names files that are not on disk; addAll would reject and no update would ever install');
});

test('the cache name carries a version that can be bumped', () => {
  assert.match(sw, /const CACHE = 'moneytrack-v\d+';/);
});
