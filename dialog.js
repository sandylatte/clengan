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
let promptNode = null;

export function promptDialog({ title, body, label, value = '', confirmLabel, validate }) {
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
  field.value = value;
  error.textContent = '';

  return new Promise((resolve) => {
    const finish = (result) => { dialog.close(); resolve(result); };
    const submit = () => {
      const entered = field.value.trim();
      // Validation runs BEFORE closing, so a rejected value keeps what was
      // typed on screen instead of making the user start again.
      const complaint = validate ? validate(entered) : null;
      if (complaint) { error.textContent = complaint; field.focus(); return; }
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
