import { toCents } from './money.js';

// One-time migration from a "FINANCIAL PLANNER" workbook. This is a layout
// spreadsheet, not a data table: the ledgers sit at fixed offsets inside a
// dashboard. Rather than hardcode column letters, the ledger blocks are found
// by their own header run (Date, Category, Amount, Note), so the parse
// survives columns being inserted to its left.
//
// Not the app's backup format. The flat export in xlsx-io.js is that.

const MONTHS = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};

// '2026_SEPT' -> '2026-09'. Anything else is not a month sheet (the workbook
// also carries a YEARLY_Savings tab) and is skipped rather than guessed at.
export function monthFromSheetName(name) {
  const match = /^(\d{4})[_-]([A-Za-z]{3,})$/.exec(name.trim());
  if (!match) return null;
  const month = MONTHS[match[2].slice(0, 3).toUpperCase()];
  return month ? `${match[1]}-${month}` : null;
}

const LEDGER_HEADER = ['date', 'category', 'amount', 'note'];

function findLedgers(grid) {
  const found = [];
  for (let r = 0; r < grid.length; r += 1) {
    const row = grid[r] ?? [];
    for (let c = 0; c + 3 < row.length; c += 1) {
      const run = row.slice(c, c + 4).map((cell) => String(cell ?? '').trim().toLowerCase());
      if (LEDGER_HEADER.every((label, i) => run[i] === label)) found.push({ row: r, col: c });
    }
  }
  // Left-to-right is the sheet's own order: fixed expenses, then flexible.
  return found.sort((a, b) => a.row - b.row || a.col - b.col);
}

export function parseAmount(value) {
  const text = String(value ?? '').trim().replace(/,/g, '');
  if (text === '') return null;
  return toCents(text);
}

// Dates repeat down a run in the source: only the first row of a day carries
// one. A blank date means "same day as the row above", not a broken row.
export function parseDate(value, fallback) {
  const text = String(value ?? '').trim();
  if (text === '') return fallback;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (slash) {
    const [, month, day, year] = slash;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return null;
}

function readLedger(grid, { row, col }, month, bucket, problems) {
  const rows = [];
  let lastDate = null;
  for (let r = row + 1; r < grid.length; r += 1) {
    const line = grid[r] ?? [];
    const category = String(line[col + 1] ?? '').trim();
    let amount;
    try {
      amount = parseAmount(line[col + 2]);
    } catch {
      problems.push(`${month} row ${r + 1}: amount is not a number: "${line[col + 2]}"`);
      continue;
    }
    const date = parseDate(line[col], lastDate);

    // A row is only real when it names both a category and an amount. Every
    // other shape is the spreadsheet's own padding.
    if (!category || amount === null || amount === 0) continue;
    if (!date) {
      problems.push(`${month} row ${r + 1}: no usable date for "${category}"`);
      continue;
    }
    lastDate = date;

    // These workbooks are made by copying last month's sheet, so the dates
    // often still name the month it was copied from. The sheet name is what
    // the yearly rollup keys on, so it wins — but every correction is
    // reported, because silently moving a row to another month is exactly
    // the kind of edit that makes a total impossible to reconcile.
    let filed = date;
    if (date.slice(0, 7) !== month) {
      filed = `${month}-${date.slice(8, 10)}`;
      problems.push(`${month} row ${r + 1}: "${category}" was dated ${date}; filed under ${filed} to match the sheet.`);
    }

    rows.push({
      date: filed,
      category,
      amount: -Math.abs(amount),
      note: String(line[col + 3] ?? '').trim(),
      bucket,
    });
  }
  return rows;
}

// Income sits in its own labelled block, not a ledger, so it is found by its
// heading rather than a header run. The month has no per-row date for it, so
// each entry lands on the first of the month, which is the only date the
// source actually supports.
function readIncome(grid, month, problems) {
  const rows = [];
  for (let r = 0; r < grid.length; r += 1) {
    const line = grid[r] ?? [];
    for (let c = 0; c < line.length; c += 1) {
      if (String(line[c] ?? '').trim().toLowerCase() !== 'income') continue;
      // The dashboard has a second "Income" heading, in the summary strip,
      // whose next row is the total rather than a label. A real income block
      // is the one whose first entry names something. Without this the
      // summary total imports as a transaction called "300,200".
      const below = String((grid[r + 1] ?? [])[c] ?? '').trim();
      if (below === '' || Number.isFinite(Number(below.replace(/,/g, '')))) continue;
      for (let n = r + 1; n < grid.length; n += 1) {
        const entry = grid[n] ?? [];
        const label = String(entry[c] ?? '').trim();
        if (!label) break;
        let amount;
        try {
          amount = parseAmount(entry[c + 1]);
        } catch {
          problems.push(`${month} row ${n + 1}: income amount is not a number: "${entry[c + 1]}"`);
          break;
        }
        if (amount === null || amount === 0) continue;
        rows.push({ date: `${month}-01`, category: label, amount: Math.abs(amount), note: '', bucket: null });
      }
      return rows;
    }
  }
  return rows;
}

// Returns rows plus the categories the sheet used, each tagged with the
// ledger it came from. Importing therefore teaches the app the user's own
// fixed/flexible split instead of leaving them to re-enter it by hand.
export function parsePlannerGrid(grid, month) {
  const problems = [];
  const ledgers = findLedgers(grid);
  const buckets = ['fixed', 'flexible'];
  const rows = ledgers.flatMap((ledger, index) => (
    index < buckets.length ? readLedger(grid, ledger, month, buckets[index], problems) : []
  ));
  if (ledgers.length > buckets.length) {
    problems.push(`${month}: found ${ledgers.length} ledger blocks, only the first two were read`);
  }

  const categories = new Map();
  for (const row of rows) if (!categories.has(row.category)) categories.set(row.category, row.bucket);

  return { month, rows: [...readIncome(grid, month, problems), ...rows], categories, problems };
}
