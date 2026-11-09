// Settings as one page at a time, picked from a rail of every section.
//
// The rail is built from the sections themselves, so it cannot drift from
// them. The search reads everything a section says — headings, labels, hints,
// the rows in its lists, the options in its dropdowns — because "where do I
// change the fixed share" is answered by a label three levels inside a page,
// not by any section's name.

const STORE_KEY = 'clengan-setting';

const sections = () => [...document.querySelectorAll('.setting:not(.setting--off)')];
const keyOf = (section) => section.id.replace(/^setting-/, '');

// The elements a match is shown on: the smallest ones that carry words. A
// paragraph that contains a matching label is not marked as well.
const HIT_TARGETS = 'h2, h3, label, p, li, button:not(.pick__option):not(.rail__item), .tile__state';

// Text marked data-nosearch is about other things (the version page's list
// of what changed names half the app) and would match every query.
const ownText = (section) => [...section.querySelectorAll('[data-nosearch]')]
  .reduce((text, skip) => text.replace(skip.textContent, ' '), section.textContent);

function words(section) {
  const extra = [...section.querySelectorAll('input[placeholder], [aria-label]')]
    .map((el) => `${el.getAttribute('placeholder') ?? ''} ${el.getAttribute('aria-label') ?? ''}`);
  // The rail's short name counts too: the rail says "Theme" for Appearance,
  // and someone searching for the word they can see should find it.
  return `${section.dataset.short} ${ownText(section)} ${extra.join(' ')}`.toLowerCase();
}

// Eleven pages was too many to scan, so the rail offers five, each showing
// its sections stacked. A section left out of every group (a new one) gets a
// page of its own rather than disappearing.
const GROUPS = [
  { key: 'money', title: 'Money', sections: ['accounts', 'categories', 'recurring'] },
  { key: 'budget', title: 'Budget', sections: ['split', 'funds'] },
  { key: 'look', title: 'Privacy & look', short: 'Privacy', sections: ['appearance', 'pin'] },
  { key: 'data', title: 'Data', sections: ['io', 'planner', 'sample'] },
  { key: 'about', title: 'About', sections: ['version'] },
];

export function initSettings() {
  const rail = document.getElementById('settings-rail');
  const search = document.getElementById('settings-search');
  const hits = document.getElementById('settings-hits');
  let current = null;

  const all = sections();
  const byKey = new Map(all.map((section) => [keyOf(section), section]));
  const grouped = new Set(GROUPS.flatMap((g) => g.sections));
  const pages = [
    ...GROUPS.map((g) => ({ ...g, sections: g.sections.map((k) => byKey.get(k)).filter(Boolean) })),
    ...all.filter((section) => !grouped.has(keyOf(section))).map((section) => ({
      key: keyOf(section), title: section.querySelector('h2').textContent, short: section.dataset.short, sections: [section],
    })),
  ].filter((page) => page.sections.length);
  // A section's own key (settingsNav.select('split')) opens its page.
  const pageOf = new Map(pages.flatMap((page) => page.sections.map((section) => [keyOf(section), page.key])));

  const items = new Map(pages.map((page) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'rail__item';
    item.setAttribute('aria-controls', page.sections.map((section) => section.id).join(' '));
    const icon = page.sections[0].querySelector('.setting__head .tile__icon').cloneNode(true);
    const short = document.createElement('span');
    short.className = 'rail__short';
    short.textContent = page.short ?? page.title;
    const full = document.createElement('span');
    full.className = 'rail__full';
    full.textContent = page.title;
    item.append(icon, short, full);
    item.addEventListener('click', () => {
      select(page.key);
      // On a phone the page starts above the fold; bring its top into view.
      if (page.sections[0].getBoundingClientRect().top < 0) page.sections[0].scrollIntoView({ block: 'start' });
    });
    rail.append(item);
    return [page.key, { ...page, item }];
  }));

  function clearHits() {
    for (const el of document.querySelectorAll('.setting .is-hit')) el.classList.remove('is-hit');
  }

  function markHits(page, query) {
    clearHits();
    if (!query) return;
    const matching = page.sections.flatMap((section) => [...section.querySelectorAll(HIT_TARGETS)])
      .filter((el) => !el.closest('.pick__list, [data-nosearch]') && el.textContent.toLowerCase().includes(query));
    const smallest = matching.filter((el) => !matching.some((other) => other !== el && el.contains(other)));
    for (const el of smallest) el.classList.add('is-hit');
    smallest[0]?.scrollIntoView({ block: 'nearest' });
  }

  function select(key) {
    const entry = items.get(pageOf.get(key) ?? key) ?? items.values().next().value;
    // Only a change of page made on screen slides in; a page chosen while
    // Settings is hidden arrives with the view's own slide instead. Removed
    // when it ends (or is cut short by leaving the tab), so the class is never
    // still there to replay the slide when the Settings view reappears.
    if (current && current !== entry && !rail.closest('.view').hidden) {
      for (const section of entry.sections) {
        const done = (event) => {
          if (event.target !== section) return;
          section.classList.remove('is-opening');
          section.removeEventListener('animationend', done);
          section.removeEventListener('animationcancel', done);
        };
        section.addEventListener('animationend', done);
        section.addEventListener('animationcancel', done);
        section.classList.add('is-opening');
      }
    }
    current = entry;
    for (const page of items.values()) {
      const on = page === entry;
      for (const section of page.sections) section.hidden = !on;
      if (on) page.item.setAttribute('aria-current', 'page');
      else page.item.removeAttribute('aria-current');
    }
    try { localStorage.setItem(STORE_KEY, entry.key); } catch { /* private mode */ }
    markHits(entry, search.value.trim().toLowerCase());
  }

  // Every rail item stays: a page that does not match is dimmed, not
  // removed, so the rail never changes shape under the thumb.
  const pageWords = (page) => `${page.title} ${page.sections.map(words).join(' ')}`.toLowerCase();
  function runSearch() {
    const query = search.value.trim().toLowerCase();
    if (!query) {
      for (const { item } of items.values()) item.classList.remove('is-dim');
      hits.textContent = '';
      clearHits();
      return;
    }
    const matches = [...items.values()].filter((page) => pageWords(page).includes(query));
    for (const page of items.values()) page.item.classList.toggle('is-dim', !matches.includes(page));
    hits.textContent = matches.length
      ? `${matches.length} page${matches.length === 1 ? ' mentions' : 's mention'} "${search.value.trim()}"`
      : `Nothing in Settings mentions "${search.value.trim()}"`;
    if (matches.length && !matches.includes(current)) select(matches[0].key);
    else markHits(current, query);
  }
  search.addEventListener('input', runSearch);

  let saved = null;
  try { saved = localStorage.getItem(STORE_KEY); } catch { /* private mode */ }
  select(saved ?? 'money');

  return { select };
}
