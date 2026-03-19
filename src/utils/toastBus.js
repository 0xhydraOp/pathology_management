/** Lightweight global toasts — no React dependency (pages can import showToast safely). */

const listeners = new Set();

export function subscribeToast(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * @param {string} message
 * @param {'info'|'success'|'warning'|'error'} [variant]
 */
export function showToast(message, variant = 'info') {
  const toast = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, message, variant };
  listeners.forEach((fn) => {
    try {
      fn(toast);
    } catch (_) {}
  });
}
