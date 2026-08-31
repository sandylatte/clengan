// RELEASE RULE: if you change ANY file listed in SHELL below (app.js,
// rollup.js, money.js, styles.css, etc.), you MUST bump this string
// (e.g. 'moneytrack-v1' -> 'moneytrack-v2') as part of that change.
// The fetch handler is cache-first and activate() only deletes caches whose
// NAME differs from CACHE — so an unbumped CACHE means every user with the
// worker already installed keeps being served the OLD shell forever, silently,
// including any money bug that edit was meant to fix.
const CACHE = 'moneytrack-v30';

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
  './xlsx-io.js',
  './manifest.json',
  './vendor/xlsx.full.min.js',
  './vendor/fira-sans.woff2',
  './vendor/fira-code.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
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
