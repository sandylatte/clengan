import { toCents, fromCents } from './money.js';
import { parsePlannerGrid, monthFromSheetName } from './planner.js';

export const COLUMNS = ['id', 'date', 'account', 'amount', 'category', 'transfer_id', 'note'];
export const ACCOUNTS_COLUMNS = ['name', 'opening_balance'];

// A row whose amount is not a valid integer cent value (corrupt data that
// reached the db some other way — see Task 6/7) must still make it into the
// backup. Writing the raw stored value through lets the user repair it by
// hand in Excel instead of losing the row, or the whole export, silently.
export function rowsToSheetData(txns) {
  return txns.map((txn) => {
    let amount;
    try {
      amount = fromCents(txn.amount);
    } catch {
      amount = txn.amount;
    }
    return {
      id: txn.id,
      date: txn.date,
      account: txn.account,
      amount,
      category: txn.category,
      transfer_id: txn.transfer_id ?? '',
      note: txn.note ?? '',
    };
  });
}

export function sheetDataToRows(rows) {
  const parsed = rows.map((row, index) => {
    const where = `row ${index + 2}`; // +2: one-based, plus the header row
    const id = String(row.id ?? '').trim();
    if (!id) throw new Error(`${where}: missing id`);
    const date = String(row.date ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`${where}: date must be YYYY-MM-DD, got "${row.date}"`);
    const account = String(row.account ?? '').trim();
    if (!account) throw new Error(`${where}: missing account`);

    let amount;
    try {
      amount = toCents(row.amount);
    } catch {
      throw new Error(`${where}: amount is not a number: "${row.amount}"`);
    }

    const transferId = String(row.transfer_id ?? '').trim();
    return {
      id,
      date,
      account,
      amount,
      category: String(row.category ?? '').trim(),
      transfer_id: transferId === '' ? null : transferId,
      note: String(row.note ?? ''),
    };
  });

  // A transfer half is only meaningful with its partner in the same file:
  // both rows must exist, must point at each other, and must sum to zero.
  // A file that fails this could silently produce an unbalanced ledger,
  // exactly the corruption the two-row schema exists to prevent.
  const byId = new Map(parsed.map((row) => [row.id, row]));
  for (const row of parsed) {
    if (!row.transfer_id) continue;
    const partner = byId.get(row.transfer_id);
    if (!partner) {
      throw new Error(`row with id "${row.id}": transfer partner "${row.transfer_id}" is not in this file`);
    }
    if (partner.transfer_id !== row.id) {
      throw new Error(`row with id "${row.id}": transfer partner "${row.transfer_id}" does not point back to it`);
    }
    if (row.amount + partner.amount !== 0) {
      throw new Error(`row with id "${row.id}": transfer pair amounts do not sum to zero`);
    }
  }

  return parsed;
}

export function accountsToSheetData(accounts) {
  return accounts.map((account) => ({
    name: account.name,
    opening_balance: fromCents(account.opening_balance),
  }));
}

export function sheetDataToAccounts(rows) {
  const seen = new Set();
  return rows.map((row, index) => {
    const where = `accounts row ${index + 2}`; // +2: one-based, plus the header row
    const name = String(row.name ?? '').trim();
    if (!name) throw new Error(`${where}: missing name`);
    if (seen.has(name)) throw new Error(`${where}: duplicate account "${name}"`);
    seen.add(name);
    let opening_balance;
    try {
      opening_balance = toCents(row.opening_balance);
    } catch {
      throw new Error(`${where}: opening_balance is not a number: "${row.opening_balance}"`);
    }
    return { name, opening_balance };
  });
}

// Browser-only below this line. XLSX is the global from vendor/xlsx.full.min.js,
// loaded by a plain <script> tag in index.html.
export function exportXlsx(txns, accounts) {
  const book = XLSX.utils.book_new();
  const txSheet = XLSX.utils.json_to_sheet(rowsToSheetData(txns), { header: COLUMNS });
  XLSX.utils.book_append_sheet(book, txSheet, 'transactions');
  // The accounts sheet is what makes this a real backup — without it,
  // opening balances are lost on restore (see Task 10 final review).
  const accSheet = XLSX.utils.json_to_sheet(accountsToSheetData(accounts), { header: ACCOUNTS_COLUMNS });
  XLSX.utils.book_append_sheet(book, accSheet, 'accounts');
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(book, `moneytrack-${stamp}.xlsx`);
}

// A one-time migration off a FINANCIAL PLANNER workbook, kept apart from
// importXlsx because the two are not the same operation: that one restores a
// backup this app wrote, this one reads a foreign layout best-effort. Rows
// are returned for the caller to confirm, never written here.
export async function importPlanner(file, account) {
  const book = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const months = book.SheetNames.map((name) => [name, monthFromSheetName(name)]).filter(([, m]) => m);
  if (months.length === 0) {
    throw new Error('no month sheets found — expected tabs named like "2026_SEPT"');
  }

  const rows = [];
  const categories = new Map();
  const problems = [];
  for (const [name, month] of months) {
    const grid = XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, raw: false, defval: '' });
    const parsed = parsePlannerGrid(grid, month);
    problems.push(...parsed.problems);
    for (const [category, bucket] of parsed.categories) {
      if (bucket && !categories.has(category)) categories.set(category, bucket);
    }
    for (const row of parsed.rows) {
      rows.push({
        id: crypto.randomUUID(),
        date: row.date,
        account,
        amount: row.amount,
        category: row.category,
        transfer_id: null,
        note: row.note,
      });
    }
  }
  return { rows, categories, problems, months: months.map(([, m]) => m) };
}

export async function importXlsx(file) {
  const buffer = await file.arrayBuffer();
  const book = XLSX.read(buffer, { type: 'array' });
  if (book.SheetNames.length === 0) {
    throw new Error('workbook has no sheets');
  }
  const sheetName = book.SheetNames[0];
  const sheet = book.Sheets[sheetName];
  // raw:false keeps cells as the text the user sees, so a date Excel
  // reformatted still arrives as a string this code can validate.
  const rows = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: '' });
  // Zero rows is a valid state (an empty database backs up to an empty
  // sheet, and must be re-importable) — but the caller still needs to know
  // which sheet was actually read, so a data-on-a-second-sheet mistake is
  // still obvious even though this no longer throws.
  const txns = sheetDataToRows(rows);

  // A file with no "accounts" sheet is a legacy backup (or one written by
  // an older version of this app) and must still import exactly as before.
  let accounts = [];
  if (book.SheetNames.includes('accounts')) {
    const accRows = XLSX.utils.sheet_to_json(book.Sheets.accounts, { raw: false, defval: '' });
    accounts = sheetDataToAccounts(accRows);
  }

  return { rows: txns, accounts, sheetName };
}
