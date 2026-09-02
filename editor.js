import { groupDigits, rupiahToCents, centsToRupiahDigits } from './money.js';
import { BUCKETS, TRANSFER_CATEGORY, categoryOptions } from './budget.js';

// Opening a transaction to read and change it. Until now the only way to fix
// a typo was to delete the row and type it again, which loses its id and its
// place in any export already taken.
//
// Resolves to the edited transaction, to the string 'delete', or to null when
// dismissed. Dismissal is never a save: a dialog that commits on Escape is
// how an accidental swipe becomes an accidental edit.

let node = null;

function build() {
  if (node) return node;
  node = document.createElement('dialog');
  node.className = 'dialog dialog--editor';
  node.innerHTML = `
    <form method="dialog" class="editor">
      <h2 class="dialog__title">Edit transaction</h2>
      <p class="editor__kind hint"></p>

      <label for="edit-amount">Amount (Rp)</label>
      <input type="text" id="edit-amount" class="moneyfield" inputmode="numeric" autocomplete="off" required>

      <label for="edit-name">Name</label>
      <input type="text" id="edit-name">

      <div class="editor__field" data-field="category">
        <label for="edit-category">Category</label>
        <select id="edit-category"></select>
      </div>

      <div class="editor__field" data-field="bucket">
        <label for="edit-bucket">Type of expense</label>
        <select id="edit-bucket">
          <option value="flexible">Flexible</option>
          <option value="fixed">Fixed</option>
        </select>
      </div>

      <label for="edit-account" id="edit-account-label">Account</label>
      <select id="edit-account"></select>

      <label for="edit-date">Date</label>
      <input type="date" id="edit-date" required>

      <label for="edit-note">Note</label>
      <input type="text" id="edit-note">

      <p class="editor__error budget-note__warning" role="alert"></p>

      <div class="dialog__actions editor__actions">
        <button type="button" class="editor__delete">Delete</button>
        <button type="button" class="dialog__cancel">Cancel</button>
        <button type="button" class="dialog__confirm primary">Save</button>
      </div>
    </form>`;
  document.body.append(node);
  return node;
}

const fill = (select, names, current) => {
  select.replaceChildren(...names.map((name) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    option.selected = name === current;
    return option;
  }));
};

export function editTransaction({ txn, accounts, categories, usedCategories }) {
  const dialog = build();
  const $ = (id) => dialog.querySelector(`#${id}`);
  const isTransfer = Boolean(txn.transfer_id);
  const isIncome = !isTransfer && txn.amount > 0;

  dialog.querySelector('.dialog__title').textContent = isTransfer ? 'Edit transfer' : 'Edit transaction';
  dialog.querySelector('.editor__kind').textContent = isTransfer
    // Saying this up front is cheaper than letting someone discover it by
    // finding the other side changed underneath them.
    ? 'Both sides of this transfer move together. Changing the amount or the date here changes the matching row in the other account too.'
    : `${isIncome ? 'Income' : 'Expense'} recorded on ${txn.date}.`;

  // The amount is edited as a positive figure and the sign is restored on
  // save from what the row already is. Typing a minus to mean "expense" is
  // how a row silently flips from spending to income.
  $('edit-amount').value = groupDigits(centsToRupiahDigits(Math.abs(txn.amount)));
  $('edit-name').value = txn.name ?? '';
  $('edit-note').value = txn.note ?? '';
  $('edit-date').value = txn.date;

  fill($('edit-account'), accounts, txn.account);
  dialog.querySelector('#edit-account-label').textContent = isTransfer
    ? (txn.amount < 0 ? 'From account' : 'To account')
    : 'Account';

  // Category and bucket only exist for a plain expense or income row. A
  // transfer's category is reserved and its money is not charged anywhere.
  const categoryField = dialog.querySelector('[data-field="category"]');
  const bucketField = dialog.querySelector('[data-field="bucket"]');
  categoryField.hidden = isTransfer;
  bucketField.hidden = isTransfer || isIncome;
  if (!isTransfer) {
    const options = categoryOptions(categories, usedCategories, isIncome ? 'income' : 'expense');
    fill($('edit-category'), ['', ...options], txn.category ?? '');
    $('edit-category').options[0].textContent = 'No category';
    $('edit-bucket').value = txn.bucket === 'fixed' ? 'fixed' : 'flexible';
  }

  const error = dialog.querySelector('.editor__error');
  error.textContent = '';

  return new Promise((resolve) => {
    const finish = (value) => {
      dialog.close();
      resolve(value);
    };

    dialog.querySelector('.dialog__confirm').onclick = () => {
      const magnitude = rupiahToCents($('edit-amount').value);
      if (magnitude === null || magnitude <= 0) {
        error.textContent = 'Enter an amount greater than zero.';
        return;
      }
      if (!$('edit-date').value) {
        error.textContent = 'Choose a date.';
        return;
      }
      const bucket = !isTransfer && !isIncome && BUCKETS.includes($('edit-bucket').value)
        ? $('edit-bucket').value
        : null;
      finish({
        ...txn,
        // Sign comes from the row this always was, never from the field.
        amount: txn.amount < 0 ? -magnitude : magnitude,
        date: $('edit-date').value,
        name: $('edit-name').value.trim(),
        note: $('edit-note').value,
        account: $('edit-account').value,
        category: isTransfer ? TRANSFER_CATEGORY : $('edit-category').value,
        bucket,
      });
    };

    dialog.querySelector('.editor__delete').onclick = () => finish('delete');
    dialog.querySelector('.dialog__cancel').onclick = () => finish(null);
    dialog.oncancel = (event) => { event.preventDefault(); finish(null); };
    dialog.onclick = (event) => { if (event.target === dialog) finish(null); };

    dialog.showModal();
    $('edit-amount').focus();
    $('edit-amount').select();
  });
}
