# Shipping MoneyTrack to phones

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

## Hosting

Options 1 and 2 both need the app at an HTTPS URL. It is a folder of static
files, so this is free.

**GitHub Pages** is the least friction: push this folder to a repository, enable
Pages, done. HTTPS is automatic, which matters because a service worker refuses
to register over plain HTTP on anything but localhost.

The app is path-agnostic — every URL in `manifest.json` and `sw.js` is relative,
so it works at a domain root or in a subfolder without edits. `manifest.json`
deliberately omits the `id` field for this reason: `id` resolves against the
origin, and hardcoding one would guess at a deployment path the app otherwise
does not care about.

## Recommendation

Start with **option 1**. It is free, it works now, and it tells you whether you
actually want a store listing before you pay for one. If you decide you want the
Play Store, **option 2** is a couple of hours, not a rebuild.

## Before any of this

- `python3 make-icons.py` if the palette ever changes. The icons are generated,
  not hand-drawn, and they are also the Play Store listing icon.
- Bump `CACHE` in `sw.js`. Shipping a shell change without it leaves every
  installed user on the old version permanently.
- The Play Store listing wants screenshots. There are none in the repo yet.

## What has actually been verified

The service worker caches all 16 shell files and the app was confirmed working
with the dev server stopped: views render, categories load, fonts come from
cache. The manifest passes the installability criteria — name, short name,
description, `display: standalone`, relative `start_url` and `scope`, 192 and
512 icons in both `any` and `maskable`, and a theme colour matching Tone A.

None of the packaging steps above have been run. They need accounts and payment
methods, which are yours to provide.
