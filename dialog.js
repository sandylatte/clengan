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
