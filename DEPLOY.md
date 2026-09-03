# Shipping Clengan to phones

The app is an installable PWA with no build step. Every route below starts from
that same artifact, so nothing here requires rewriting the app.

Three things are true and shape every option:

- **You have no Mac.** iOS binaries can only be compiled on macOS. That does not
  block iOS, but it does mean iOS builds happen on a hosted macOS runner.
- **The data is local.** IndexedDB survives every wrapper below unchanged. No
  option here introduces a server or an account.
- **A store listing costs money.** Google Play is $25 once. Apple is $99 a year.
  Neither is avoidable if you want a store listing, and neither is needed if you
  do not.

## Option 1 — install the PWA (free, works today)

No packaging, no store, no fee. The app is already installable and already
works offline; both are verified.

**Android (Chrome):** open the URL, menu, "Add to Home screen". Runs
standalone, no browser chrome, offline capable.

**iOS (Safari, and it must be Safari):** open the URL, Share, "Add to Home
Screen". Same result.

The catch on iOS is real and worth knowing before you pick a path. Apple gives
home-screen web apps a storage budget that the system may evict when the device
is under pressure, and there is no way to opt out. **Export to Excel regularly**
— that is exactly what the Backup card is for. On Android this is not a concern.

You need a URL for this. See "Hosting" below.

## Option 2 — Android store listing via PWABuilder (easiest real app)

[pwabuilder.com](https://www.pwabuilder.com) takes a hosted PWA URL and emits a
signed Android package. It wraps the app in a Trusted Web Activity, which is a
real Play Store app that renders your PWA full-screen with no browser UI.

No local toolchain. No Android Studio, no JDK, no npm. This is the shortest
path from where the project is now to something on a phone from the Play Store.

1. Host the app (below) so it has an HTTPS URL.
2. Paste the URL into PWABuilder, package for Android.
3. **Keep the signing key it generates.** Losing it means you can never update
   the listing; you would have to publish a new app. Back it up somewhere other
   than this machine.
4. Pay the $25 once, upload the `.aab`, fill in the listing.

A TWA must pass Digital Asset Links, which PWABuilder sets up by giving you an
`assetlinks.json` to place at `/.well-known/assetlinks.json` on the host. If you
skip it the app opens with a browser address bar visible, which looks broken.

## Option 3 — Capacitor (both platforms, more control, more setup)

Capacitor wraps the same HTML/CSS/JS in a native shell for both platforms and
gives access to native APIs the web cannot reach. Worth it only if you later
want something the browser cannot do — biometric lock on open, a home-screen
widget, native share.

It costs you the thing this project deliberately avoided: `npm`, a
`package.json`, and a build step. Android also needs a JDK and the Android SDK
locally. iOS still needs macOS, so that half runs on a GitHub Actions macOS
runner regardless.

Do not reach for this until a specific native capability justifies it. The TWA
in option 2 produces the same user-visible result for this app today.

## Option 4 — iOS store listing

Unavoidable facts: $99 a year, an Apple Developer account, and a macOS machine
or runner to compile on. GitHub Actions provides macOS runners and the free
tier covers a personal app.

Given the cost and that option 1 puts the same app on your iPhone home screen
for free, this is only worth it if you intend to distribute to other people.

## Hosting — done

**Live: https://sandylatte.github.io/clengan/**

Repo `sandylatte/clengan`, public, GitHub Pages serving the `master` branch
root. No workflow file and no build step: every push republishes.

One thing that matters more here than on the dev server. Pages sends
`cache-control: max-age=600` on every file, which is exactly the condition
that made a freshly named cache fill with an old shell. The service worker
fetches its shell with `cache: 'reload'` specifically to defeat that, so
this host is safe — but it is the reason that line must never be removed.

Verified live on the deployed URL, not locally: HTTPS and secure context,
manifest served as `application/json`, service worker active with scope
`/clengan/`, all 23 shell files cached, every icon returning 200 including
the apple-touch-icon, and the full install checklist passing.

Options 1 and 2 both needed this. It is a folder of static files, so it
costs nothing.

**GitHub Pages** is the least friction: push this folder to a repository, enable
Pages, done. HTTPS is automatic, which matters because a service worker refuses
to register over plain HTTP on anything but localhost.

The app is path-agnostic — every URL in `manifest.json` and `sw.js` is relative,
so it works at a domain root or in a subfolder without edits. `manifest.json`
deliberately omits the `id` field for this reason: a relative `id` resolves
against the deployment path, so it would be identical to the `start_url`
default while making the app look pinned to a location it does not care about.
(I added `"id": "./"` while working on this and took it out again — it is a
no-op that contradicts the paragraph above.)

## Recommendation

Start with **option 1**. It is free, it works now, and it tells you whether you
actually want a store listing before you pay for one. If you decide you want the
Play Store, **option 2** is a couple of hours, not a rebuild.

## Before any of this

- `python3 make-icons.py` if the mark or the palette ever changes. The icons
  are generated, not hand-drawn, and they are also the Play Store listing icon.
- Bump `CACHE` in `sw.js`. Shipping a shell change without it leaves every
  installed user on the old version permanently.
- The Play Store listing wants screenshots. There are none in the repo, and I
  cannot take them: screenshots time out in the browser I drive. Take them from
  a phone or a desktop browser at a phone width.

## What has actually been verified

Installability, checked against the criteria rather than assumed. Secure
context, manifest parses, name and short name present, `display: standalone`,
relative `start_url` and `scope`, 192 and 512 icons in both `any` and
`maskable`, an active service worker with a fetch handler, and every icon URL
returning 200 — a 404 on any one of them silently disables the install prompt.

Offline, checked by stopping the dev server rather than by simulating it. With
nothing listening on the port, a reload still rendered every view, the budget
tracks, eleven list rows and a balance of Rp 42.280.000, with fonts and styles
served from the cache.

iOS home-screen icon. `apple-touch-icon` is now linked and returns 200. iOS
ignores the manifest's icons entirely for "Add to Home Screen", and without
that link it uses a SCREENSHOT of the page as the home-screen icon — so until
this commit the mark would never have appeared on an iPhone.

## What has NOT been done, and why

None of the packaging steps have been run. Every one of them needs something
only you can provide: a Google Play developer account and its $25 fee, an Apple
Developer account and its $99 a year, an app signing key, and a payment method.
Those are yours to hold, not mine — a signing key in particular is the thing
that proves future updates come from you, and it should never pass through a
machine you do not control.

The same goes for hosting: pushing this folder to a public URL is a decision
about publishing your own app, so it is yours to make. Everything up to that
point is done.
