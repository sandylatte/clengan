// A date picker in the app's own tokens.
//
// The native <input type="date"> popup is browser chrome: it sizes itself, it
// ignores the field's width, and no stylesheet can reach it. Narrowing the
// field to meet it helped on a laptop and did nothing on a phone, so the
// control is built here instead and matches every other picker in the app.

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
// The trigger button is half a phone wide now, and "12 September 2026" wraps
// to two lines there — taller than the select beside it. Three letters is
// still unambiguous; the popup's own heading keeps the full name.
const SHORT = MONTHS.map((month) => month.slice(0, 3));

export const toISO = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

// Parsed as local time on purpose. new Date('2026-08-01') is UTC midnight,
// which is the previous day for anyone west of Greenwich and would show the
// wrong cell selected.
export function fromISO(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text ?? ''));
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const date = new Date(y, m - 1, d);
  return date.getMonth() === m - 1 ? date : null;
}

export function formatDate(date) {
  return `${date.getDate()} ${SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

// Monday-first, and always six rows. A grid that changes height as you page
// through months makes the buttons move under the pointer.
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - offset);
  return Array.from({ length: 42 }, (_, i) => new Date(
    start.getFullYear(), start.getMonth(), start.getDate() + i,
  ));
}

// Twelve years around the one given, paged by twelve: enough to reach any
// year someone is likely to be filing in, in a grid the month picker's size.
export const yearPage = (year) => Array.from({ length: 12 }, (_, i) => year - 6 + i);

// The heading row every popup here shares: ‹, whatever sits between, ›.
export function calendarHead(middle, { onPrevious, onNext, previousLabel, nextLabel }) {
  const nav = (text, label, onClick) => {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'calendar__nav';
    node.textContent = text;
    node.setAttribute('aria-label', label);
    node.addEventListener('click', onClick);
    return node;
  };
  const head = document.createElement('div');
  head.className = 'calendar__head';
  const centre = document.createElement('span');
  centre.className = 'calendar__label';
  centre.append(...middle);
  head.append(nav('‹', previousLabel, onPrevious), centre, nav('›', nextLabel, onNext));
  return head;
}

// A word in the heading that opens its own picker: the month name opens the
// twelve months, the year opens a page of years. Paging one month at a time
// to reach last year's receipt was twelve taps.
export function jumpButton(text, label, onClick) {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = 'calendar__jump';
  node.textContent = text;
  node.setAttribute('aria-label', label);
  node.addEventListener('click', onClick);
  return node;
}

// Twelve choices in a 4 × 3 grid — months, or years.
export function choiceGrid(items) {
  const grid = document.createElement('div');
  grid.className = 'monthgrid';
  for (const { text, current, selected, onPick } of items) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'calendar__day';
    cell.textContent = text;
    if (current) cell.classList.add('is-today');
    if (selected) {
      cell.classList.add('is-selected');
      cell.setAttribute('aria-current', 'true');
    }
    cell.addEventListener('click', onPick);
    grid.append(cell);
  }
  return grid;
}

// After switching what the popup shows, the button that was pressed is gone;
// focus lands on the chosen cell instead of falling back to the page.
export const focusChoice = (popup) => (popup.querySelector('.is-selected') ?? popup.querySelector('.calendar__day'))?.focus();

export function attachCalendar({ button, input, popup, onChange }) {
  let view = fromISO(input.value) ?? new Date();
  // What the popup is showing: the days of a month, the twelve months of a
  // year, or a page of years. Always opens on the days.
  let mode = 'days';

  const setValue = (date) => {
    input.value = toISO(date);
    button.textContent = formatDate(date);
  };

  const close = () => {
    popup.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  };

  const show = (next) => {
    mode = next;
    render();
    focusChoice(popup);
  };
  const page = (months) => {
    view = new Date(view.getFullYear(), view.getMonth() + months, 1);
    render();
  };

  function renderMonths(selected) {
    const now = new Date();
    const year = view.getFullYear();
    popup.replaceChildren(
      calendarHead([jumpButton(String(year), 'Choose a year', () => show('years'))], {
        onPrevious: () => page(-12), onNext: () => page(12), previousLabel: 'Previous year', nextLabel: 'Next year',
      }),
      choiceGrid(SHORT.map((name, month) => ({
        text: name,
        current: year === now.getFullYear() && month === now.getMonth(),
        selected: Boolean(selected) && year === selected.getFullYear() && month === selected.getMonth(),
        onPick: () => { view = new Date(year, month, 1); show('days'); },
      }))),
    );
  }

  function renderYears(selected) {
    const years = yearPage(view.getFullYear());
    const range = document.createElement('span');
    range.textContent = `${years[0]}–${years.at(-1)}`;
    popup.replaceChildren(
      calendarHead([range], {
        onPrevious: () => page(-144), onNext: () => page(144), previousLabel: 'Earlier years', nextLabel: 'Later years',
      }),
      choiceGrid(years.map((year) => ({
        text: String(year),
        current: year === new Date().getFullYear(),
        selected: selected?.getFullYear() === year,
        onPick: () => { view = new Date(year, view.getMonth(), 1); show('days'); },
      }))),
    );
  }

  function render() {
    const selected = fromISO(input.value);
    if (mode === 'months') { renderMonths(selected); return; }
    if (mode === 'years') { renderYears(selected); return; }
    const today = toISO(new Date());

    const head = calendarHead([
      jumpButton(MONTHS[view.getMonth()], 'Choose a month', () => show('months')),
      jumpButton(String(view.getFullYear()), 'Choose a year', () => show('years')),
    ], { onPrevious: () => page(-1), onNext: () => page(1), previousLabel: 'Previous month', nextLabel: 'Next month' });

    const grid = document.createElement('div');
    grid.className = 'calendar__grid';
    for (const day of WEEKDAYS) {
      const cell = document.createElement('span');
      cell.className = 'calendar__weekday';
      cell.textContent = day;
      grid.append(cell);
    }
    for (const date of monthGrid(view.getFullYear(), view.getMonth())) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'calendar__day';
      cell.textContent = String(date.getDate());
      if (date.getMonth() !== view.getMonth()) cell.classList.add('is-outside');
      if (toISO(date) === today) cell.classList.add('is-today');
      if (selected && toISO(date) === toISO(selected)) {
        cell.classList.add('is-selected');
        cell.setAttribute('aria-current', 'date');
      }
      cell.addEventListener('click', () => {
        setValue(date);
        close();
        button.focus();
        if (onChange) onChange(toISO(date));
      });
      grid.append(cell);
    }

    const todayButton = document.createElement('button');
    todayButton.type = 'button';
    todayButton.className = 'calendar__today';
    todayButton.textContent = 'Today';
    todayButton.addEventListener('click', () => {
      const now = new Date();
      view = now;
      setValue(now);
      close();
      button.focus();
      if (onChange) onChange(toISO(now));
    });

    popup.replaceChildren(head, grid, todayButton);
  }

  button.addEventListener('click', () => {
    if (popup.hidden) {
      view = fromISO(input.value) ?? new Date();
      mode = 'days';
      render();
      popup.hidden = false;
      button.setAttribute('aria-expanded', 'true');
    } else {
      close();
    }
  });

  // composedPath, not popup.contains(target). Paging a month re-renders the
  // popup, so by the time this bubbles up the ‹ › button that was clicked is
  // already detached, contains() says "outside", and the picker shut every
  // time someone stepped back to an earlier month. The path is fixed at
  // dispatch, before the re-render, so it still says where the click landed.
  document.addEventListener('click', (event) => {
    const path = event.composedPath();
    if (!popup.hidden && !path.includes(popup) && !path.includes(button)) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !popup.hidden) {
      close();
      button.focus();
    }
  });

  return {
    set(iso) {
      const date = fromISO(iso) ?? new Date();
      setValue(date);
      view = date;
    },
  };
}
