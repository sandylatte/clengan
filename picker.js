// The app's own dropdowns. A native <select> on a phone opens the platform's
// wheel or sheet: browser chrome in the platform's colours, and on Android a
// second tap on "Done" to commit. These open a list in the app's own tokens,
// and one tap on an option is the choice.
//
// The <select> stays in the DOM as the source of truth. Every existing reader
// of select.value, every `change` listener, every place that rebuilds the
// options, and form validation keep working untouched; this only draws a
// button over it and keeps the two in step.

import {
  MONTHS, yearPage, calendarHead, jumpButton, choiceGrid, focusChoice,
} from './calendar.js';

let openPopup = null;

// One popup open at a time, closed by a tap outside or Escape. composedPath,
// not contains(): a popup that re-renders on click (the month picker's year
// arrows) has already detached the clicked node by the time the click reaches
// the document. Same fix the calendar needed.
function bindPopover(button, popup, { onOpen } = {}) {
  const close = () => {
    if (popup.hidden) return;
    popup.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (openPopup?.popup === popup) openPopup = null;
  };
  const open = () => {
    if (openPopup && openPopup.popup !== popup) openPopup.close();
    onOpen?.();
    popup.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    openPopup = { popup, close };
    // A list near the bottom of a phone opens upward, where there is room.
    popup.classList.remove('is-up');
    const below = window.innerHeight - button.getBoundingClientRect().bottom;
    if (below < popup.offsetHeight + 72) popup.classList.add('is-up');
  };
  button.addEventListener('click', () => (popup.hidden ? open() : close()));
  document.addEventListener('click', (event) => {
    const path = event.composedPath();
    if (!popup.hidden && !path.includes(popup) && !path.includes(button)) close();
  });
  popup.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { close(); button.focus(); }
  });
  button.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
  return { open, close };
}

const VALUE = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
const INDEX = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');

export function enhanceSelect(select) {
  if (select.dataset.picker) return;
  select.dataset.picker = 'on';

  const wrap = document.createElement('div');
  wrap.className = 'pick';
  select.before(wrap);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pick__button';
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  const list = document.createElement('div');
  list.className = 'pick__list';
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  // The select sits under the button, invisible, rather than display:none: a
  // required select the browser cannot show is a form that silently refuses
  // to submit. Here its validation bubble points at the button.
  select.classList.add('pick__native');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  wrap.append(select, button, list);

  const labels = () => (select.id ? document.querySelectorAll(`label[for="${select.id}"]`) : []);
  for (const label of labels()) {
    label.addEventListener('click', (event) => { event.preventDefault(); button.focus(); });
  }

  const sync = () => {
    const option = select.selectedOptions[0];
    button.textContent = option ? option.textContent : '';
    button.disabled = select.disabled;
    wrap.hidden = select.hidden;
    const name = [...labels()].map((l) => l.textContent.trim()).join(' ') || select.getAttribute('aria-label') || '';
    if (name) button.setAttribute('aria-label', `${name}: ${button.textContent}`);
  };

  const choose = (option) => {
    VALUE.set.call(select, option.value);
    sync();
    popover.close();
    button.focus();
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const optionButton = (option) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'pick__option';
    item.setAttribute('role', 'option');
    item.textContent = option.textContent;
    item.disabled = option.disabled;
    const selected = option.selected;
    item.setAttribute('aria-selected', String(selected));
    if (selected) item.classList.add('is-selected');
    item.addEventListener('click', () => choose(option));
    return item;
  };

  const render = () => {
    const items = [];
    for (const child of select.children) {
      if (child.tagName === 'OPTGROUP') {
        const heading = document.createElement('div');
        heading.className = 'pick__group';
        heading.textContent = child.label;
        items.push(heading, ...[...child.children].filter((o) => !o.hidden).map(optionButton));
      } else if (!child.hidden) {
        items.push(optionButton(child));
      }
    }
    list.replaceChildren(...items);
  };

  const popover = bindPopover(button, list, {
    onOpen: () => {
      render();
      requestAnimationFrame(() => (list.querySelector('.is-selected') ?? list.querySelector('.pick__option'))?.focus());
    },
  });

  list.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const options = [...list.querySelectorAll('.pick__option:not(:disabled)')];
    const at = options.indexOf(document.activeElement);
    const next = options[at + (event.key === 'ArrowDown' ? 1 : -1)];
    next?.focus();
  });

  // Code all over the app sets select.value directly, which fires no event.
  // Patched on this one element so the button can never show a stale choice.
  Object.defineProperty(select, 'value', {
    configurable: true,
    get() { return VALUE.get.call(this); },
    set(v) { VALUE.set.call(this, v); sync(); },
  });
  Object.defineProperty(select, 'selectedIndex', {
    configurable: true,
    get() { return INDEX.get.call(this); },
    set(v) { INDEX.set.call(this, v); sync(); },
  });
  new MutationObserver(sync).observe(select, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'selected'],
  });
  select.form?.addEventListener('reset', () => setTimeout(sync));
  select.addEventListener('change', sync);
  sync();
}

// Every select, including those a dialog builds later.
export function enhanceAllSelects(root = document) {
  for (const select of root.querySelectorAll('select')) enhanceSelect(select);
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.tagName === 'SELECT') enhanceSelect(node);
        else for (const select of node.querySelectorAll('select')) enhanceSelect(select);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}

const SHORT = MONTHS.map((m) => m.slice(0, 3));
export const formatMonth = (value) => {
  const [year, month] = String(value).split('-').map(Number);
  return year && month ? `${SHORT[month - 1]} ${year}` : '';
};

// A month, picked from a year of twelve. Replaces <input type="month">, which
// on a phone is the same platform wheel. The hidden input keeps the value as
// 'YYYY-MM' and fires `change`, so the code reading it is unchanged.
export function attachMonthPicker({ button, input, popup }) {
  let year = Number(String(input.value).slice(0, 4)) || new Date().getFullYear();
  // The twelve months of a year, or — from the year in the heading — a page
  // of years to jump to. Always opens on the months.
  let mode = 'months';

  const set = (value) => {
    input.value = value;
    button.textContent = formatMonth(value) || 'Choose a month';
  };

  function render() {
    const now = new Date();
    const chosenYear = Number(String(input.value).slice(0, 4));
    if (mode === 'years') {
      const years = yearPage(year);
      const range = document.createElement('span');
      range.textContent = `${years[0]}–${years.at(-1)}`;
      popup.replaceChildren(
        calendarHead([range], {
          onPrevious: () => { year -= 12; render(); },
          onNext: () => { year += 12; render(); },
          previousLabel: 'Earlier years',
          nextLabel: 'Later years',
        }),
        choiceGrid(years.map((y) => ({
          text: String(y),
          current: y === now.getFullYear(),
          selected: y === chosenYear,
          onPick: () => { year = y; mode = 'months'; render(); focusChoice(popup); },
        }))),
      );
      return;
    }

    const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    popup.replaceChildren(
      calendarHead([jumpButton(String(year), 'Choose a year', () => { mode = 'years'; render(); focusChoice(popup); })], {
        onPrevious: () => { year -= 1; render(); },
        onNext: () => { year += 1; render(); },
        previousLabel: 'Previous year',
        nextLabel: 'Next year',
      }),
      choiceGrid(SHORT.map((name, i) => {
        const value = `${year}-${String(i + 1).padStart(2, '0')}`;
        return {
          text: name,
          current: value === current,
          selected: value === input.value,
          onPick: () => {
            set(value);
            popover.close();
            button.focus();
            input.dispatchEvent(new Event('change', { bubbles: true }));
          },
        };
      })),
    );
  }

  const popover = bindPopover(button, popup, {
    onOpen: () => {
      year = Number(String(input.value).slice(0, 4)) || year;
      mode = 'months';
      render();
    },
  });
  set(input.value);
  return { set, close: popover.close };
}
