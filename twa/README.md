# Play Store prep

Everything here supports option 2 in [DEPLOY.md](../DEPLOY.md): wrapping the
existing PWA in a Trusted Web Activity. No app code changes.

Three of the four steps below have to be done by you, because they need a
Google account, a signing key and a payment method. Those are yours to hold and
should not pass through anyone else's machine.

## 1. Asset links have to live at the DOMAIN root — and yours is a 404

This is the step that silently ruins a TWA, so it is first.

Android verifies a TWA by fetching

```
https://sandylatte.github.io/.well-known/assetlinks.json
```

**Not** `https://sandylatte.github.io/clengan/.well-known/...`. The path is
fixed at the origin root and there is no way to point it elsewhere. Clengan is
a *project* Pages site served under `/clengan/`, so the repo this file is in
cannot serve that URL at all. As of writing, `https://sandylatte.github.io/`
returns 404 — nothing is serving your domain root.

If verification fails the app still installs and runs, but it opens **with the
browser address bar showing**. It looks broken, and Play treats an unverified
wrapper as a policy problem rather than a cosmetic one.

### The fix

Create a second repository named exactly `sandylatte.github.io` — the name is
what makes GitHub serve it at the domain root. It can contain almost nothing:

```
sandylatte.github.io/
├── .nojekyll
└── .well-known/
    └── assetlinks.json
```

`.nojekyll` is not optional. GitHub Pages runs Jekyll by default, and Jekyll
**excludes any file or directory beginning with a dot** from the built site —
so `.well-known/` is dropped and the URL 404s even though the file is committed.
An empty `.nojekyll` at the repo root turns Jekyll off.

A user-pages repo and a project-pages repo coexist. Creating this does not
affect `https://sandylatte.github.io/clengan/`.

Then enable Pages on it and confirm:

```bash
curl -i https://sandylatte.github.io/.well-known/assetlinks.json
```

200 and `content-type: application/json`. Anything else and the TWA will not
verify.

## 2. The file itself

`assetlinks.template.json` here is the shape. One value is missing and only you
can produce it: the SHA-256 fingerprint of the signing key PWABuilder generates
for you.

PWABuilder gives you the completed file in its download. If you ever need to
read the fingerprint off the key yourself:

```bash
keytool -list -v -keystore your-key.keystore -alias your-alias
```

The `package_name` must match what you enter in PWABuilder, and both must match
the Play listing forever after.

**Keep the signing key and back it up somewhere other than the machine that
made it.** Losing it means you can never update the listing — not "it is
painful", it is not possible. You publish a new app under a new identity and
your existing installs are orphaned.

## 3. A privacy policy URL

Play requires one before a listing can go live, and the Data Safety form has to
agree with it.

[`../privacy.html`](../privacy.html) is a draft, written to describe what the
app does **as it ships today**: no account, no server, no analytics, nothing
transmitted. It will be live at

```
https://sandylatte.github.io/clengan/privacy.html
```

once pushed, which is a usable value for the listing field.

Read it before you submit it. It is a starting point written by looking at the
code, not legal advice, and the moment sync ships it stops being true — an app
with accounts collects an email address and that form has to change with it.

## 4. What is actually left

| | Who |
| --- | --- |
| Create `sandylatte.github.io` with `.nojekyll` + assetlinks | you |
| Run PWABuilder against the live URL, keep the signing key | you |
| $25 Play registration, upload the `.aab`, fill the listing | you |
| Verify the manifest, icons, offline behaviour and policy text | done |

The app itself needs no changes. It is already installable, already offline,
already passes the install criteria — verified against the live URL, not
locally.
