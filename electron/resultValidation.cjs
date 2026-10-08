const { pattern } = require('./numericResult.json');
const decimal = new RegExp(pattern);
function parseNumericResult(value) {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return null;
  if (typeof value !== 'number' && typeof value !== 'string') throw new Error('Enter a finite decimal number');
  if (!decimal.test(String(value).trim()) || !Number.isFinite(Number(value))) throw new Error('Enter a finite decimal number');
  return Number(value);
}
module.exports = { parseNumericResult };
