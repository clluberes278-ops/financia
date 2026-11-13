export function parseMoney(input: string): number {
  const value = input.trim();
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value)) return NaN;
  return Number(value.replace(',', '.'));
}
