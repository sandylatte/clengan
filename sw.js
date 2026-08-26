const CACHE = 'moneytrack-v1';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './db.js',
  './money.js',
  './rollup.js',
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
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
    )).then(() => self.clients.claim()),
  );
});

// Cache-first. Every entry is a versioned part of the shell, and the app has
// no server to be stale against — bump CACHE to ship an update.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((hit) => hit || fetch(event.request)),
  );
});
