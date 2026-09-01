import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Three times now a literal colour has reached styles.css and been the wrong
// colour in one of the two tones: a black button shadow, a black popover
// shadow, a black dialog scrim. DESIGN.md has stated the rule in prose the
// whole time. Prose did not hold, so this does.
//
// The rule: every literal colour and shadow in the stylesheet must be
// declared in DESIGN.md. Values inside the two :root palette blocks are the
// declarations themselves; anything below them is a rule consuming a value,
// and a consuming rule that names a colour directly cannot follow a tone.

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const design = readFileSync(new URL('../DESIGN.md', import.meta.url), 'utf8');
const frontMatter = design.split('---')[1];

const COLOUR = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![\w-])|rgba?\([^)]*\)/g;
const squash = (value) => value.replace(/\s+/g, '').toLowerCase();

// Everything from here down is a rule consuming a value, never declaring one.
const consumingRules = css.slice(css.indexOf('* { box-sizing'));

// Membership in DESIGN.md is not enough, and a mutation proved it: hardcoding
// the graphite scrim passed, because the graphite value is of course
// documented, while still painting black over the peach tone. The rule has to
// be positional. A literal below the palette blocks is wrong whatever its
// value, because it cannot change when the tone does.
test('no rule outside the palette blocks names a colour', () => {
  const literals = [...consumingRules.matchAll(COLOUR)].map((m) => m[0]);
  assert.deepEqual(
    literals,
    [],
    'colour literals found outside :root. Declare a token in BOTH tones and use var(), '
    + 'or this will be the wrong colour in one of them.',
  );
});

test('every colour declared in the palette is recorded in DESIGN.md', () => {
  const documented = new Set([...frontMatter.matchAll(COLOUR)].map((m) => squash(m[0])));
  const palette = css.slice(0, css.indexOf('* { box-sizing'));
  const undocumented = new Set();
  for (const match of palette.matchAll(COLOUR)) {
    if (!documented.has(squash(match[0]))) undocumented.add(match[0]);
  }
  assert.deepEqual([...undocumented], [], 'palette values missing from DESIGN.md');
});

test('both tones declare every token the other does', () => {
  const block = (selector) => {
    const start = css.indexOf(selector);
    assert.notEqual(start, -1, `${selector} not found`);
    return css.slice(start, css.indexOf('}', start));
  };
  const names = (text) => new Set([...text.matchAll(/(--[a-z-]+):/g)].map((m) => m[1]));

  const graphite = names(block(':root {'));
  const peach = names(block(':root[data-theme="peach"] {'));
  // Graphite also carries the space, radius and font scales, which are tone
  // independent and correctly declared once.
  const shared = [...graphite].filter((n) => n.startsWith('--color') || n.startsWith('--shadow'));

  assert.deepEqual(
    shared.filter((n) => !peach.has(n)),
    [],
    'tokens defined for graphite but not peach: peach would inherit the graphite value',
  );
});

test('no rule outside the palette blocks casts a literal shadow', () => {
  const body = css.slice(css.indexOf('* { box-sizing'));
  const literal = [...body.matchAll(/box-shadow:\s*([^;]+);/g)]
    .map((m) => m[1].trim())
    .filter((value) => !value.startsWith('var(') && !value.startsWith('inset') && value !== 'none');
  assert.deepEqual(literal, [], 'shadows must come from --shadow-primary or --shadow-popover');
});

// The Ledger direction removed the card fill, and every label that had been
// sitting on it moved onto the page background. Peach's --color-subtle was
// 5.4:1 on the card and 3.96:1 on the page — still readable-looking, and
// below AA. Nothing in the stylesheet noticed, because the token had not
// changed; the surface under it had.
//
// So the rule is checked against the surface text ACTUALLY sits on.
const luminance = (hex) => {
  const channel = (pair) => {
    const c = parseInt(pair, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

function tokensOf(selector) {
  const start = css.indexOf(selector);
  const block = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries(
    [...block.matchAll(/(--[a-z-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)].map((m) => [m[1], m[2]]),
  );
}

for (const [tone, selector] of [['graphite', ':root {'], ['peach', ':root[data-theme="peach"] {']]) {
  test(`${tone} text tokens clear 4.5:1 on the page background`, () => {
    const token = tokensOf(selector);
    const page = token['--color-background'];
    // Every one of these paints text directly on the page now that sections
    // are separated by rules rather than by a fill.
    for (const name of ['--color-foreground', '--color-subtle', '--color-accent', '--color-destructive']) {
      const ratio = contrast(token[name], page);
      assert.ok(
        ratio >= 4.5,
        `${tone} ${name} (${token[name]}) is ${ratio.toFixed(2)}:1 on ${page}, needs 4.5:1`,
      );
    }
  });
}
