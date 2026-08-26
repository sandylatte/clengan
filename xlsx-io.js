import { toCents, fromCents } from './money.js';

export const COLUMNS = ['id', 'date', 'account', 'amount', 'category', 'transfer_id', 'note'];

export function rowsToSheetData(txns) {
  return txns.map((txn) => ({
    id: txn.id,
    date: txn.date,
    account: txn.account,
    amount: fromCents(txn.amount),
    category: txn.category,
    transfer_id: txn.transfer_id ?? '',
    note: txn.note ?? '',
  }));
}

export function sheetDataToRows(rows) {
  return rows.map((row, index) => {
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
}

// Browser-only below this line. XLSX is the global from vendor/xlsx.full.min.js,
// loaded by a plain <script> tag in index.html.
export function exportXlsx(txns) {
  const sheet = XLSX.utils.json_to_sheet(rowsToSheetData(txns), { header: COLUMNS });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'transactions');
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(book, `moneytrack-${stamp}.xlsx`);
}

export async function importXlsx(file) {
  const buffer = await file.arrayBuffer();
  const book = XLSX.read(buffer, { type: 'array' });
  const sheet = book.Sheets[book.SheetNames[0]];
  // raw:false keeps cells as the text the user sees, so a date Excel
  // reformatted still arrives as a string this code can validate.
  const rows = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: '' });
  return sheetDataToRows(rows);
}
