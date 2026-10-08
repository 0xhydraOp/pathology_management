import schema from '../../electron/numericResult.json';
const decimal = new RegExp(schema.pattern);
export function parseNumericResult(value) {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return null;
  if (typeof value !== 'number' && typeof value !== 'string') throw new Error('Enter a finite decimal number');
  if (!decimal.test(String(value).trim()) || !Number.isFinite(Number(value))) throw new Error('Enter a finite decimal number');
  return Number(value);
}
export function isValidNumericResult(value) {
  try { return parseNumericResult(value) !== null; } catch { return false; }
}
