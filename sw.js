// RELEASE RULE: if you change ANY file listed in SHELL below (app.js,
// rollup.js, money.js, styles.css, etc.), you MUST bump this string
// (e.g. 'clengan-v2' -> 'clengan-v3') as part of that change.
// The fetch handler is cache-first and activate() only deletes caches whose
// NAME differs from CACHE — so an unbumped CACHE means every user with the
// worker already installed keeps being served the OLD shell forever, silently,
// including any money bug that edit was meant to fix.
const CACHE = 'clengan-v95';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './db.js',
  './money.js',
  './rollup.js',
  './budget.js',
  './planner.js',
  './calendar.js',
  './dialog.js',
  './swipe.js',
  './editor.js',
  './sample.js',
  './reorder.js',
  './recurring.js',
  './xlsx-io.js',
  './manifest.json',
  './vendor/xlsx.full.min.js',
  './vendor/motion.js',
  './vendor/fira-sans.woff2',
  './vendor/fira-code.woff2',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// `cache: 'reload'` on every shell request, and this is not a nicety.
//
// cache.addAll() fetches through the browser's ORDINARY HTTP cache. Bumping
// CACHE therefore guarantees a new, empty cache — and guarantees nothing at
// all about what goes into it. A server that does not send no-store (GitHub
// Pages, any static host, `python3 -m http.server`) lets the browser answer
// those fetches from its own heuristic cache, so a cache honestly named
// clengan-v95 gets filled with weeks-old CSS and modules.
//
// That is how the peach tone kept coming back RED: styles.css from before
// 932f081, when the peach button was salmon #B2503A, reinstalled into a
// freshly named cache. The version marker said new, the bytes were old, and
// every reload looked like it had checked.
//
// 'reload' bypasses the HTTP cache on the way out and updates it on the way
// back, so the shell in this cache is what the server has right now.
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(
    SHELL.map((url) => new Request(url, { cache: 'reload' })),
  )));
  // skipWaiting + clients.claim (below) are safe here only because the
  // entire shell is fetched upfront in one addAll — a client that gets
  // claimed always has the full matching set of modules, never a mix of
  // old and new. If a module is ever lazy-loaded instead of listed in
  // SHELL, that guarantee breaks and this needs revisiting.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
    )).then(() => self.clients.claim()),
  );
});

// The Settings card asks the worker directly rather than listing caches.
// caches.keys() is read from the page, which can catch the moment between a
// new cache being filled and activate() deleting the old one — it reported
// two versions at once. Only the worker knows which one the fetch handler is
// actually reading from, and that is the question the card exists to answer.
self.addEventListener('message', (event) => {
  if (event.data === 'which-cache') event.source.postMessage({ cache: CACHE });
});

// Cache-first, and deliberately scoped to CACHE.
//
// The bare caches.match(request) this replaced searches EVERY cache in this
// origin, in creation order, and returns the first hit. An older cache that
// activate() failed to remove therefore shadows the current one for as long
// as it exists: every reload serves the old shell, the version bump changes
// nothing, and the app shows weeks-old styling and formatting while looking
// perfectly up to date. Reading only the current cache makes a leftover inert
// rather than authoritative.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.open(CACHE)
      .then((cache) => cache.match(event.request))
      .then((hit) => hit || fetch(event.request)),
  );
});
