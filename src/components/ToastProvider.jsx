import { useEffect, useState, useCallback } from 'react';
import { subscribeToast } from '../utils/toastBus';

const VARIANT_STYLES = {
  info: { bg: '#1e3a5f', border: 'rgba(255,255,255,0.2)' },
  success: { bg: '#0d7377', border: 'rgba(255,255,255,0.25)' },
  warning: { bg: '#b45309', border: 'rgba(255,255,255,0.2)' },
  error: { bg: '#b91c1c', border: 'rgba(255,255,255,0.2)' },
};

const AUTO_DISMISS_MS = 4500;

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    return subscribeToast((toast) => {
      setToasts((prev) => [...prev, toast]);
      window.setTimeout(() => remove(toast.id), AUTO_DISMISS_MS);
    });
  }, [remove]);

  return (
    <>
      {children}
      <div
        className="no-print"
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          zIndex: 999999,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          maxWidth: 380,
          pointerEvents: 'none',
        }}
        aria-live="polite"
      >
        {toasts.map((t) => {
          const v = VARIANT_STYLES[t.variant] || VARIANT_STYLES.info;
          return (
            <div
              key={t.id}
              role="status"
              style={{
                pointerEvents: 'auto',
                color: '#fff',
                padding: '12px 16px',
                borderRadius: 10,
                fontSize: 14,
                lineHeight: 1.45,
                boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                border: `1px solid ${v.border}`,
                background: v.bg,
              }}
            >
              {t.message}
            </div>
          );
        })}
      </div>
    </>
  );
}
