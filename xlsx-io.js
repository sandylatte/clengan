import { toCents, fromCents } from './money.js';
import { parsePlannerGrid, monthFromSheetName } from './planner.js';
import { normaliseColour } from './budget.js';

// `name` and `bucket` sit beside category, not instead of it: the backup is
// the only copy of this data that leaves the device, so a field missing here
// is a field the user loses on the next restore.
const COLUMNS = ['id', 'date', 'account', 'amount', 'name', 'category', 'bucket', 'transfer_id', 'note'];
const ACCOUNTS_COLUMNS = ['name', 'opening_balance'];

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
      name: txn.name ?? '',
      category: txn.category ?? '',
      bucket: txn.bucket ?? '',
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

    // Anything that is not one of the two spending buckets becomes null, so
    // the row falls back to its category rather than carrying a value the
    // budget cannot charge. A file typed by hand is the likely source.
    const rawBucket = String(row.bucket ?? '').trim().toLowerCase();
    const bucket = rawBucket === 'fixed' || rawBucket === 'flexible' ? rawBucket : null;

    return {
      id,
      date,
      account,
      amount,
      name: String(row.name ?? '').trim(),
      category: String(row.category ?? '').trim(),
      bucket,
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

// Everything below restores the parts of the app that are NOT transactions.
// Until these existed the export was not a backup: restoring it onto a fresh
// device gave the ledger back with grey categories, no funds and a default
// split, and nothing said so. A backup that loses settings loses them quietly,
// which is the worst way to lose them.

const CATEGORY_COLUMNS = ['name', 'kind', 'colour', 'position'];
const FUND_COLUMNS = ['name', 'percent'];
const SETTING_COLUMNS = ['key', 'value'];
const RECURRING_COLUMNS = ['id', 'name', 'amount', 'account', 'category', 'bucket',
  'day', 'last_run', 'active', 'note'];

export function categoriesToSheetData(categories) {
  return categories.map((category) => ({
    name: category.name,
    kind: category.kind === 'income' ? 'income' : 'expense',
    colour: category.colour ?? '',
    position: Number.isFinite(category.position) ? category.position : '',
  }));
}

export function sheetDataToCategories(rows) {
  return rows.map((row) => {
    const name = String(row.name ?? '').trim();
    if (!name) return null;
    const position = Number(row.position);
    return {
      name,
      kind: String(row.kind ?? '').trim().toLowerCase() === 'income' ? 'income' : 'expense',
      // Through the same gate as every other source. A hand-edited hex that is
      // not in the palette becomes "no colour" rather than a value the
      // contrast of the whole set was never checked against.
      colour: normaliseColour(row.colour),
      position: Number.isFinite(position) ? position : undefined,
    };
  }).filter(Boolean);
}

export function fundsToSheetData(funds) {
  return funds.map((fund) => ({ name: fund.name, percent: fund.percent }));
}

export function sheetDataToFunds(rows) {
  return rows.map((row, index) => {
    const name = String(row.name ?? '').trim();
    if (!name) return null;
    const percent = Number(row.percent);
    if (!Number.isFinite(percent) || percent < 0) {
      throw new Error(`funds row ${index + 2}: percent is not a number at or above zero: "${row.percent}"`);
    }
    return { name, percent };
  }).filter(Boolean);
}

// Settings hold objects (the split is three numbers), and a spreadsheet cell
// holds text. JSON in the cell keeps the sheet honest about that rather than
// flattening a structure into three columns nothing else uses.
export function settingsToSheetData(settings) {
  return settings.map(({ key, value }) => ({ key, value: JSON.stringify(value) }));
}

export function sheetDataToSettings(rows) {
  return rows.map((row, index) => {
    const key = String(row.key ?? '').trim();
    if (!key) return null;
    try {
      return { key, value: JSON.parse(String(row.value ?? '')) };
    } catch {
      throw new Error(`settings row ${index + 2}: "${key}" is not readable JSON: "${row.value}"`);
    }
  }).filter(Boolean);
}

export function recurringToSheetData(rules) {
  return rules.map((rule) => ({
    id: rule.id,
    name: rule.name ?? '',
    amount: fromCents(rule.amount),
    account: rule.account ?? '',
    category: rule.category ?? '',
    bucket: rule.bucket ?? '',
    day: rule.day,
    last_run: rule.last_run ?? '',
    active: rule.active === false ? 'no' : 'yes',
    note: rule.note ?? '',
  }));
}

export function sheetDataToRecurring(rows) {
  return rows.map((row, index) => {
    const where = `recurring row ${index + 2}`;
    const id = String(row.id ?? '').trim();
    if (!id) return null;
    let amount;
    try {
      amount = toCents(row.amount);
    } catch {
      throw new Error(`${where}: amount is not a number: "${row.amount}"`);
    }
    const day = Number(row.day);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      throw new Error(`${where}: day must be a whole number from 1 to 31, got "${row.day}"`);
    }
    const rawBucket = String(row.bucket ?? '').trim().toLowerCase();
    const lastRun = String(row.last_run ?? '').trim();
    if (lastRun && !/^\d{4}-\d{2}$/.test(lastRun)) {
      throw new Error(`${where}: last_run must be YYYY-MM, got "${row.last_run}"`);
    }
    return {
      id,
      name: String(row.name ?? '').trim(),
      amount,
      account: String(row.account ?? '').trim(),
      category: String(row.category ?? '').trim(),
      bucket: rawBucket === 'fixed' || rawBucket === 'flexible' ? rawBucket : null,
      day,
      last_run: lastRun || null,
      // Anything but an explicit "no" stays active: a rule that quietly
      // stopped firing because a cell was blank is a payment missed in silence.
      active: String(row.active ?? '').trim().toLowerCase() !== 'no',
      note: String(row.note ?? ''),
    };
  }).filter(Boolean);
}

// Browser-only below this line. XLSX is the global from vendor/xlsx.full.min.js,
// loaded by a plain <script> tag in index.html.
export function exportXlsx(txns, accounts, extras = {}) {
  const { categories = [], funds = [], settings = [], recurring = [] } = extras;
  const book = XLSX.utils.book_new();
  const sheet = (name, data, header) => {
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(data, { header }), name);
  };
  sheet('transactions', rowsToSheetData(txns), COLUMNS);
  // Every sheet below is written even when empty. A missing sheet is
  // indistinguishable from an older backup that never had one, and the import
  // has to treat that as "leave what is here alone" — so an empty fund list
  // that arrived as a missing sheet would silently fail to clear anything.
  // Present-and-empty says what happened.
  sheet('accounts', accountsToSheetData(accounts), ACCOUNTS_COLUMNS);
  sheet('categories', categoriesToSheetData(categories), CATEGORY_COLUMNS);
  sheet('funds', fundsToSheetData(funds), FUND_COLUMNS);
  sheet('settings', settingsToSheetData(settings), SETTING_COLUMNS);
  sheet('recurring', recurringToSheetData(recurring), RECURRING_COLUMNS);
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(book, `clengan-${stamp}.xlsx`);
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
        name: '',
        category: row.category,
        // The ledger the row sat in IS its bucket, and now that a row carries
        // its own, that survives the import. The planner's habit of listing
        // one category under both ledgers used to have to be flattened to a
        // single answer; here both rows keep the ledger they came from.
        bucket: row.bucket,
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
  // The same holds for every sheet added since: absent means "this file has
  // nothing to say about that", and the caller leaves what is on the device
  // alone. Only a sheet that is present speaks.
  const read = (name, parse) => (book.SheetNames.includes(name)
    ? parse(XLSX.utils.sheet_to_json(book.Sheets[name], { raw: false, defval: '' }))
    : null);

  return {
    rows: txns,
    sheetName,
    accounts: read('accounts', sheetDataToAccounts) ?? [],
    categories: read('categories', sheetDataToCategories),
    funds: read('funds', sheetDataToFunds),
    settings: read('settings', sheetDataToSettings),
    recurring: read('recurring', sheetDataToRecurring),
  };
}
