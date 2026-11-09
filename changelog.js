// What changed, version by version, as Settings → App version shows it.
//
// Newest first, and the first entry must name the CACHE in sw.js:
// test/changelog.test.js fails otherwise, so a version cannot ship without
// saying what it brought. Write the notes for the people using the app, in
// their words, not in commit-message words.

export const RELEASES = [
  {
    version: 'clengan-v142',
    date: '2026-11-09',
    notes: [
      'Until your first backup, the backup reminder on Add is a single line, so the form comes first.',
      'Settings: the names beside the icons are bigger, and the page with the PIN and amount hiding is now called Privacy.',
    ],
  },
  {
    version: 'clengan-v141',
    date: '2026-11-05',
    notes: [
      'Settings → Budget reads shorter. Your savings funds are listed first, with the form to add or change one below them.',
    ],
  },
  {
    version: 'clengan-v140',
    date: '2026-11-05',
    notes: [
      'When one card shows its amounts, the eye in the title bar now opens in grey to say some amounts are showing. Tapping it then hides them all.',
    ],
  },
  {
    version: 'clengan-v139',
    date: '2026-11-04',
    notes: [
      'Every slice of the spending ring is now easy to see in the rose tone too, and Other is drawn as a thinner ring.',
    ],
  },
  {
    version: 'clengan-v138',
    date: '2026-11-04',
    notes: [
      'You can choose to have amounts shown when the app opens (Settings → Privacy). They stay hidden by default, and always while a PIN is set.',
      'A transfer now shows as one row in the List, from one account to the other.',
      'Settings has five pages instead of eleven: Money, Budget, Look & privacy, Data and About.',
    ],
  },
  {
    version: 'clengan-v137',
    date: '2026-11-04',
    notes: [
      'After you tap Later once, the backup reminder on Add shrinks to one line. It still shows until you back up.',
      'The slices of the spending ring are easier to tell apart.',
      'Budget settings now live in one place: the Budget card has an Edit budget button that opens Settings → Budget split, where you can also set category limits for any month.',
    ],
  },
  {
    version: 'clengan-v136',
    date: '2026-11-04',
    notes: [
      'Screen readers now announce each pop-up by its title.',
      'The arrows for reordering accounts are bigger and easier to tap.',
    ],
  },
  {
    version: 'clengan-v135',
    date: '2026-11-04',
    notes: [
      'In the Rose room theme, Save is a deeper pink with a fine edge, so it no longer looks switched off.',
    ],
  },
  {
    version: 'clengan-v134',
    date: '2026-11-03',
    notes: [
      'Buttons are bigger and easier to tap.',
      'When editing an entry, Delete now sits on the far left, away from Save.',
      'After deleting an entry, tap Undo within a few seconds to bring it back exactly as it was.',
    ],
  },
  {
    version: 'clengan-v133',
    date: '2026-11-03',
    notes: [
      'Editing an entry now uses the same calendar as the Add screen, with dates like "26 Nov 2026", and the calendar opens upward so it is never cut off.',
    ],
  },
  {
    version: 'clengan-v132',
    date: '2026-11-03',
    notes: [
      'In Category limits, the "No limit" hint uses the normal font; amounts you type keep the number font.',
    ],
  },
  {
    version: 'clengan-v131',
    date: '2026-11-03',
    notes: [
      'More groundwork for syncing, which is still not switched on: a long history now uploads in parts instead of failing, and you will be able to delete your sync account.',
    ],
  },
  {
    version: 'clengan-v130',
    date: '2026-11-03',
    notes: [
      'Groundwork for syncing between your devices, which is not switched on yet: it now keeps every entry and the newest edit when two devices change the same thing.',
    ],
  },
  {
    version: 'clengan-v129',
    date: '2026-11-03',
    notes: [
      'The small grey line under each entry is easier to read: words use the normal font, and only amounts keep the number font.',
      'In Settings, an account\'s starting balance no longer splits "Rp" from the amount.',
    ],
  },
  {
    version: 'clengan-v128',
    date: '2026-10-30',
    notes: [
      'If another copy of the app has just updated how your records are stored, a save now tells you to close and reopen the app instead of showing a technical error.',
    ],
  },
  {
    version: 'clengan-v127',
    date: '2026-10-13',
    notes: [
      'After you save spending in a category with a limit, the Add screen says how much of that limit is left this month, or how far over you are.',
      'Saving no longer fails with "the database connection is closing" after the app has sat in the background. It now reconnects on its own.',
      'The backup reminder now comes every week instead of every month, and "Later" puts it off for 3 days instead of a week.',
    ],
  },
  {
    version: 'clengan-v126',
    date: '2026-10-13',
    notes: [
      'Give any spending category a monthly limit: tap Category limits on the Budget card in Summary. A limit carries on into later months until you change it.',
    ],
  },
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
