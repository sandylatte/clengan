// What changed, version by version, as Settings → App version shows it.
//
// Newest first, and the first entry must name the CACHE in sw.js:
// test/changelog.test.js fails otherwise, so a version cannot ship without
// saying what it brought. Write the notes for the people using the app, in
// their words, not in commit-message words.

export const RELEASES = [
  {
    version: 'clengan-v125',
    date: '2026-10-06',
    notes: [
      'Three more category colours: Azure, Mauve and Slate.',
      'This page now shows when the app was last updated and what changed.',
    ],
  },
  {
    version: 'clengan-v124',
    date: '2026-10-06',
    notes: [
      'In the calendar, tap the month or the year to jump straight to it.',
      'The open page in Settings is marked more quietly.',
    ],
  },
  {
    version: 'clengan-v123',
    date: '2026-10-06',
    notes: ['Savings by fund is one bar for the split and a table of this month and this year.'],
  },
  {
    version: 'clengan-v122',
    date: '2026-10-06',
    notes: ['Small visual tidy-up; nothing to learn.'],
  },
  {
    version: 'clengan-v121',
    date: '2026-10-06',
    notes: ['Buttons use the app’s own font and rounded corners again, and every button in Settings is styled.'],
  },
  {
    version: 'clengan-v120',
    date: '2026-10-06',
    notes: [
      'Filter the List by category and by account; the total at the top follows what is listed.',
      'Each Summary card and the List rows have their own eye; the one in the title bar shows or hides everything.',
      'An optional PIN before amounts are shown (Settings → PIN for amounts).',
    ],
  },
  {
    version: 'clengan-v119',
    date: '2026-10-06',
    notes: [
      'The spending chart is calmer: one colour, the four biggest categories, and the rest as Other.',
      'The Budget card leads with what is left (or over) in each bucket.',
    ],
  },
  {
    version: 'clengan-v118',
    date: '2026-10-06',
    notes: ['Sample data covers six months across four accounts.'],
  },
  {
    version: 'clengan-v117',
    date: '2026-10-06',
    notes: ['Every tab slides in the same way, and popups and month changes animate.'],
  },
  {
    version: 'clengan-v116',
    date: '2026-10-06',
    notes: ['The title bars show this month’s net; the spending chart became a ring with percentages.'],
  },
  {
    version: 'clengan-v115',
    date: '2026-10-06',
    notes: ['Amounts are hidden until you tap the eye in a title bar.'],
  },
  {
    version: 'clengan-v114',
    date: '2026-10-06',
    notes: ['Settings became a list of pages with search; the app has its own dropdowns and month picker.'],
  },
];
