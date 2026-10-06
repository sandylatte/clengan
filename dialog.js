// Overlay dialogs, replacing window.confirm and window.alert.
//
// The native ones cannot be styled, render in the platform's chrome rather
// than the app's, and on a phone they read as the browser interrupting rather
// than the app asking. Built on <dialog> so focus trapping, Escape and the
// backdrop come from the platform instead of being reimplemented.
//
// Copy rules, applied by every caller:
//   Title names what is about to happen, or what went wrong. No period.
//   Body says the consequence, then the recovery. Full sentences.
//   Buttons name their action with a verb. Never "OK" or "Yes".
//   No "Error:", no "please", no exclamation marks, no raw exception text
//   without a sentence around it explaining what it means.

let node = null;

function build() {
  if (node) return node;
  node = document.createElement('dialog');
  node.className = 'dialog';
  node.innerHTML = `
    <h2 class="dialog__title"></h2>
    <p class="dialog__body"></p>
    <div class="dialog__actions">
      <button type="button" class="dialog__cancel"></button>
      <button type="button" class="dialog__confirm primary"></button>
    </div>`;
  document.body.append(node);
  return node;
}

function open({ title, body, confirmLabel, cancelLabel, danger }) {
  const dialog = build();
  dialog.querySelector('.dialog__title').textContent = title;
  // Preserves the blank line between a consequence and its detail without
  // letting caller text become markup.
  const bodyNode = dialog.querySelector('.dialog__body');
  bodyNode.replaceChildren(...String(body).split('\n\n').flatMap((part, i) => {
    const span = document.createElement('span');
    span.textContent = part;
    return i === 0 ? [span] : [document.createElement('br'), document.createElement('br'), span];
  }));

  const confirmButton = dialog.querySelector('.dialog__confirm');
  const cancelButton = dialog.querySelector('.dialog__cancel');
  confirmButton.textContent = confirmLabel;
  confirmButton.classList.toggle('is-danger', Boolean(danger));
  cancelButton.textContent = cancelLabel ?? '';
  cancelButton.hidden = !cancelLabel;

  return new Promise((resolve) => {
    const finish = (value) => {
      dialog.close();
      resolve(value);
    };
    confirmButton.onclick = () => finish(true);
    cancelButton.onclick = () => finish(false);
    // Escape and the backdrop both mean "no". A dialog that treats dismissal
    // as consent is how data gets deleted by accident.
    dialog.oncancel = () => finish(false);
    dialog.onclick = (event) => { if (event.target === dialog) finish(false); };
    dialog.showModal();
    (cancelButton.hidden ? confirmButton : cancelButton).focus();
  });
}

export function confirmDialog({ title, body, confirmLabel, cancelLabel = 'Cancel', danger = false }) {
  return open({ title, body, confirmLabel, cancelLabel, danger });
}

export async function alertDialog({ title, body, confirmLabel = 'Close' }) {
  await open({ title, body, confirmLabel, cancelLabel: null, danger: false });
}

// Asking for one line of text. Resolves to the trimmed string, or to null
// when dismissed — never to an empty string, so a caller cannot mistake
// "cancelled" for "cleared it".
//
// `pin` turns the field into four hidden digits with the number pad.
// `validate` may be async (checking a PIN is): the dialog stays open, with
// what was typed, until it resolves to no complaint.
let promptNode = null;

export function promptDialog({ title, body, label, value = '', confirmLabel, validate, pin = false }) {
  if (!promptNode) {
    promptNode = document.createElement('dialog');
    promptNode.className = 'dialog';
    promptNode.innerHTML = `
      <h2 class="dialog__title"></h2>
      <p class="dialog__body"></p>
      <label class="prompt__label" for="prompt-input"></label>
      <input type="text" id="prompt-input" autocomplete="off">
      <p class="prompt__error budget-note__warning" role="alert"></p>
      <div class="dialog__actions">
        <button type="button" class="dialog__cancel">Cancel</button>
        <button type="button" class="dialog__confirm primary"></button>
      </div>`;
    document.body.append(promptNode);
  }
  const dialog = promptNode;
  dialog.querySelector('.dialog__title').textContent = title;
  dialog.querySelector('.dialog__body').textContent = body ?? '';
  dialog.querySelector('.dialog__body').hidden = !body;
  dialog.querySelector('.prompt__label').textContent = label;
  dialog.querySelector('.dialog__confirm').textContent = confirmLabel;
  const field = dialog.querySelector('#prompt-input');
  const error = dialog.querySelector('.prompt__error');
  // One node serves every prompt, so the PIN attributes are set or cleared
  // on each call rather than left behind for the next text prompt.
  field.type = pin ? 'password' : 'text';
  field.classList.toggle('prompt__pin', pin);
  if (pin) {
    field.inputMode = 'numeric';
    field.maxLength = 4;
    field.pattern = '[0-9]*';
  } else {
    field.removeAttribute('inputmode');
    field.removeAttribute('maxlength');
    field.removeAttribute('pattern');
  }
  field.value = value;
  error.textContent = '';

  return new Promise((resolve) => {
    const finish = (result) => { dialog.close(); resolve(result); };
    let checking = false;
    const submit = async () => {
      if (checking) return;
      const entered = field.value.trim();
      // Validation runs BEFORE closing, so a rejected value keeps what was
      // typed on screen instead of making the user start again.
      checking = true;
      const complaint = validate ? await validate(entered) : null;
      checking = false;
      if (complaint) {
        error.textContent = complaint;
        // A wrong PIN is cleared for the next try; a wrong name is kept to fix.
        if (pin) field.value = '';
        field.focus();
        return;
      }
      finish(entered);
    };
    dialog.querySelector('.dialog__confirm').onclick = submit;
    field.onkeydown = (event) => { if (event.key === 'Enter') { event.preventDefault(); submit(); } };
    dialog.querySelector('.dialog__cancel').onclick = () => finish(null);
    dialog.oncancel = () => finish(null);
    dialog.onclick = (event) => { if (event.target === dialog) finish(null); };
    dialog.showModal();
    field.focus();
    field.select();
  });
}

// A separate dialog node from the confirm/alert one: this is a grid of
// choices rather than a message with two buttons, and reusing the other
// node would mean rebuilding its insides on every call.
//
// Resolves to a colour, to null for "no colour", or to undefined when
// dismissed — which is not the same as choosing none, and must not be
// treated as one.
let pickerNode = null;

export function pickColour({ title, colours, current }) {
  if (!pickerNode) {
    pickerNode = document.createElement('dialog');
    pickerNode.className = 'dialog';
    pickerNode.innerHTML = `
      <h2 class="dialog__title"></h2>
      <div class="palette"></div>
      <div class="dialog__actions">
        <button type="button" class="dialog__cancel">Cancel</button>
      </div>`;
    document.body.append(pickerNode);
  }
  const dialog = pickerNode;
  dialog.querySelector('.dialog__title').textContent = title;

  return new Promise((resolve) => {
    const finish = (value) => { dialog.close(); resolve(value); };

    const swatchFor = (value, label) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'palette__item';
      button.setAttribute('aria-pressed', String(value === current));
      const chip = document.createElement('span');
      chip.className = 'palette__chip';
      if (value) chip.style.background = value;
      else chip.classList.add('palette__chip--none');
      const text = document.createElement('span');
      text.textContent = label;
      button.append(chip, text);
      button.onclick = () => finish(value);
      return button;
    };

    dialog.querySelector('.palette').replaceChildren(
      swatchFor(null, 'No colour'),
      ...colours.map((colour) => swatchFor(colour.value, colour.name)),
    );

    dialog.querySelector('.dialog__cancel').onclick = () => finish(undefined);
    dialog.oncancel = () => finish(undefined);
    dialog.onclick = (event) => { if (event.target === dialog) finish(undefined); };
    dialog.showModal();
    dialog.querySelector('.palette__item').focus();
  });
}

// The recovery code, shown once and never again.
//
// This is the only dialog in the app that cannot be dismissed. Escape, the
// backdrop and a cancel button are all absent on purpose, and the button stays
// disabled until the box is ticked — the whole pattern the other dialogs
// deliberately avoid, because the other dialogs are recoverable and this is
// not. Someone who taps past this and later forgets their password has lost
// their financial history, and nobody can give it back.
//
// It resolves only when acknowledged, so a caller can treat the return as
// "they have seen it".
let recoveryNode = null;

export function showRecoveryCode({ code }) {
  if (!recoveryNode) {
    recoveryNode = document.createElement('dialog');
    recoveryNode.className = 'dialog';
    recoveryNode.innerHTML = `
      <h2 class="dialog__title">Write this down now</h2>
      <p class="dialog__body">This is the only other way into your records. It is shown once and cannot be shown again.</p>
      <code class="recovery__code" id="recovery-code"></code>
      <p class="recovery__warning">If you forget your password and lose this code, your records cannot be recovered — not by us, not by anyone. That is what makes them private.</p>
      <label class="recovery__ack"><input type="checkbox" id="recovery-ack"> I have written it down somewhere safe</label>
      <div class="dialog__actions">
        <button type="button" class="dialog__confirm primary" disabled>Finish</button>
      </div>`;
    document.body.append(recoveryNode);
  }
  const dialog = recoveryNode;
  dialog.querySelector('#recovery-code').textContent = code;
  const tick = dialog.querySelector('#recovery-ack');
  const finish = dialog.querySelector('.dialog__confirm');
  tick.checked = false;
  finish.disabled = true;

  return new Promise((resolve) => {
    tick.onchange = () => { finish.disabled = !tick.checked; };
    finish.onclick = () => { dialog.close(); resolve(true); };
    // No oncancel handler and no backdrop handler: preventDefault on cancel is
    // what actually stops Escape closing it.
    dialog.oncancel = (event) => event.preventDefault();
    dialog.showModal();
    tick.focus();
  });
}

// One month's own budget. Resolves to a plan to save, to null for "go back to
// the default split", or to undefined when dismissed. Those three must stay
// distinct: dismissing is not the same as resetting.
let planNode = null;

export function monthPlanDialog({ monthLabel, plan, split, income, toCents, group, validate }) {
  if (!planNode) {
    planNode = document.createElement('dialog');
    planNode.className = 'dialog';
    planNode.innerHTML = `
      <h2 class="dialog__title"></h2>
      <p class="dialog__body"></p>
      <div class="seg" role="group" aria-label="Budget by">
        <button type="button" class="seg__button" data-mode="percent">Percent</button>
        <button type="button" class="seg__button" data-mode="amount">Amount</button>
      </div>
      <div class="plan__fields" data-for="percent">
        <label for="plan-fixed-pct">Fixed %</label>
        <input type="number" id="plan-fixed-pct" min="0" max="100" step="1">
        <label for="plan-flexible-pct">Flexible %</label>
        <input type="number" id="plan-flexible-pct" min="0" max="100" step="1">
        <label for="plan-savings-pct">Savings %</label>
        <input type="number" id="plan-savings-pct" min="0" max="100" step="1">
      </div>
      <div class="plan__fields" data-for="amount">
        <label for="plan-fixed-amt">Fixed (Rp)</label>
        <input type="text" id="plan-fixed-amt" class="moneyfield" inputmode="numeric" autocomplete="off">
        <label for="plan-flexible-amt">Flexible (Rp)</label>
        <input type="text" id="plan-flexible-amt" class="moneyfield" inputmode="numeric" autocomplete="off">
      </div>
      <p class="plan__status hint" role="status"></p>
      <div class="dialog__actions">
        <button type="button" class="dialog__cancel plan__reset">Use default</button>
        <button type="button" class="dialog__cancel plan__close">Cancel</button>
        <button type="button" class="dialog__confirm primary">Save</button>
      </div>`;
    document.body.append(planNode);
    for (const field of planNode.querySelectorAll('.moneyfield')) {
      field.addEventListener('input', () => { field.value = group(field.value); });
    }
  }
  const dialog = planNode;
  const $ = (selector) => dialog.querySelector(selector);
  $('.dialog__title').textContent = `Budget for ${monthLabel}`;
  $('.dialog__body').textContent = plan
    ? 'This month has its own budget. Other months are not affected.'
    : `This month uses the default split (${split.fixed} / ${split.flexible} / ${split.savings}). Changes here apply to this month only.`;
  $('.plan__reset').hidden = !plan;

  const percentSource = plan?.mode === 'percent' ? plan : split;
  $('#plan-fixed-pct').value = percentSource.fixed;
  $('#plan-flexible-pct').value = percentSource.flexible;
  $('#plan-savings-pct').value = percentSource.savings;
  // An amount plan starts from what the month is budgeting right now, so
  // switching modes shows the same money in the other unit, not zeros.
  const startFixed = plan?.mode === 'amount' ? plan.fixed : Math.round(income * percentSource.fixed / 100);
  const startFlexible = plan?.mode === 'amount' ? plan.flexible : Math.round(income * percentSource.flexible / 100);
  $('#plan-fixed-amt').value = group(String(Math.round(startFixed / 100)));
  $('#plan-flexible-amt').value = group(String(Math.round(startFlexible / 100)));

  let mode = plan?.mode ?? 'percent';
  const read = () => (mode === 'percent'
    ? { mode, fixed: Number($('#plan-fixed-pct').value), flexible: Number($('#plan-flexible-pct').value),
      savings: Number($('#plan-savings-pct').value) }
    : { mode, fixed: toCents($('#plan-fixed-amt').value) ?? 0, flexible: toCents($('#plan-flexible-amt').value) ?? 0 });

  const status = $('.plan__status');
  const save = $('.dialog__confirm');
  const update = () => {
    for (const button of dialog.querySelectorAll('[data-mode]')) {
      button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    }
    for (const block of dialog.querySelectorAll('.plan__fields')) block.hidden = block.dataset.for !== mode;
    const draft = read();
    const { ok, message } = validate(draft);
    status.className = ok ? 'plan__status hint' : 'plan__status budget-note__warning';
    status.textContent = message;
    save.disabled = !ok;
  };
  for (const button of dialog.querySelectorAll('[data-mode]')) {
    button.onclick = () => { mode = button.dataset.mode; update(); };
  }
  for (const input of dialog.querySelectorAll('input')) input.oninput = update;
  update();

  return new Promise((resolve) => {
    const finish = (value) => { dialog.close(); resolve(value); };
    save.onclick = () => { if (validate(read()).ok) finish(read()); };
    $('.plan__reset').onclick = () => finish(null);
    $('.plan__close').onclick = () => finish(undefined);
    dialog.oncancel = () => finish(undefined);
    dialog.onclick = (event) => { if (event.target === dialog) finish(undefined); };
    dialog.showModal();
    $('.plan__close').focus();
  });
}
