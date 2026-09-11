// Rules that describe a payment that repeats, and the arithmetic that decides
// which of them are owed. Nothing here writes: it takes the rules and today's
// date and returns the rows that WOULD be filed, so the caller can put them in
// front of the user first. A rule that silently wrote to the ledger would mean
// a wrong rule quietly corrupting months of history, discovered at export.

const DAYS_IN_MONTH = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

// A rule set to the 31st still has to happen in February. Clamping to the last
// day of the short month is what a bank does with a standing order, and it
// keeps one occurrence per month — skipping would quietly lose the payment.
export function occurrenceDate(month, day) {
  const [year, monthNumber] = month.split('-').map(Number);
  const clamped = Math.min(Math.max(1, day), DAYS_IN_MONTH(year, monthNumber));
  return `${month}-${String(clamped).padStart(2, '0')}`;
}

export function nextMonth(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return monthNumber === 12
    ? `${year + 1}-01`
    : `${year}-${String(monthNumber + 1).padStart(2, '0')}`;
}

// Two years. A rule whose last_run is older than that has been dormant through
// an uninstall or a restore from an ancient backup, and filing two dozen months
// of guessed history is worse than filing none — the user still has the real
// rows in whatever they were using instead.
const MAX_CATCHUP_MONTHS = 24;

// The window runs BACK from today, not forward from last_run. Walking forward
// from a decade-dormant rule would file two dozen rows dated 2015 — real money
// rows, on dates the user cannot recognise, ahead of the months they actually
// care about.
function earliestCatchup(today) {
  const [year, month] = today.slice(0, 7).split('-').map(Number);
  const index = year * 12 + (month - 1) - (MAX_CATCHUP_MONTHS - 1);
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

// A rule that has never run starts THIS month, not at some imagined beginning.
// Backfilling a new rule's history would invent transactions that never
// happened, which is the one thing a ledger must not contain.
export function dueOccurrences(rules, today) {
  const thisMonth = today.slice(0, 7);
  const floor = earliestCatchup(today);
  const due = [];
  for (const rule of rules) {
    if (rule.active === false) continue;
    let month = rule.last_run ? nextMonth(rule.last_run) : thisMonth;
    if (month < floor) month = floor;
    while (month <= thisMonth) {
      const date = occurrenceDate(month, rule.day);
      // Not yet reached in the current month: a rule for the 25th is not owed
      // on the 3rd. Earlier months are always owed in full.
      if (date <= today) due.push({ rule, date });
      month = nextMonth(month);
    }
  }
  return due.sort((a, b) => a.date.localeCompare(b.date));
}

// What each rule's last_run becomes once these occurrences are filed: the
// month of its own last one, never a shared "now". Derived here rather than in
// the caller so the rule that decides what is owed and the rule that records
// what was paid can never drift apart.
export function runStamps(due) {
  const stamps = new Map();
  for (const { rule, date } of due) {
    const month = date.slice(0, 7);
    if (!stamps.has(rule.id) || stamps.get(rule.id) < month) stamps.set(rule.id, month);
  }
  return [...stamps];
}

// The row a due occurrence becomes. The note carries the rule's own note, not
// a marker: a row filed from a rule is an ordinary transaction once it exists,
// editable and deletable like any other, and tying it back to a rule would
// make deleting the rule ambiguous about the history it produced.
export function occurrenceToRow({ rule, date }, id) {
  return {
    id,
    date,
    account: rule.account,
    amount: rule.amount,
    name: rule.name ?? '',
    category: rule.category ?? '',
    bucket: rule.bucket ?? null,
    transfer_id: null,
    note: rule.note ?? '',
  };
}
