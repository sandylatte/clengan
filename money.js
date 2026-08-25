export function toCents(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();

    // Reject empty strings explicitly
    if (trimmed === '') {
      throw new TypeError(`not a finite number: ${JSON.stringify(value)}`);
    }

    // Validate by parsing as number
    const number = Number(trimmed);
    if (!Number.isFinite(number)) {
      throw new TypeError(`not a finite number: ${JSON.stringify(value)}`);
    }

    // Parse string directly to handle decimals with proper rounding
    return toCentsFromString(trimmed);
  }

  // Handle number input
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`not a finite number: ${JSON.stringify(value)}`);
  }

  const scaled = value * 100;
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

export function formatAmount(cents) {
  const text = fromCents(cents);
  return cents > 0 ? `+${text}` : text;
}
