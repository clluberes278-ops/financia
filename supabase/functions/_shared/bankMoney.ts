const MAX_CENTS = 99999999999999;

/** Parse a complete bank amount; a lone thousands separator is ambiguous. */
export function parseBankAmount(value: string): number | null {
  const input = value.trim();
  let normalized: string;
  if (/^\d{1,3}(?:,\d{3})+\.\d{1,2}$/.test(input)) {
    normalized = input.replace(/,/g, '');
  } else if (/^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(input)) {
    normalized = input.replace(/\./g, '').replace(',', '.');
  } else if (/^\d+(?:[.,]\d{1,2})?$/.test(input)) {
    normalized = input.replace(',', '.');
  } else {
    return null;
  }

  const [whole, fraction = ''] = normalized.split('.');
  // Build cents from digits instead of rounding a floating-point amount.
  const cents = Number(whole + fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_CENTS) return null;
  return cents / 100;
}
