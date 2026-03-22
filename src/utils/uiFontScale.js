/** localStorage key — keep in sync with Settings “Display” UI */
export const UI_FONT_SCALE_KEY = 'lab_ui_font_scale';

const VALID = new Set(['sm', 'default', 'lg']);

/**
 * @returns {'sm' | 'default' | 'lg'}
 */
export function getUiFontScale() {
  if (typeof window === 'undefined') return 'default';
  try {
    const v = localStorage.getItem(UI_FONT_SCALE_KEY);
    if (VALID.has(v)) return v;
  } catch (_) { /* ignore */ }
  return 'default';
}

/**
 * @param {'sm' | 'default' | 'lg'} scale
 */
export function setUiFontScale(scale) {
  const s = VALID.has(scale) ? scale : 'default';
  try {
    localStorage.setItem(UI_FONT_SCALE_KEY, s);
  } catch (_) { /* ignore */ }
  applyUiFontScale(s);
}

/**
 * @param {'sm' | 'default' | 'lg'} [scale]
 */
export function applyUiFontScale(scale) {
  if (typeof document === 'undefined') return;
  const s = scale != null && VALID.has(scale) ? scale : getUiFontScale();
  document.documentElement.dataset.uiFontScale = s;
}
