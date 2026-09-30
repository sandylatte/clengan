import { toCents } from './money.js';

// One-time migration from a planner workbook. This is a layout spreadsheet,
// not a data table, and the person keeping it rearranges it: columns move,
// headings get renamed, tabs get renamed, a table gets split in two. So
// nothing here is found by position. A table is any heading row that names
// at least a category-like and an amount-like column; everything else about
// it (which bucket, which month) is read off the sheet around it.
//
// Not the app's backup format. The flat export in xlsx-io.js is that.

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

// 'sep', 'Sept', 'SEPTEMBER' -> 9. A prefix of at least three letters, so
// 'mar' is March but 'marketing' is not.
function monthNumber(word) {
  const w = word.toLowerCase();
  if (w === 'sept') return 9;
  if (w.length < 3) return null;
  const index = MONTH_NAMES.findIndex((name) => name.startsWith(w));
  return index === -1 ? null : index + 1;
}

const pad = (n) => String(n).padStart(2, '0');
const tokens = (text) => String(text ?? '').toLowerCase().match(/[a-z]+|\d+/g) ?? [];

// Reads a month out of a tab name or a title cell: '2026_SEPT',
// 'September 2026', 'Sep-26', '2026-09', or just 'Sept'. Returns
// { year, month } with year null when the label does not say. `strict` is
// for title cells, where every word must be part of the month, so a line of
// prose that happens to contain "may" is not read as May.
export function parseMonthLabel(text, { strict = false } = {}) {
  const parts = tokens(text);
  let month = null;
  let year = null;
  const numbers = [];
  for (const part of parts) {
    if (/^\d+$/.test(part)) { numbers.push(part); continue; }
    const m = monthNumber(part);
    if (m && month === null) month = m;
    else if (strict) return null;
  }
  for (const n of numbers) if (n.length === 4 && year === null) year = Number(n);
  for (const n of numbers) {
    if (n.length === 4 && Number(n) === year) continue;
    // 'Sep-26' is a two-digit year; '2026-09' is a numbered month. A number
    // is only a month next to a four-digit year, so 'Sheet1' is not January.
    if (month !== null && year === null && n.length <= 2) year = 2000 + Number(n);
    else if (month === null && year !== null && Number(n) >= 1 && Number(n) <= 12) month = Number(n);
    else if (strict) return null;
  }
  return month === null ? null : { year, month };
}

// '2026_SEPT' -> '2026-09'. Only when the name gives both a month and a year.
export function monthFromSheetName(name) {
  const label = parseMonthLabel(name);
  return label?.year ? `${label.year}-${pad(label.month)}` : null;
}

const daysIn = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

function isoDate(year, month, day) {
  if (!year || month < 1 || month > 12 || day < 1 || day > daysIn(year, month)) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

// Excel stores a date as days since 1899-12-30.
function fromSerial(serial) {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
  return d.toISOString().slice(0, 10);
}

// Dates repeat down a run in the source: only the first row of a day carries
// one. A blank date means "same day as the row above", not a broken row.
// `hint` is the sheet's own month, used for dates that leave out the year
// ('1-Sep', '15') and to settle 3/9 versus 9/3 when only one reading lands
// in the sheet's month. Without a hint, slash dates read month-first.
export function parseDate(value, fallback, hint = {}) {
  if (typeof value === 'number') {
    if (value >= 20000 && value < 80000) return fromSerial(value);
    if (Number.isInteger(value) && value >= 1 && value <= 31) return isoDate(hint.year, hint.month, value);
    return null;
  }
  const text = String(value ?? '').trim();
  if (text === '') return fallback;
  if (/^\d{1,2}$/.test(text)) return isoDate(hint.year, hint.month, Number(text));

  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text);
  if (iso) return isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const slash = /^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2}|\d{4}))?$/.exec(text);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const year = slash[3] ? (slash[3].length === 2 ? 2000 + Number(slash[3]) : Number(slash[3])) : hint.year;
    const dayFirst = a > 12 || (b <= 12 && hint.month && b === hint.month && a !== hint.month);
    return dayFirst ? isoDate(year, b, a) : isoDate(year, a, b);
  }

  // Month written as a word: '1-Sep', 'Sep 1', 'September 1, 2026'.
  const parts = tokens(text);
  let month = null;
  let day = null;
  let year = null;
  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      if (part.length === 4) year = Number(part);
      else if (day === null) day = Number(part);
      else year = 2000 + Number(part);
    } else if (monthNumber(part) && month === null) month = monthNumber(part);
    else return null;
  }
  if (month === null || day === null) return null;
  return isoDate(year ?? hint.year, month, day);
}

export function parseAmount(value) {
  if (typeof value === 'number') return toCents(value);
  let text = String(value ?? '').trim();
  // Accounting formats show a lone dash for zero.
  if (text === '' || text === '-') return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) { negative = true; text = text.slice(1, -1); }
  text = text.replace(/php|pesos?|usd|[₱$€£¥,\s]/gi, '').replace(/^p(?=[\d.])/i, '');
  if (text.endsWith('-')) { negative = true; text = text.slice(0, -1); }
  const cents = toCents(text);
  return negative ? -cents : cents;
}

// Heading words for each column a table can have, matched on the heading's
// first or last word so 'Date Paid', 'Due Date' and 'Amount (PHP)' all count.
// 'text' is a description column: the category when there is no category
// column, a note when there is.
const ROLE_WORDS = {
  date: ['date', 'day', 'when'],
  category: ['category', 'categories', 'item', 'items', 'particulars', 'expense', 'name', 'payee', 'merchant', 'purpose', 'source'],
  amount: ['amount', 'amt', 'cost', 'price', 'spent', 'spend', 'php', 'peso', 'pesos'],
  note: ['note', 'notes', 'remark', 'remarks', 'memo', 'comment', 'comments'],
  text: ['description', 'desc', 'details', 'detail'],
  bucket: ['bucket', 'kind', 'group', 'type'],
};

function roleOf(cell) {
  if (typeof cell !== 'string') return null;
  const text = cell.trim();
  if (text === '' || text.length > 30) return null;
  if (/^[₱$]$/.test(text)) return 'amount';
  const words = text.toLowerCase().replace(/\(.*?\)/g, ' ').match(/[a-z]+/g);
  if (!words) return null;
  for (const [role, list] of Object.entries(ROLE_WORDS)) {
    if (list.includes(words[0]) || list.includes(words[words.length - 1])) return role;
  }
  return null;
}

const isBlank = (cell) => String(cell ?? '').trim() === '';
const ROLES = Object.keys(ROLE_WORDS);
const hasRole = (block) => ROLES.some((r) => block[r] !== undefined);
const usable = (block) => block.amount !== undefined && (block.category !== undefined || block.text !== undefined);

// Splits one row into tables. A blank heading cell or a repeated column ends
// a table, which is how two tables side by side separate; a heading nobody
// recognises ('Percent') just sits inside one. A piece too small to be a table
// on its own is joined to the next, so a table with one blank heading
// between its columns is not lost. A heading row holds no numbers, which
// keeps a data row whose category happens to read "Gas Payment" from being
// taken for one.
function blocksInRow(row) {
  const pieces = [];
  let current = null;
  row.forEach((cell, col) => {
    if (isBlank(cell)) { current = null; return; }
    const role = roleOf(cell);
    if (!current || (role && current[role] !== undefined)) {
      current = { start: col };
      pieces.push(current);
    }
    current.end = col;
    if (role) current[role] = col;
  });
  const blocks = [];
  for (const piece of pieces.filter(hasRole)) {
    const last = blocks[blocks.length - 1];
    const clash = last && ROLES.some((r) => last[r] !== undefined && piece[r] !== undefined);
    if (last && !usable(last) && !clash) Object.assign(last, { ...piece, start: last.start });
    else blocks.push(piece);
  }
  const numeric = (block) => row.slice(block.start, block.end + 1)
    .some((cell) => typeof cell === 'number' || (!isBlank(cell) && isNumberish(String(cell))));
  return blocks.filter((block) => usable(block) && !numeric(block));
}

function findBlocks(grid) {
  return grid.flatMap((row, r) => blocksInRow(row ?? []).map((block) => ({ ...block, row: r })));
}

const overlaps = (a, b) => a.start <= b.end && b.start <= a.end;

// What a table is for comes from the nearest heading above it, within its
// own columns: 'Fixed Expenses', 'Flexible', 'Savings', 'Income'.
function labelFor(grid, block, blocks) {
  for (let r = block.row - 1; r >= Math.max(0, block.row - 8); r -= 1) {
    if (blocks.some((b) => b.row === r && overlaps(b, block))) return null;
    const line = grid[r] ?? [];
    for (let c = block.start; c <= block.end; c += 1) {
      const kind = kindOf(line[c]);
      if (kind) return kind;
    }
  }
  return null;
}

function kindOf(cell) {
  const text = String(cell ?? '').toLowerCase();
  if (/fixed/.test(text)) return 'fixed';
  if (/flex|variable/.test(text)) return 'flexible';
  if (/saving/.test(text)) return 'savings';
  if (/income|earning/.test(text)) return 'income';
  return null;
}

const cellText = (cell) => String(cell ?? '').trim();
const isSummaryRow = (text) => /^(sub\s*|grand\s*)?totals?\b/i.test(text);
const isNumberish = (text) => /^[\d.,\s₱$()-]+$/.test(text);

function readBlock(grid, block, blocks, ctx, problems) {
  const rows = [];
  const next = blocks.find((b) => b.row > block.row && overlaps(b, block));
  const stop = next ? next.row : grid.length;
  const categoryCol = block.category ?? block.text;
  const noteCol = block.note ?? (block.category !== undefined ? block.text : undefined);
  const where = (r) => `${ctx.sheet} row ${r + 1}`;
  let lastDate = null;

  for (let r = block.row + 1; r < stop; r += 1) {
    const line = grid[r] ?? [];
    const category = cellText(line[categoryCol]);
    // A row is only real when it names a category and an amount. Every
    // other shape is the spreadsheet's own padding, and a Total line is the
    // sheet adding itself up, not a transaction.
    if (!category || isSummaryRow(category) || isNumberish(category)) continue;
    let amount;
    try {
      amount = parseAmount(line[block.amount]);
    } catch {
      problems.push(`${where(r)}: amount is not a number: "${line[block.amount]}"`);
      continue;
    }
    if (amount === null || amount === 0) continue;

    let date;
    if (block.date !== undefined) date = parseDate(line[block.date], lastDate, ctx);
    else date = ctx.month ? `${ctx.monthKey}-01` : null;
    if (!date) {
      problems.push(`${where(r)}: no usable date for "${category}"`);
      continue;
    }
    lastDate = date;

    // These workbooks are made by copying last month's sheet, so the dates
    // often still name the month it was copied from. When the sheet says
    // which month it is, that wins — but every correction is reported,
    // because silently moving a row to another month is exactly the kind of
    // edit that makes a total impossible to reconcile.
    let filed = date;
    if (ctx.declared && date.slice(0, 7) !== ctx.monthKey) {
      const day = Math.min(Number(date.slice(8, 10)), daysIn(ctx.year, ctx.month));
      filed = `${ctx.monthKey}-${pad(day)}`;
      problems.push(`${where(r)}: "${category}" was dated ${date}; filed under ${filed} to match the sheet.`);
    }

    const kind = kindOf(block.bucket !== undefined ? line[block.bucket] : '') ?? block.kind;
    rows.push({
      date: filed,
      category,
      amount: kind === 'income' ? Math.abs(amount) : -Math.abs(amount),
      note: noteCol === undefined ? '' : cellText(line[noteCol]),
      bucket: kind === 'fixed' || kind === 'flexible' ? kind : null,
    });
  }
  return rows;
}

// Income that is a plain list under an "Income" heading — a name, then its
// amount — rather than a table with its own headings. The list has no dates,
// so each entry lands on the first of the month, the only date the source
// supports.
const INCOME_HEADING = /^(income|incomes|earnings|revenue|money in)$/i;

function readIncomeList(grid, blocks, monthKey, sheet, problems) {
  const rows = [];
  for (let r = 0; r < grid.length; r += 1) {
    const line = grid[r] ?? [];
    for (let c = 0; c < line.length; c += 1) {
      if (!INCOME_HEADING.test(cellText(line[c]))) continue;
      // The dashboard has a second "Income" heading, in the summary strip,
      // whose next row is the total rather than a label. A real income list
      // is the one whose first entry names something. Without this the
      // summary total imports as a transaction called "300,200". A heading
      // over a proper table is left to that table.
      const below = cellText((grid[r + 1] ?? [])[c]);
      if (below === '' || isNumberish(below)) continue;
      if (blocks.some((b) => b.row > r && b.row <= r + 2 && b.start <= c && c <= b.end)) continue;
      for (let n = r + 1; n < grid.length; n += 1) {
        const entry = grid[n] ?? [];
        const label = cellText(entry[c]);
        if (!label || isSummaryRow(label)) break;
        const offset = [1, 2, 3].find((k) => !isBlank(entry[c + k])) ?? 1;
        let amount;
        try {
          amount = parseAmount(entry[c + offset]);
        } catch {
          problems.push(`${sheet} row ${n + 1}: income amount is not a number: "${entry[c + offset]}"`);
          break;
        }
        if (amount === null || amount === 0) continue;
        rows.push({ date: `${monthKey}-01`, category: label, amount: Math.abs(amount), note: '', bucket: null });
      }
      return rows;
    }
  }
  return rows;
}

// The month a sheet is about: its tab name, else a title cell near the top
// ('2026_SEPTEMBER'). A label without a year borrows one from the dates in
// the sheet's date columns (not any number — a 30,000 salary is not a date),
// then from `fallbackYear`.
function declaredMonth(grid, name, blocks, fallbackYear) {
  let label = parseMonthLabel(name);
  if (!label) {
    for (const line of grid.slice(0, 6)) {
      label = (line ?? []).map((cell) => (typeof cell === 'string' ? parseMonthLabel(cell, { strict: true }) : null)).find(Boolean);
      if (label) break;
    }
  }
  if (!label) return null;
  if (!label.year) {
    const years = blocks.filter((b) => b.date !== undefined)
      .flatMap((b) => grid.slice(b.row + 1).map((line) => parseDate((line ?? [])[b.date], null)))
      .filter(Boolean)
      .map((date) => Number(date.slice(0, 4)));
    label.year = mostCommon(years) ?? fallbackYear;
  }
  return label;
}

function mostCommon(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = null;
  for (const [v, n] of counts) if (best === null || n > counts.get(best)) best = v;
  return best;
}

// Returns the sheet's rows plus the categories it used, each tagged with the
// table it came from, or null when the sheet holds nothing to import. When
// neither the tab nor a title says which month the sheet is, the rows keep
// their own dates and the month reported is the one most of them fall in.
export function parsePlannerSheet(grid, name, fallbackYear = new Date().getFullYear()) {
  const problems = [];
  const blocks = findBlocks(grid);
  const label = declaredMonth(grid, name, blocks, fallbackYear);
  const ctx = label
    ? { sheet: name, declared: true, year: label.year, month: label.month, monthKey: `${label.year}-${pad(label.month)}` }
    : { sheet: name, declared: false };

  // A heading says what a table is for. When no table has one, the old
  // layout's order stands: the first is fixed, the second flexible.
  for (const block of blocks) block.kind = labelFor(grid, block, blocks);
  if (blocks.every((b) => !b.kind)) blocks.forEach((b, i) => { b.kind = ['fixed', 'flexible'][i] ?? null; });

  const read = blocks
    .filter((b) => b.kind !== 'savings')
    .map((block) => ({ block, rows: readBlock(grid, block, blocks, ctx, problems) }));

  // A dashboard adds its own ledgers up: a "Monthly Expenses" table of
  // Category / Amount, one line per category. Imported, every peso would
  // count twice. It shows itself by having no dates while naming only
  // categories the dated tables already carry.
  const dated = new Set(read.filter(({ block }) => block.date !== undefined)
    .flatMap(({ rows }) => rows.map((row) => row.category)));
  const isRollup = ({ block, rows }) => block.date === undefined && dated.size > 0
    && rows.length > 0 && rows.every((row) => dated.has(row.category));
  const spending = read.filter((entry) => !isRollup(entry)).flatMap(({ rows }) => rows);

  if (!ctx.declared) {
    const key = mostCommon(spending.map((row) => row.date.slice(0, 7)));
    if (!key) return null;
    ctx.monthKey = key;
  }
  const rows = [...readIncomeList(grid, blocks, ctx.monthKey, name, problems), ...spending];
  if (rows.length === 0 && problems.length === 0) return null;

  // Every spending category, bucketed or not, so the app learns its name.
  const categories = new Map();
  for (const row of spending) if (row.amount < 0 && !categories.has(row.category)) categories.set(row.category, row.bucket);
  return { month: ctx.monthKey, rows, categories, problems };
}

// A whole workbook: `sheets` is [{ name, grid }] in tab order. A tab that
// names a month but not a year takes the year most other tabs name.
export function parsePlannerBook(sheets) {
  const years = sheets.map(({ name }) => parseMonthLabel(name)?.year).filter(Boolean);
  const fallbackYear = mostCommon(years) ?? new Date().getFullYear();
  return sheets.map(({ name, grid }) => parsePlannerSheet(grid, name, fallbackYear)).filter(Boolean);
}

// Kept for callers that already know the month: parses one grid as if its
// tab were named for that month.
export function parsePlannerGrid(grid, month) {
  const parsed = parsePlannerSheet(grid, month);
  return parsed ?? { month, rows: [], categories: new Map(), problems: [] };
}
