---
version: alpha
name: Clengan
description: "A phone-first local-only money tracker, shipped as an installable PWA with no build step. Two user-switchable tones share one token vocabulary: Tone A is carbon and volt, a true-black AMOLED canvas (#000000) carrying a high-chroma green accent (#00EB62); Tone B is peach room, a warm light canvas (#F3CEC2) built from a photographic reference where the frame interior reads brighter than the wall. Type is Fira Sans for UI and Fira Code for every figure, so digits stay in tabular columns. The system is an app UI, not a marketing canvas: the tallest step in the ramp is the amount field at 34px, headings sit at 17px and below, and depth comes from a three-step surface ladder plus hairline borders. Colour carries meaning only — green for income, red for spending, the accent for the primary action and the active tab. Nothing is decorative."

colors:
  primary: "#00EB62"
  primary-hover: "#3BFF87"
  on-primary: "#04140A"
  active: "#00EB62"
  accent: "#2ED08A"
  destructive: "#F2543D"
  background: "#000000"
  foreground: "#D2D8D5"
  muted: "#0C100E"
  input: "#131816"
  subtle: "#7E938A"
  border: "#1C2420"
  border-strong: "#313D37"
  peach-primary: "#D7B4AD"
  peach-primary-hover: "#E0C2BC"
  peach-on-primary: "#4A2A22"
  peach-active: "#8E3A26"
  peach-accent: "#2D674C"
  peach-destructive: "#9F3B29"
  peach-background: "#F3CEC2"
  peach-foreground: "#4A2A22"
  peach-muted: "#F7DCD3"
  peach-input: "#FBE8E1"
  peach-subtle: "#7E5144"
  peach-border: "#E9C2B5"
  peach-border-strong: "#D9A493"
  tabbar: "color-mix(in srgb, var(--color-muted) 92%, transparent)"
  peach-tabbar: "#EFC5B7"
  scrim: "rgb(0 0 0 / 0.72)"
  peach-scrim: "rgb(74 42 34 / 0.38)"
  peach-bar: "#F0C0B0"

shadows:
  primary-graphite: "none"
  primary-peach: "0 1px 3px rgba(74,42,34,0.20), 0 1px 2px rgba(74,42,34,0.12)"
  popover-graphite: "0 10px 30px rgba(0,0,0,0.85), 0 0 0 1px rgba(20,40,30,0.9)"
  popover-peach: "0 8px 24px rgba(74,42,34,0.20), 0 2px 6px rgba(74,42,34,0.12)"

typography:
  amount-hero:
    fontFamily: Fira Code
    fontSize: 34px
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: -0.02em
  stat-hero:
    fontFamily: Fira Code
    fontSize: 34px
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: -0.03em
  stat-net:
    fontFamily: Fira Code
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0
  stat-value:
    fontFamily: Fira Code
    fontSize: 17px
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: 0
  title-bar:
    fontFamily: Fira Sans
    fontSize: 17px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: -0.01em
  body:
    fontFamily: Fira Sans
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  row-amount:
    fontFamily: Fira Code
    fontSize: 15px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0
  control:
    fontFamily: Fira Sans
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0
  section-heading:
    fontFamily: Fira Sans
    fontSize: 10px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0.14em
  supporting:
    fontFamily: Fira Sans
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  row-meta:
    fontFamily: Fira Sans
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0
  stat-label:
    fontFamily: Fira Sans
    fontSize: 10px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0.12em
  field-label:
    fontFamily: Fira Sans
    fontSize: 11px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0.08em
  tab-label:
    fontFamily: Fira Sans
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: 0.01em
  column-heading:
    fontFamily: Fira Sans
    fontSize: 10px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0.1em

rounded:
  xs: 2px
  sm: 6px
  md: 8px
  lg: 12px

spacing:
  space-0: 4px
  space-1: 8px
  space-2: 12px
  space-3: 16px
  space-4: 24px
  space-5: 32px
  space-6: 48px

components:
  title-bar:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.title-bar}"
    padding: 12px 16px
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    minHeight: 44px
  section:
    backgroundColor: transparent
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    borderTop: "1px solid {colors.border}"
    padding: 32px 0 0
    note: >
      Sections are divided by a rule and by space, not by a filled panel.
      Anything that used to sit on the card fill now sits on the page
      background, which is why the peach subtle, accent and destructive
      values were retuned — see the colour table.
  text-input:
    backgroundColor: "{colors.input}"
    textColor: "{colors.foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    minHeight: 44px
  amount-input:
    backgroundColor: "{colors.input}"
    textColor: "{colors.foreground}"
    typography: "{typography.amount-hero}"
    rounded: "{rounded.md}"
    minHeight: 64px
  segmented-option:
    backgroundColor: "{colors.input}"
    textColor: "{colors.foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    minHeight: 38px
  segmented-option-selected:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    minHeight: 38px
  tab-item:
    backgroundColor: "{colors.background}"
    textColor: "{colors.subtle}"
    typography: "{typography.tab-label}"
    minHeight: 56px
  tab-item-active:
    backgroundColor: "{colors.background}"
    textColor: "{colors.active}"
    typography: "{typography.tab-label}"
    minHeight: 56px
  ledger-row:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    minHeight: 44px
  budget-table:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.foreground}"
    typography: "{typography.supporting}"
    padding: 12px 4px
  legend-swatch:
    backgroundColor: "{colors.primary}"
    rounded: "{rounded.xs}"
    size: 10px
  bar-row:
    backgroundColor: "{colors.bar}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    padding: 12px
---

## Overview

Clengan is a local-only money tracker installed to a phone home screen. It has no server, no accounts, and no build step: the shipped artifact is hand-written HTML, CSS, and ES modules served by a cache-first service worker. Every design decision below follows from that, and from one fact about the product: the user opens it to type a number and leave.

The system ships **two tones the user switches in Settings**. They share one token vocabulary, so no rule outside the two `:root` blocks knows which tone is active. Tone A, graphite and brass, is the default. Tone B, peach room, was derived from a photographic reference the user supplied — a warm monochrome interior where the frame interior reads brighter than the wall, which is why cards in Tone B sit *lighter* than the canvas while cards in Tone A sit darker.

**Key characteristics:**
- **Two tones, one token set.** `--color-primary`, `--color-foreground`, and the rest resolve per tone. Consuming rules are token-only; there are no hardcoded colours below the palette blocks.
- **`--color-active` is split from `--color-primary`.** A fill dark enough to carry white label text is too dark to read as an 11px tab label. One token cannot do both jobs.
- **`--shadow-primary` is a token, not a constant.** Tone A's brass separates from graphite unaided and sets it to `none`; Tone B's pale fill on a pale card reaches only 1.5:1 and is lifted by a shadow instead.
- **The amount field is the tallest thing in the app** at 34px and 64px tall. Headings are 17px and below. This is an app, not a page.
- **Every figure is Fira Code with `tabular-nums`.** Columns of money must align.
- **Money displays as rupiah and stores as cents.** `formatIDR` renders `Rp 300.000` for the screen; `fromCents` renders `300000.00` for the Excel export, which the importer reads back. The two must never be swapped.
- **Colour means something or it is absent.** Green is income, red is spending or a warning, the accent is the primary action and the active tab. There is no decorative colour.
- **Depth is a three-step surface ladder plus hairline borders.** Canvas → card → input, no shadows except the one Tone B needs.

## Colours

### Tone A — carbon and volt (default)

The canvas is `#000000`, chosen for AMOLED: on an OLED panel those pixels are
switched off rather than lit dark grey, which is both the deepest black the
screen can make and the cheapest to display. Every surface above it is a
near-black carrying a green cast rather than a neutral grey — a warm-neutral
ladder underneath a green accent reads as two unrelated palettes stacked.

The accent is volt green `#00EB62`, pinned near the top of its range: a mid-green on true black reads as muted, because there is no lit surface near it to measure against. The sporty read comes from one colour
doing a single job loudly while everything else stays nearly invisible:
high-chroma green on true black is the whole contrast story, so no other
element needs to raise its voice. Spending stays a warm red `#F2543D`, which
does not collide with green the way it collided with the previous brass.

Two consequences worth naming. `--shadow-popover` cannot rely on a soft
shadow, because a gradient over `#000` is invisible; the popover is separated
by its own surface plus a hard edge. And `accent-color` is set at `:root`, so
native controls — radio bullets, checkboxes, spinners — paint in the tone
instead of the browser's blue, which was the only colour on screen coming
from outside the palette.

| Token | Value | Ratio | Use |
|---|---|---|---|
| `{colors.primary}` | #C8A15A | 7.4:1 on card | Primary button fill, bar leading edge, selected segment |
| `{colors.primary-hover}` | #D9B978 | | Hovered primary button |
| `{colors.on-primary}` | #1A1408 | 7.7:1 on primary | Label on the primary fill |
| `{colors.active}` | #D9B978 | | Active tab label and icon, focus ring |
| `{colors.accent}` | #4FA96B | 6.1:1 | Income figures, success status |
| `{colors.destructive}` | #DF6B60 | 5.4:1 | Spending figures, errors, negative remaining |
| `{colors.background}` | #0D0E10 | | Page canvas, tab bar |
| `{colors.foreground}` | #EDEEF0 | 15:1 | Body and figures |
| `{colors.muted}` | #17191C | | Card surface, file-button surface |
| `{colors.input}` | #1E2125 | | Form field surface |
| `{colors.subtle}` | #8B9099 | 6.1:1 | Section headings, row meta, inactive tabs, supporting copy |
| `{colors.border}` | #232629 | | Card and row hairlines |
| `{colors.border-strong}` | #3A3E44 | | Field borders, the rule above the savings row |

### Tone B — peach room

The canvas is `#F3CEC2`. The palette holds one hue family throughout; income green and spending red are both pulled toward it rather than sitting on top of it as foreign accents.

| Token | Value | Ratio | Use |
|---|---|---|---|
| `{colors.peach-primary}` | #D7B4AD | 1.5:1 on card | Primary button fill |
| `{colors.peach-primary-hover}` | #E0C2BC | | Hovered primary button |
| `{colors.peach-on-primary}` | #4A2A22 | 6.66:1 on primary | Label on the primary fill |
| `{colors.peach-active}` | #8E3A26 | 4.8:1 on the tab strip | Active tab label and icon |
| `{colors.peach-accent}` | #2D674C | 4.57:1 | Income figures |
| `{colors.peach-destructive}` | #9F3B29 | 4.60:1 | Spending figures, errors |
| `{colors.peach-background}` | #F3CEC2 | | Page canvas |
| `{colors.peach-foreground}` | #4A2A22 | 13:1 | Body and figures |
| `{colors.peach-muted}` | #F7DCD3 | | Card surface |
| `{colors.peach-input}` | #FBE8E1 | | Form field surface |
| `{colors.peach-subtle}` | #7E5144 | 4.58:1 | Section headings, row meta, supporting copy. Darkened when the card fill was removed: on the page background the old value fell to 3.96:1 |
| `{colors.peach-border}` | #E9C2B5 | | Card and row hairlines |
| `{colors.peach-border-strong}` | #D9A493 | | Field borders |
| `{colors.peach-tabbar}` | #EFC5B7 | | Tab strip, a step off the canvas |

**The one accepted contrast shortfall.** Tone B's button fill is 1.5:1 against the card, below the 3:1 WCAG floor for a non-text UI boundary. The user asked repeatedly for a light pink button, and no pink light enough to read as pink reaches 3:1 on a pale card. The button is therefore bounded by `--shadow-primary` rather than an outline, and its label carries identification at 6.66:1. This is a documented, deliberate exception, not an oversight — it is the only one in the system.

## Typography

### Families

- **Fira Sans** — self-hosted variable WOFF2 at `vendor/fira-sans.woff2`, weight range 300–700. Every piece of UI text.
- **Fira Code** — self-hosted variable WOFF2 at `vendor/fira-code.woff2`, weight range 400–700. Every figure, always with `font-variant-numeric: tabular-nums`.

Both are in the service worker shell, so the app renders in its own type offline. Neither loads from a CDN.

### Ramp

This is an app ramp, not a marketing ramp. The largest step belongs to a data figure, not a heading.

| Token | Size | Weight | Tracking | Use |
|---|---|---|---|---|
| `{typography.stat-net}` | 40px | 700 | -1.5px | The month's net, the one number on the Summary fold |
| `{typography.amount-hero}` | 34px | 500 | -0.02em | The Add form's amount field |
| `{typography.stat-value}` | 20px | 500 | 0 | Income and spent totals |
| `{typography.title-bar}` | 17px | 600 | -0.01em | Sticky view title |
| `{typography.body}` | 16px | 400 | 0 | Body, row titles, form values |
| `{typography.row-amount}` | 15px | 500 | 0 | Amount on a ledger row |
| `{typography.control}` | 14px | 400 | 0 | Inputs, buttons, status lines |
| `{typography.section-heading}` | 13px | 500 | 0.06em | Card headings, uppercase |
| `{typography.supporting}` | 13px | 400 | 0 | Hints, budget note, budget figures |
| `{typography.row-meta}` | 12px | 400 | 0 | Date, account and note beneath a row title |
| `{typography.stat-label}` | 12px | 500 | 0.08em | Stat labels, uppercase |
| `{typography.tab-label}` | 11px | 400 | 0.01em | Tab bar labels |
| `{typography.column-heading}` | 11px | 500 | 0.04em | Budget table column headings, uppercase |

### Principles

- **Figures never fall back to the UI face.** Any element showing money carries `.amount`, which sets Fira Code and tabular numerals.
- **Positive tracking marks taxonomy.** The three uppercase steps — section heading, stat label, column heading — track positive. Everything else tracks zero or negative.
- **17px is the ceiling for text.** Anything larger in this system is a number.
- **Two steps at 13px and two at 11px** differ by weight and case, not size. Adding a size step to separate them would be the wrong fix.

## Layout

### Spacing

Base unit 4px. Tokens run `{spacing.space-0}` 4px through `{spacing.space-6}` 48px.

Card interior padding is `{spacing.space-4}` 24px. View padding is `{spacing.space-4}` vertical and `{spacing.space-2}` 12px horizontal. The budget table tightens its column padding to 4px because four money columns have to clear 375px; anything roomier pushes the last column off the screen edge.

### Container

`.view` is `max-width: 620px; margin: 0 auto`. The app is phone-first, but a laptop should not get 1400px-wide inputs.

`body` carries `padding-bottom: 88px` to clear the fixed tab bar.

### Title bar

The `h1` is a sticky bar, not a display heading. The tab bar already names the view, so the title stays out of the way and lets content own the fold. It is a flex row: the view name on the left, and a right slot that carries live context — the running account total on Add. A bar that only repeats the highlighted tab label has not earned its space.

## Elevation and depth

| Level | Treatment | Use |
|---|---|---|
| 0 | `{colors.background}`, no border | Canvas, tab bar, ledger rows at rest |
| 1 | `{colors.muted}` + 1px `{colors.border}` | Cards |
| 2 | `{colors.input}` + 1px `{colors.border-strong}` | Form fields inside a card |
| Focus | 2px `{colors.active}` outline, 2px offset | Any focused control |

Depth is surface plus hairline. There are exactly two shadow tokens, and no
rule may cast a shadow that is not one of them.

`--shadow-primary` is `none` in Tone A and a two-layer contact-plus-diffusion
shadow in Tone B, where it is the only thing marking the primary button's edge.

`--shadow-popover` is for a layer that genuinely floats above the page — today
only the calendar. It is defined in both tones because a resting surface and a
floating one are different problems: Tone A needs a cast shadow here even
though it needs none at rest. Both are tinted from the tone's own foreground,
never black. A black cast on peach reads grey and drains the hue out of the
surface beneath it.

## Components

**`title-bar`** — Sticky, `backdrop-filter: blur(12px)` over an 88%-opaque canvas, 1px bottom border. Flex row, `justify-content: space-between`, baseline aligned. The right slot hides itself when empty via `:empty`.

**`button-primary`** — `{colors.primary}` fill, `{colors.on-primary}` label, no border, `{rounded.md}`, `min-height: 44px`, full width inside a form. Carries `--shadow-primary`. The pressed state is `filter: brightness(0.92)`, which works in both tones without a second token.

**`card`** — `{colors.muted}` on canvas, 1px `{colors.border}`, `{rounded.lg}` 12px, 24px padding. Cards are never nested.

**`amount-input`** — The Add form's first field and the tallest control in the app: `min-height: 64px`, 34px Fira Code. `inputmode="decimal"` so phones open the number pad.

**`segmented-option`** — The expense / income / transfer radio group, rendered as three labels. The checked one uses `:has(input:checked)` to take the primary fill plus `--shadow-primary`.

**`tab-item`** — Four fixed items, flex column, icon over label, `min-height: 56px`, `max-width: 155px` each. Icons are inline Lucide SVG at 20px, stroke 1.75, one consistent weight. The active item is marked by `aria-current="page"` and takes `{colors.active}`.

**`ledger-row`** — `min-height: 44px`, `{rounded.md}`, title over meta on the left, amount right, delete button at the end. Hover lifts to `{colors.muted}`.

**`pie`** — Spending share on Summary, capped at 240px because a pie gains
nothing from being wider than it is tall. Slices are one hue: the largest takes
`{colors.primary}` at full strength and each smaller one steps toward
`{colors.muted}` behind it, expressed as `color-mix` over the tokens so the
chart follows a tone switch at paint time with no JavaScript. Receding toward
the card reads as "less" in both tones, which a lightness ramp cannot do — on
graphite the pale end advances, on peach it recedes. Slices carry a 1px stroke
in the card colour so neighbours in a single-hue ramp do not bleed together.
The chart has no labels; the category table beneath it carries a
`legend-swatch` per row and serves as the legend.

**`select`** — Every picker in the app. Never a `datalist`-backed input: a
datalist gives no visible sign a list exists and silently accepts anything
typed, which is how one account became two. `appearance: none` plus a
`currentColor` chevron, because the platform arrow renders black and vanishes
on the graphite tone.

**`date-field`** — Full width on a phone, capped near 280px above 520px. The
native calendar popup sizes to its own content and cannot be styled, so above
phone width the field comes down to meet the popup rather than floating twice
as wide above it. A phone opens a full-screen picker with no relationship to
the field, where a short field is just out of line with its siblings.

**`bar-row`** — Category spending rows. Two stacked linear gradients: a 2px solid leading edge in `{colors.primary}`, and a translucent `{colors.bar}` fill to the row's `--bar` percentage. The translucent fill keeps the label legible instead of sitting on a flat block.

**`budget-table`** — Four columns: bucket, budget, spent, left. Unlike the category bars, its `thead` stays visible because four columns of numbers need their headings. Figures drop to 13px and column padding to 4px to clear 375px. The fill shows how much of a bucket is gone and saturates at full width rather than overflowing when a bucket is overspent. The savings row suppresses its bar and takes a `{colors.border-strong}` top rule, because nothing is charged against savings.

## Do's and don'ts

### Do

- Add colours as tokens in **both** `:root` blocks. A rule that names a hex directly has broken the tone switch.
- Give any element showing money the `.amount` class.
- Measure a new colour against the surface it actually sits on, in the browser, not against an assumed one.
- Keep tap targets at 44px or more.
- Use inline Lucide SVG at one stroke weight for icons.
- Bump `CACHE` in `sw.js` whenever a shell file changes, and add new shell files to `SHELL`.

### Don't

- Don't use `--color-primary` as a small-text colour. That is what `--color-active` is for.
- Don't reach for `--color-destructive` decoratively. Red means spending, an error, or a figure the user cannot reconcile.
- Don't add a size step to separate two roles that differ by weight or case.
- Don't nest cards.
- Don't let a heading exceed 17px. Numbers may; text may not.
- Don't cast a shadow that is not `--shadow-primary` or `--shadow-popover`. Depth here is surface and hairline; a literal rgba shadow will be the wrong colour in one of the two tones.
- Don't put `formatIDR` output anywhere a machine reads it. The export column is `fromCents`, and the importer parses its own output.
- Don't reach for a `datalist`. If a field offers a list, it is a `select`.
- Don't give a chart a categorical palette. One hue, stepping toward the card.

## Responsive behaviour

The layout is a single column at every width; `.view` caps at 620px and centres. There are no breakpoints, because there is nothing that needs to reflow — the only width-sensitive component is the budget table, which is sized to clear 375px and simply gets roomier above it.

Tap targets: controls hold 44px, tab items 56px, the amount field 64px.

## Known gaps

- Tone B's primary button is 1.5:1 against its card, below the 3:1 non-text floor. Documented above as a deliberate, user-directed exception carried by a shadow and a 6.66:1 label.
- Hover states are unverified on a real device. The agent browser pane runs hidden, so CSS transitions never complete and `getComputedStyle` returns the pre-transition value indefinitely. Tab and button states are worth a glance on a phone.
- There is no loading state anywhere. Every read is IndexedDB on the local device and completes within a frame.
- Motion is absent by choice. The app is opened to type a number and leave; an entrance animation would be in the way.
