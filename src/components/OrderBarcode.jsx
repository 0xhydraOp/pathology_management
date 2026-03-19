import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

/**
 * Renders a CODE128 barcode (works with most USB scanners reading as keyboard).
 * `value` should match orders.access_code (10 chars A–Z / 2–9).
 */
export default function OrderBarcode({ value, height = 44, fontSize = 11, className = '' }) {
  const svgRef = useRef(null);

  useEffect(() => {
    const el = svgRef.current;
    if (!el || value == null || String(value).trim() === '') return;
    const v = String(value).trim().toUpperCase();
    try {
      while (el.firstChild) el.removeChild(el.firstChild);
      JsBarcode(el, v, {
        format: 'CODE128',
        displayValue: true,
        fontSize,
        height,
        margin: 2,
        width: 1.4,
        background: 'transparent',
      });
    } catch (e) {
      console.warn('OrderBarcode:', e);
    }
  }, [value, height, fontSize]);

  if (value == null || String(value).trim() === '') return null;

  return (
    <div className={`order-barcode-wrap ${className}`.trim()} style={wrapStyle}>
      <svg ref={svgRef} className="order-barcode-svg" role="img" aria-label={`Barcode ${String(value).trim()}`} />
    </div>
  );
}

const wrapStyle = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  width: '100%',
};
