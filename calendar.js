// A date picker in the app's own tokens.
//
// The native <input type="date"> popup is browser chrome: it sizes itself, it
// ignores the field's width, and no stylesheet can reach it. Narrowing the
// field to meet it helped on a laptop and did nothing on a phone, so the
// control is built here instead and matches every other picker in the app.

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
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

export function attachCalendar({ button, input, popup, onChange }) {
  let view = fromISO(input.value) ?? new Date();

  const setValue = (date) => {
    input.value = toISO(date);
    button.textContent = formatDate(date);
  };

  const close = () => {
    popup.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  };

  function render() {
    const selected = fromISO(input.value);
    const today = toISO(new Date());

    const head = document.createElement('div');
    head.className = 'calendar__head';
    const previous = document.createElement('button');
    previous.type = 'button';
    previous.className = 'calendar__nav';
    previous.textContent = '‹';
    previous.setAttribute('aria-label', 'Previous month');
    previous.addEventListener('click', () => {
      view = new Date(view.getFullYear(), view.getMonth() - 1, 1);
      render();
    });
    const label = document.createElement('span');
    label.className = 'calendar__label';
    label.textContent = `${MONTHS[view.getMonth()]} ${view.getFullYear()}`;
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'calendar__nav';
    next.textContent = '›';
    next.setAttribute('aria-label', 'Next month');
    next.addEventListener('click', () => {
      view = new Date(view.getFullYear(), view.getMonth() + 1, 1);
      render();
    });
    head.append(previous, label, next);

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
      render();
      popup.hidden = false;
      button.setAttribute('aria-expanded', 'true');
    } else {
      close();
    }
  });

  document.addEventListener('click', (event) => {
    if (!popup.hidden && !popup.contains(event.target) && event.target !== button) close();
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
