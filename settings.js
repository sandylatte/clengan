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

function words(section) {
  const extra = [...section.querySelectorAll('input[placeholder], [aria-label]')]
    .map((el) => `${el.getAttribute('placeholder') ?? ''} ${el.getAttribute('aria-label') ?? ''}`);
  // The rail's short name counts too: the rail says "Theme" for Appearance,
  // and someone searching for the word they can see should find it.
  return `${section.dataset.short} ${section.textContent} ${extra.join(' ')}`.toLowerCase();
}

export function initSettings() {
  const rail = document.getElementById('settings-rail');
  const search = document.getElementById('settings-search');
  const hits = document.getElementById('settings-hits');
  let current = null;

  const items = new Map(sections().map((section) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'rail__item';
    item.setAttribute('aria-controls', section.id);
    const icon = section.querySelector('.setting__head .tile__icon').cloneNode(true);
    const short = document.createElement('span');
    short.className = 'rail__short';
    short.textContent = section.dataset.short;
    const full = document.createElement('span');
    full.className = 'rail__full';
    full.textContent = section.querySelector('h2').textContent;
    item.append(icon, short, full);
    item.addEventListener('click', () => {
      select(keyOf(section));
      // On a phone the page starts above the fold; bring its top into view.
      if (section.getBoundingClientRect().top < 0) section.scrollIntoView({ block: 'start' });
    });
    rail.append(item);
    return [keyOf(section), { section, item }];
  }));

  function clearHits() {
    for (const el of document.querySelectorAll('.setting .is-hit')) el.classList.remove('is-hit');
  }

  function markHits(section, query) {
    clearHits();
    if (!query) return;
    const matching = [...section.querySelectorAll(HIT_TARGETS)]
      .filter((el) => !el.closest('.pick__list') && el.textContent.toLowerCase().includes(query));
    const smallest = matching.filter((el) => !matching.some((other) => other !== el && el.contains(other)));
    for (const el of smallest) el.classList.add('is-hit');
    smallest[0]?.scrollIntoView({ block: 'nearest' });
  }

  function select(key) {
    const entry = items.get(key) ?? items.values().next().value;
    // Only a change of page made on screen slides in; a page chosen while
    // Settings is hidden arrives with the view's own slide instead. Removed
    // when it ends (or is cut short by leaving the tab), so the class is never
    // still there to replay the slide when the Settings view reappears.
    if (current && current !== entry && !rail.closest('.view').hidden) {
      const { section } = entry;
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
    current = entry;
    for (const { section, item } of items.values()) {
      const on = section === entry.section;
      section.hidden = !on;
      if (on) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    }
    try { localStorage.setItem(STORE_KEY, keyOf(entry.section)); } catch { /* private mode */ }
    markHits(entry.section, search.value.trim().toLowerCase());
  }

  // Every rail item stays: a section that does not match is dimmed, not
  // removed, so the rail never changes shape under the thumb.
  function runSearch() {
    const query = search.value.trim().toLowerCase();
    if (!query) {
      for (const { item } of items.values()) item.classList.remove('is-dim');
      hits.textContent = '';
      clearHits();
      return;
    }
    const matches = [...items.values()].filter(({ section }) => words(section).includes(query));
    for (const { section, item } of items.values()) {
      item.classList.toggle('is-dim', !matches.some((m) => m.section === section));
    }
    hits.textContent = matches.length
      ? `${matches.length} section${matches.length === 1 ? ' mentions' : 's mention'} "${search.value.trim()}"`
      : `Nothing in Settings mentions "${search.value.trim()}"`;
    if (matches.length && !matches.includes(current)) select(keyOf(matches[0].section));
    else markHits(current.section, query);
  }
  search.addEventListener('input', runSearch);

  let saved = null;
  try { saved = localStorage.getItem(STORE_KEY); } catch { /* private mode */ }
  select(saved && items.has(saved) ? saved : 'accounts');

  return { select };
}
