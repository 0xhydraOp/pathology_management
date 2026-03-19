/**
 * Order dates from SQLite are often 'YYYY-MM-DD'. Parsing with `new Date(s)`
 * uses UTC midnight and can show the wrong calendar day in local time.
 */

export function parseOrderDateLocal(d) {
  if (!d) return null;
  const s = String(d);
  const x = new Date(s.length === 10 ? `${s}T12:00:00` : s);
  return Number.isNaN(x.getTime()) ? null : x;
}

/** DD-MM-YYYY (Billing-style lists). */
export function formatOrderDateDisplay(d) {
  const x = parseOrderDateLocal(d);
  if (!x) return '—';
  return `${String(x.getDate()).padStart(2, '0')}-${String(x.getMonth() + 1).padStart(2, '0')}-${x.getFullYear()}`;
}

/** e.g. "18 Mar" */
export function formatOrderDateShortIN(d) {
  const x = parseOrderDateLocal(d);
  if (!x) return '—';
  return x.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

/** e.g. "18 Mar 2026" */
export function formatOrderDateMediumIN(d) {
  const x = parseOrderDateLocal(d);
  if (!x) return '—';
  return x.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
