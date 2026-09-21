# Clengan

A local-first PWA money tracker. All data lives in IndexedDB in the browser;
there is no backend and no build step — it's plain HTML/CSS/JS served as
static files.

## Running locally

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/`.

## Tests

Two suites, covering different layers:

```bash
node --test
```

Runs the pure-logic tests (money math, rollups, Excel round-trip). Note:
`node --test test/` does **not** work on this Node build — run bare
`node --test` from the repo root instead.

```
http://localhost:8000/test.html
```

Open in a browser. Covers the IndexedDB layer (transaction/transfer-pair
invariants, import idempotence) that can't be tested under plain Node.

```
http://localhost:8000/migration-test.html
```

Builds a real v7 database and runs the v8 account-id migration against it.
Separate from `test.html` because `db.openDb` memoises its connection, so a
migration test has to be the first thing on its own page.

**Unregister the service worker before either of these.** It is cache-first,
so it will happily serve the modules from before your edit and the suite will
pass against code that is no longer on disk.

## Releasing a change

- Both test suites above must pass first (`node --test` and `test.html`).
- If your change touches any file listed in `SHELL` in `sw.js` (`app.js`,
  `styles.css`, `money.js`, `rollup.js`, `db.js`, `xlsx-io.js`, etc.), bump
  the `CACHE` constant at the top of `sw.js` (e.g. `clengan-v1` →
  `clengan-v2`). The service worker is cache-first and only evicts caches
  whose name differs from `CACHE`, so skipping this leaves every user with
  an already-installed worker stuck on the old code indefinitely — including
  past any money bug the change was meant to fix.

## Installing on a phone

"Add to Home Screen" needs the service worker to register, and iOS only
allows service workers over HTTPS on anything other than `localhost`. To
test a real phone install, serve the folder over HTTPS (any static host
works) — plain `http://<lan-ip>:8000` will not register the worker on iOS.
