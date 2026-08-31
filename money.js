export function toCents(value) {
  let number;
  let useStringParsing = false;

  if (typeof value === 'string') {
    const trimmed = value.trim();

    // Reject empty strings explicitly
    if (trimmed === '') {
      throw new TypeError(`not a finite number: ${JSON.stringify(value)}`);
    }

    // Validate by parsing as number
    number = Number(trimmed);
    if (!Number.isFinite(number)) {
      throw new TypeError(`not a finite number: ${JSON.stringify(value)}`);
    }

    // Use character-level parsing for plain decimals only; exponential
    // notation routes through the number path to avoid silent corruption.
    useStringParsing = !/[eE]/.test(trimmed);
    if (useStringParsing) {
      return toCentsFromString(trimmed);
    }
  } else {
    // Handle number input
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError(`not a finite number: ${JSON.stringify(value)}`);
    }
    number = value;
  }

  // Use number path for exponential notation and non-string numbers
  const scaled = number * 100;
  // Round half away from zero (not banker's rounding)
  const rounded = scaled >= 0
    ? Math.floor(scaled + 0.5)
    : Math.ceil(scaled - 0.5);

  return rounded === 0 ? 0 : rounded;
}

function toCentsFromString(str) {
  const isNegative = str.startsWith('-');
  const unsigned = str.replace(/^-/, '');

  const dotIndex = unsigned.indexOf('.');

  if (dotIndex === -1) {
    // No decimal point
    const cents = parseInt(unsigned) * 100;
    return isNegative ? -cents : cents;
  }

  const whole = unsigned.substring(0, dotIndex);
  const frac = unsigned.substring(dotIndex + 1);

  let cents = parseInt(whole || '0') * 100;

  if (frac.length === 0) {
    // No fractional part
  } else if (frac.length === 1) {
    // One decimal place: pad with zero
    cents += parseInt(frac) * 10;
  } else if (frac.length === 2) {
    // Two decimal places: exact
    cents += parseInt(frac);
  } else {
    // More than two decimal places: round half away from zero
    cents += parseInt(frac.substring(0, 2));
    if (parseInt(frac[2]) >= 5) {
      cents += 1;
    }
  }

  return isNegative ? -cents : cents;
}

export function fromCents(cents) {
  if (!Number.isInteger(cents)) {
    throw new TypeError(`not an integer cent value: ${JSON.stringify(cents)}`);
  }
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  const whole = Math.floor(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, '0');
  return `${sign}${whole}.${fraction}`;
}

// fromCents above is the machine format: it feeds the Excel export and must
// stay a plain parseable decimal, because importXlsx reads its own output
// back. Everything below is for the screen only. Keeping the two apart is
// what lets the display carry a currency symbol and grouping dots without
// making a backup file unreadable.

// Rupiah has no circulating subunit — sen was withdrawn in 2002 — so amounts
// display as whole rupiah with dots for thousands: Rp 300.000. Storage stays
// integer cents so the arithmetic and the round-trip are unchanged; only the
// last step before a screen rounds away the hundredths.
export function formatIDR(cents) {
  if (!Number.isInteger(cents)) {
    throw new TypeError(`not an integer cent value: ${JSON.stringify(cents)}`);
  }
  const rupiah = Math.round(Math.abs(cents) / 100);
  const grouped = String(rupiah).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${cents < 0 ? '-' : ''}Rp ${grouped}`;
}

// Digits as typed into a money field, grouped for reading: '5000000' becomes
// '5.000.000'. Separate from formatIDR because a field is edited a character
// at a time and must not gain a currency symbol the user then has to type
// around.
export function groupDigits(digits) {
  const clean = String(digits).replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// A money field holds whole rupiah; storage is cents. Rupiah has no
// circulating subunit, so the conversion is exact and never loses a fraction.
export function rupiahToCents(text) {
  const digits = String(text).replace(/\D/g, '');
  return digits === '' ? null : Number(digits) * 100;
}

export function centsToRupiahDigits(cents) {
  return String(Math.round(Math.abs(cents) / 100));
}

export function formatAmount(cents) {
  const text = formatIDR(cents);
  return cents > 0 ? `+${text}` : text;
}
