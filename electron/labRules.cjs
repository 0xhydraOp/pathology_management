/**
 * Shared lab business rules (Node / Electron).
 * Keep SQL + normalization logic in sync with `src/utils/labRules.js`.
 */

/** SQL fragment: exclude walk-in / self-style referrers (append after WHERE … referred_by IS NOT NULL …). */
const SQL_EXCLUDE_WALK_IN_REFERRALS =
  " AND LOWER(TRIM(p.referred_by)) NOT IN ('self', 'walk in', 'walkin', 'walk-in', 'direct') ";

const WALK_IN_LOWER = new Set(['self', 'walk in', 'walkin', 'walk-in', 'direct']);

/**
 * @param {unknown} value
 * @returns {string|null} Canonical stored value, or null if empty / no referrer
 */
function normalizeReferrerName(value) {
  if (value == null) return null;
  const t = String(value).trim().replace(/\s+/g, ' ');
  if (!t) return null;
  const key = t.toLowerCase();
  if (WALK_IN_LOWER.has(key)) return 'Self';
  return t;
}

/**
 * @param {unknown} referredBy
 * @returns {boolean}
 */
function isWalkInReferrer(referredBy) {
  const n = normalizeReferrerName(referredBy);
  return n == null || n === 'Self';
}

module.exports = {
  SQL_EXCLUDE_WALK_IN_REFERRALS,
  normalizeReferrerName,
  isWalkInReferrer,
};
