import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import OrderBarcode from '../components/OrderBarcode.jsx';
import { formatOrderDateDisplay } from '../utils/dateDisplay';

function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function Billing() {
  const navigate = useNavigate();
  const today = toLocalDateStr(new Date());
  const weekAgo = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return toLocalDateStr(d);
  })();
  const [filter, setFilter] = useState('month');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [customFrom, setCustomFrom] = useState(weekAgo);
  const [customTo, setCustomTo] = useState(today);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [updating, setUpdating] = useState(null);
  const [recalculating, setRecalculating] = useState(false);
  const [invoiceOrder, setInvoiceOrder] = useState(null);
  const [invoiceData, setInvoiceData] = useState(null);
  const [printOnOpen, setPrintOnOpen] = useState(false);
  const [sortCol, setSortCol] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'table'
  const [unpaidFirst, setUnpaidFirst] = useState(true);
  const [recalcMessage, setRecalcMessage] = useState('');
  const [labConfig, setLabConfig] = useState({ name: 'MONDAL DIAGNOSTIC CENTRE', email: '', phone: '', default_printed_by: 'Admin' });
  const [invoicePrintHint, setInvoicePrintHint] = useState('');
  const invoiceOrderIdRef = useRef(null);

  /** Electron: window.print() often shows “no print preview” on Windows; PDF preview works. */
  const runInvoicePrint = useCallback(async () => {
    setInvoicePrintHint('');
    if (typeof window.electronPrintPreview === 'function') {
      const result = await window.electronPrintPreview();
      if (result?.ok) {
        setInvoicePrintHint('Invoice opened in PDF preview — use Print there (full preview).');
        setTimeout(() => setInvoicePrintHint(''), 5000);
        return;
      }
      setInvoicePrintHint(
        result?.error ? `Preview failed — opening print dialog instead.` : 'Preview unavailable — opening print dialog…'
      );
      setTimeout(() => setInvoicePrintHint(''), 4500);
    }
    if (typeof window.electronPrint === 'function') {
      await window.electronPrint(1);
      setInvoicePrintHint('Use the print dialog to finish.');
      setTimeout(() => setInvoicePrintHint(''), 4000);
      return;
    }
    window.print();
  }, []);

  useEffect(() => {
    if (window.db?.getLabConfig) {
      window.db.getLabConfig().then((c) => c && setLabConfig((prev) => ({
        ...prev,
        name: c.name || prev.name,
        email: c.email || prev.email,
        phone: c.phone || prev.phone,
        default_printed_by: c.default_printed_by || prev.default_printed_by,
      }))).catch(() => {});
    }
  }, []);

  const closeInvoice = useCallback(() => {
    invoiceOrderIdRef.current = null;
    setInvoiceOrder(null);
    setInvoiceData(null);
  }, []);

  const getDateRange = useCallback((f, from, to) => {
    const now = new Date();
    let start, end;
    if (f === 'today') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (f === 'week') {
      end = new Date(now);
      start = new Date(now);
      start.setDate(start.getDate() - 7);
    } else if (f === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now);
    } else if (f === 'lastmonth') {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
    } else if (f === 'year') {
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date();
    } else if (f === 'custom' && from && to) {
      const d1 = new Date(from);
      const d2 = new Date(to);
      start = d1 <= d2 ? d1 : d2;
      end = d1 <= d2 ? d2 : d1;
    } else {
      start = new Date(2000, 0, 1);
      end = new Date();
    }
    return [toLocalDateStr(start), toLocalDateStr(end)];
  }, []);

  const loadOrders = useCallback(async () => {
    if (!window.db) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [start, end] = getDateRange(filter, customFrom, customTo);
      const rows = await window.db.all(
        `SELECT o.id, o.order_date, o.status, o.total_amount, o.payment_status, o.referring_doctor, o.access_code,
         p.patient_id, p.name as patient_name, p.age, p.sex, p.phone, p.address, p.referred_by
         FROM orders o
         JOIN patients p ON o.patient_id = p.id
         WHERE date(o.order_date) >= ? AND date(o.order_date) <= ?
         ORDER BY o.order_date DESC, o.id DESC`,
        [start, end]
      );
      const withTestCount = await Promise.all(
        (rows || []).map(async (r) => {
          const countRow = await window.db.get('SELECT COUNT(*) as c FROM order_tests WHERE order_id = ?', [r.id]);
          return { ...r, test_count: countRow?.c ?? 0 };
        })
      );
      setOrders(withTestCount || []);
    } catch (e) {
      console.error(e);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [filter, customFrom, customTo, getDateRange]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);


  useEffect(() => {
    if (!invoiceData || !printOnOpen) return;
    const t = setTimeout(() => {
      runInvoicePrint();
      setPrintOnOpen(false);
    }, 350);
    return () => clearTimeout(t);
  }, [invoiceData, printOnOpen, runInvoicePrint]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && invoiceData) closeInvoice();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [invoiceData, closeInvoice]);

  const loadInvoiceData = useCallback(async (order) => {
    if (!window.db || !order) return;
    const orderId = order.id;
    try {
      const tests = await window.db.all(
        `SELECT ot.parameter_id, ot.rate, ot.display_order, p.name as test_name
         FROM order_tests ot
         JOIN parameters p ON p.id = ot.parameter_id
         WHERE ot.order_id = ?
         ORDER BY ot.display_order`,
        [orderId]
      );
      const rateMap = {};
      const rateRows = await window.db.all('SELECT parameter_id, rate FROM test_rates');
      (rateRows || []).forEach((r) => { rateMap[r.parameter_id] = parseFloat(r.rate) || 0; });

      const items = (tests || []).map((t) => ({
        name: t.test_name,
        rate: parseFloat(t.rate) || rateMap[t.parameter_id] || 0,
      }));
      const total = items.reduce((s, i) => s + i.rate, 0);
      let accessCode = order.access_code;
      if ((!accessCode || !String(accessCode).trim()) && orderId) {
        try {
          const ac = await window.db.get('SELECT access_code FROM orders WHERE id = ?', [orderId]);
          accessCode = ac?.access_code;
        } catch (_) {}
      }
      if (invoiceOrderIdRef.current === orderId) {
        setInvoiceData({ order: { ...order, access_code: accessCode }, items, total });
      }
    } catch (e) {
      console.error(e);
      if (invoiceOrderIdRef.current === orderId) setInvoiceData(null);
    }
  }, []);

  const handleViewInvoice = (o, doPrint = false) => {
    invoiceOrderIdRef.current = o.id;
    setPrintOnOpen(doPrint);
    setInvoiceOrder(o);
    loadInvoiceData(o);
  };

  const handleRecalculateAll = async () => {
    if (!window.db || recalculating) return;
    setRecalculating(true);
    setRecalcMessage('');
    try {
      const [start, end] = getDateRange(filter, customFrom, customTo);
      const orderRows = await window.db.all(
        'SELECT id FROM orders WHERE date(order_date) >= ? AND date(order_date) <= ?',
        [start, end]
      );
      const n = (orderRows || []).length;
      for (const row of orderRows || []) {
        await window.db.computeOrderBillAndCommission(row.id);
      }
      await loadOrders();
      const openId = invoiceOrderIdRef.current;
      if (openId && window.db) {
        try {
          const latest = await window.db.get(
            `SELECT o.id, o.order_date, o.status, o.total_amount, o.payment_status, o.referring_doctor, o.access_code,
             p.patient_id, p.name as patient_name, p.age, p.sex, p.phone, p.address, p.referred_by
             FROM orders o JOIN patients p ON o.patient_id = p.id WHERE o.id = ?`,
            [openId]
          );
          if (latest && invoiceOrderIdRef.current === openId) {
            const countRow = await window.db.get('SELECT COUNT(*) as c FROM order_tests WHERE order_id = ?', [openId]);
            const ord = { ...latest, test_count: countRow?.c ?? 0 };
            setInvoiceOrder(ord);
            loadInvoiceData(ord);
          }
        } catch (_) {}
      }
      setRecalcMessage(`Bills updated: ${n} order(s) for ${start} → ${end}.`);
      setTimeout(() => setRecalcMessage(''), 4500);
    } catch (e) {
      console.error(e);
      setRecalcMessage('Recalculate failed — try again.');
      setTimeout(() => setRecalcMessage(''), 4000);
    } finally {
      setRecalculating(false);
    }
  };

  const handlePaymentToggle = async (order) => {
    if (!window.db || updating || !order) return;
    const orderId = order.id;
    const isPaid = String(order.payment_status || '').toLowerCase() === 'paid';
    const next = isPaid ? 'unpaid' : 'paid';
    const label = order.patient_name || order.patient_id || `Order #${orderId}`;
    const amount = parseFloat(order.total_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
    const ok = window.confirm(
      next === 'paid'
        ? `Mark this bill as PAID?\n\n${label}\nAmount: ₹${amount}`
        : `Mark this bill as UNPAID?\n\n${label}\n(Currently marked paid)`
    );
    if (!ok) return;
    setUpdating(orderId);
    try {
      await window.db.run('UPDATE orders SET payment_status = ? WHERE id = ?', [next, orderId]);
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, payment_status: next } : o))
      );
      if (invoiceOrder?.id === orderId) {
        setInvoiceOrder((prev) => prev ? { ...prev, payment_status: next } : null);
        setInvoiceData((prev) => prev && prev.order?.id === orderId
          ? { ...prev, order: { ...prev.order, payment_status: next } }
          : prev);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setUpdating(null);
    }
  };

  const handlePrintInvoice = () => {
    runInvoicePrint();
  };

  const handleSort = (col) => {
    setSortCol((prevCol) => {
      if (prevCol === col) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prevCol;
      }
      setSortDir('desc');
      return col;
    });
  };

  let filteredOrders = paymentFilter === 'paid'
    ? orders.filter((o) => o.payment_status === 'paid')
    : paymentFilter === 'unpaid'
      ? orders.filter((o) => o.payment_status !== 'paid')
      : orders;
  const q = search.trim();
  const qLower = q.toLowerCase();
  filteredOrders = q
    ? filteredOrders.filter(
        (o) =>
          (o.patient_name || '').toLowerCase().includes(qLower) ||
          (o.patient_id || '').toLowerCase().includes(qLower) ||
          (o.referred_by || '').toLowerCase().includes(qLower) ||
          String(o.id) === q ||
          (o.access_code && o.access_code.toLowerCase().includes(qLower))
      )
    : filteredOrders;

  const sortedOrders = [...filteredOrders].sort((a, b) => {
    if (unpaidFirst) {
      const aPaid = a.payment_status === 'paid';
      const bPaid = b.payment_status === 'paid';
      if (aPaid !== bPaid) return aPaid ? 1 : -1;
    }
    let cmp = 0;
    if (sortCol === 'date') {
      const ad = String(a.order_date || '').slice(0, 10);
      const bd = String(b.order_date || '').slice(0, 10);
      cmp = ad.localeCompare(bd);
    } else if (sortCol === 'patient') {
      cmp = (a.patient_name || '').localeCompare(b.patient_name || '');
    } else if (sortCol === 'amount') {
      cmp = (parseFloat(a.total_amount) || 0) - (parseFloat(b.total_amount) || 0);
    } else if (sortCol === 'status') {
      cmp = (a.payment_status || '').localeCompare(b.payment_status || '');
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const totalAmount = filteredOrders.reduce((s, o) => s + (parseFloat(o.total_amount) || 0), 0);
  const paidCount = filteredOrders.filter((o) => o.payment_status === 'paid').length;
  const unpaidCount = filteredOrders.length - paidCount;

  const PERIODS = [
    { id: 'today', label: 'Today' },
    { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' },
    { id: 'lastmonth', label: 'Last Month' },
    { id: 'year', label: 'Year' },
    { id: 'all', label: 'All' },
    { id: 'custom', label: 'Custom' },
  ];

  const paymentChip = (o) => (o.payment_status === 'paid'
    ? { style: styles.chipPaid, label: 'Paid' }
    : { style: styles.chipDue, label: 'Due' });

  return (
    <div style={styles.container} className="billing-page">
      {/* Hide list/chrome when printing invoice — avoids blank/extra pages */}
      <div className={invoiceData ? 'no-print' : ''}>
      <div style={styles.headerTop}>
        <div style={styles.header}>
          <h1 style={styles.title}>Billing</h1>
          <p style={styles.subtitle}>Open an order to view invoice · Use table view to scan many bills fast</p>
        </div>
        <button
          type="button"
          style={styles.newBillBtnHero}
          onClick={() => navigate('/new-registration')}
          title="Register patient and create bill"
        >
          + New bill
        </button>
      </div>

      <div style={styles.toolbar}>
        <div style={styles.periodRow}>
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              style={{ ...styles.periodBtn, ...(filter === p.id ? styles.periodBtnActive : {}) }}
              onClick={() => setFilter(p.id)}
              aria-pressed={filter === p.id}
            >
              {p.label}
            </button>
          ))}
        </div>
        {filter === 'custom' && (
          <div style={styles.customRow}>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={styles.dateInput} />
            <span style={styles.dateSep}>→</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={styles.dateInput} />
          </div>
        )}
        <div style={styles.searchWrap}>
          <input
            type="text"
            placeholder="Search name, ID, referrer, order #, or barcode…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={styles.searchInput}
            aria-label="Search bills"
          />
          {search.trim() && (
            <button type="button" style={styles.searchClear} onClick={() => setSearch('')} aria-label="Clear search">
              ×
            </button>
          )}
        </div>
        <button style={styles.recalcBtn} onClick={handleRecalculateAll} disabled={recalculating} title="Recalculate totals for this date range">
          {recalculating ? '…' : '↻ Recalc'}
        </button>
        <div style={styles.paymentFilter} role="group" aria-label="Payment filter">
          {[
            { id: 'all', label: 'All', icon: '◆' },
            { id: 'unpaid', label: 'Unpaid', icon: '◐' },
            { id: 'paid', label: 'Paid', icon: '✓' },
          ].map((pf) => (
            <button
              key={pf.id}
              type="button"
              style={{ ...styles.paymentFilterBtn, ...(paymentFilter === pf.id ? styles.paymentFilterActive : {}) }}
              onClick={() => setPaymentFilter(pf.id)}
              aria-pressed={paymentFilter === pf.id}
            >
              <span style={styles.paymentFilterIcon} aria-hidden>{pf.icon}</span> {pf.label}
            </button>
          ))}
        </div>
      </div>

      <div style={styles.subToolbar}>
        <div style={styles.viewToggle} role="group" aria-label="Layout">
          <button
            type="button"
            style={{ ...styles.viewBtn, ...(viewMode === 'cards' ? styles.viewBtnActive : {}) }}
            onClick={() => setViewMode('cards')}
            aria-pressed={viewMode === 'cards'}
          >
            ▦ Cards
          </button>
          <button
            type="button"
            style={{ ...styles.viewBtn, ...(viewMode === 'table' ? styles.viewBtnActive : {}) }}
            onClick={() => setViewMode('table')}
            aria-pressed={viewMode === 'table'}
          >
            ☰ Table
          </button>
        </div>
        <button
          type="button"
          style={{ ...styles.unpaidFirstBtn, ...(unpaidFirst ? styles.unpaidFirstBtnActive : {}) }}
          onClick={() => setUnpaidFirst((v) => !v)}
          aria-pressed={unpaidFirst}
          title="Show unpaid bills before paid (within same sort)"
        >
          Unpaid first {unpaidFirst ? 'ON' : 'Off'}
        </button>
      </div>

      <div style={styles.statsSticky}>
        <div style={styles.statsRow}>
          <span style={styles.statHighlight}>{filteredOrders.length} orders</span>
          <span style={styles.statDivider}>|</span>
          <span style={styles.stat}>₹{totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })} total</span>
          <span style={styles.statDivider}>|</span>
          <span style={styles.statPaid}>{paidCount} paid</span>
          <span style={styles.statUnpaid}>{unpaidCount} due</span>
        </div>
        {recalcMessage && <div style={styles.recalcToast}>{recalcMessage}</div>}
      </div>

      {loading ? (
        <div style={styles.loading}>Loading...</div>
      ) : viewMode === 'table' ? (
        <div style={styles.tableWrap}>
          {sortedOrders.length === 0 ? (
            <div style={styles.empty}>
              <div style={styles.emptyTitle}>{orders.length === 0 ? 'No bills in this period' : 'No bills match your filters'}</div>
              <p style={styles.emptyHint}>
                {orders.length === 0
                  ? 'Try a wider date range (Week / Month / Year) or register a new patient.'
                  : 'Clear the search box, set Payment to All, or widen the date range.'}
              </p>
              <div style={styles.emptyActions}>
                <button type="button" style={styles.emptyBtn} onClick={() => navigate('/new-registration')}>New bill</button>
                {orders.length > 0 && (
                  <button
                    type="button"
                    style={{ ...styles.emptyBtn, ...styles.emptyBtnSecondary }}
                    onClick={() => {
                      setSearch('');
                      setPaymentFilter('all');
                    }}
                  >
                    Clear search & payment filter
                  </button>
                )}
              </div>
            </div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>
                    <button type="button" style={styles.thBtn} onClick={() => handleSort('date')}>Date {sortCol === 'date' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</button>
                  </th>
                  <th style={styles.th}>
                    <button type="button" style={styles.thBtn} onClick={() => handleSort('patient')}>Patient {sortCol === 'patient' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</button>
                  </th>
                  <th style={styles.th}>ID</th>
                  <th style={styles.th}>Referrer</th>
                  <th style={styles.th}>Tests</th>
                  <th style={styles.th}>
                    <button type="button" style={styles.thBtn} onClick={() => handleSort('amount')}>₹ {sortCol === 'amount' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</button>
                  </th>
                  <th style={styles.th}>
                    <button type="button" style={styles.thBtn} onClick={() => handleSort('status')}>Status {sortCol === 'status' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</button>
                  </th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedOrders.map((o) => {
                  const chip = paymentChip(o);
                  return (
                    <tr
                      key={o.id}
                      style={o.payment_status !== 'paid' ? styles.trUnpaid : styles.trPaid}
                      onClick={() => handleViewInvoice(o, false)}
                      className="billing-table-row"
                    >
                      <td style={styles.td}>{formatOrderDateDisplay(o.order_date)}</td>
                      <td style={styles.td}>{o.patient_name ?? '—'}</td>
                      <td style={styles.tdMono}>{o.patient_id}</td>
                      <td style={styles.tdMuted}>{o.referred_by || '—'}</td>
                      <td style={styles.td}>{o.test_count}</td>
                      <td style={styles.tdAmount}>₹{parseFloat(o.total_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                      <td style={styles.td} onClick={(e) => e.stopPropagation()}><span style={chip.style}>{chip.label}</span></td>
                      <td style={styles.tdActions} onClick={(e) => e.stopPropagation()}>
                        <button type="button" style={styles.tableActionBtn} onClick={() => handleViewInvoice(o, false)}>View</button>
                        <button type="button" style={styles.tableActionBtn} onClick={() => handleViewInvoice(o, true)}>Print</button>
                        <button
                          type="button"
                          style={styles.tableToggleBtn}
                          onClick={() => handlePaymentToggle(o)}
                          disabled={updating === o.id}
                        >
                          {updating === o.id ? '…' : o.payment_status === 'paid' ? 'Unpaid' : 'Paid'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div style={styles.cardGrid}>
          {sortedOrders.length === 0 ? (
            <div style={styles.empty}>
              <div style={styles.emptyTitle}>{orders.length === 0 ? 'No bills in this period' : 'No bills match your filters'}</div>
              <p style={styles.emptyHint}>
                {orders.length === 0
                  ? 'Try a wider date range (Week / Month / Year) or register a new patient.'
                  : 'Clear the search box, set Payment to All, or widen the date range.'}
              </p>
              <div style={styles.emptyActions}>
                <button type="button" style={styles.emptyBtn} onClick={() => navigate('/new-registration')}>New bill</button>
                {orders.length > 0 && (
                  <button
                    type="button"
                    style={{ ...styles.emptyBtn, ...styles.emptyBtnSecondary }}
                    onClick={() => {
                      setSearch('');
                      setPaymentFilter('all');
                    }}
                  >
                    Clear search & payment filter
                  </button>
                )}
              </div>
            </div>
          ) : (
            sortedOrders.map((o) => {
              const chip = paymentChip(o);
              return (
                <div
                  key={o.id}
                  style={{
                    ...styles.billingCard,
                    ...(o.payment_status !== 'paid' ? styles.billingCardUnpaid : {}),
                  }}
                  className="billing-card-clickable"
                  onClick={() => handleViewInvoice(o, false)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleViewInvoice(o, false);
                    }
                  }}
                  title="Click to view invoice"
                >
                  <div style={styles.cardHeader}>
                    <span style={styles.cardPatientId}>{o.patient_id}</span>
                    <span style={chip.style}>{chip.label}</span>
                  </div>
                  <div style={styles.cardPatientName}>{o.patient_name ?? '—'}</div>
                  <div style={styles.cardMeta}>
                    <span>{formatOrderDateDisplay(o.order_date)}</span>
                    <span>·</span>
                    <span>{o.test_count} tests</span>
                  </div>
                  {o.referred_by && (
                    <div style={styles.cardReferrer}>{o.referred_by}</div>
                  )}
                  <div style={styles.cardAmount}>
                    ₹{parseFloat(o.total_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </div>
                  <div style={styles.cardActions} onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      style={styles.cardIconBtn}
                      onClick={() => handleViewInvoice(o, false)}
                      title="View invoice"
                    >
                      📄 View
                    </button>
                    <button
                      type="button"
                      style={styles.cardIconBtn}
                      onClick={() => handleViewInvoice(o, true)}
                      title="Print invoice"
                    >
                      🖨 Print
                    </button>
                    <button
                      type="button"
                      style={styles.toggleBtn}
                      onClick={() => handlePaymentToggle(o)}
                      disabled={updating === o.id}
                    >
                      {updating === o.id ? '…' : o.payment_status === 'paid' ? 'Unpaid' : 'Paid'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
      </div>

      {invoiceData && (
        <div className="billing-invoice-overlay" style={styles.modalOverlay} onClick={closeInvoice}>
          <div style={styles.invoiceModal} onClick={(e) => e.stopPropagation()} className="bill-invoice-print">
            <div className="no-print" style={styles.invoiceHeader}>
              <div>
                <h3 style={styles.invoiceTitle}>Bill Invoice</h3>
                {invoicePrintHint && <p style={styles.invoicePrintHint}>{invoicePrintHint}</p>}
              </div>
              <div style={styles.invoiceActions}>
                <button
                  type="button"
                  style={styles.printBtn}
                  onClick={handlePrintInvoice}
                  title="Opens PDF with preview (recommended on Windows), then print from there"
                >
                  🖨 Print
                </button>
                <button type="button" style={styles.closeBtn} onClick={closeInvoice}>×</button>
              </div>
            </div>
            <div style={styles.invoiceBody} className="invoice-sheet-body">
              <div style={styles.invoiceHero}>
                <div style={styles.invoiceHeroAccent} aria-hidden />
                <div style={styles.invoiceHeroInner}>
                  <div style={styles.invoiceMonogram} aria-hidden>
                    {(labConfig.name || 'M').trim().charAt(0).toUpperCase() || 'M'}
                  </div>
                  <div style={styles.invoiceHeroText}>
                    <div style={styles.invoiceLabName}>{labConfig.name}</div>
                    <div style={styles.invoiceContactRow}>
                      <span style={styles.invoiceContactChip}>✉ {labConfig.email}</span>
                      <span style={styles.invoiceContactChip}>☎ {labConfig.phone}</span>
                    </div>
                  </div>
                </div>
                <div style={styles.invoiceBillBadge}>Bill invoice</div>
              </div>

              {invoiceData.order.access_code && (
                <div style={styles.invoiceBarcodeBlock}>
                  <p style={styles.invoiceBarcodeCaption}>Scan at counter to open this report</p>
                  <OrderBarcode value={invoiceData.order.access_code} height={42} fontSize={10} />
                </div>
              )}

              <div style={styles.invoicePatientCard}>
                <div style={styles.invoicePatientCardTitle}>Patient details</div>
                <div style={styles.invoicePatientGrid}>
                  <div style={styles.invoiceKv}>
                    <span style={styles.invoiceK}>Patient</span>
                    <span style={styles.invoiceV}>{invoiceData.order.patient_name ?? '—'}</span>
                  </div>
                  <div style={styles.invoiceKv}>
                    <span style={styles.invoiceK}>Patient ID</span>
                    <span style={styles.invoiceV}>{invoiceData.order.patient_id ?? '—'}</span>
                  </div>
                  <div style={styles.invoiceKv}>
                    <span style={styles.invoiceK}>Age / Sex</span>
                    <span style={styles.invoiceV}>
                      {invoiceData.order.age ?? '—'} · {invoiceData.order.sex === 'male' ? 'Male' : invoiceData.order.sex === 'female' ? 'Female' : '—'}
                    </span>
                  </div>
                  <div style={styles.invoiceKv}>
                    <span style={styles.invoiceK}>Date</span>
                    <span style={styles.invoiceV}>{formatOrderDateDisplay(invoiceData.order.order_date)}</span>
                  </div>
                  {invoiceData.order.phone && (
                    <div style={{ ...styles.invoiceKv, gridColumn: '1 / -1' }}>
                      <span style={styles.invoiceK}>Phone</span>
                      <span style={styles.invoiceV}>{invoiceData.order.phone}</span>
                    </div>
                  )}
                  {invoiceData.order.address && (
                    <div style={{ ...styles.invoiceKv, gridColumn: '1 / -1' }}>
                      <span style={styles.invoiceK}>Address</span>
                      <span style={styles.invoiceV}>{invoiceData.order.address}</span>
                    </div>
                  )}
                  <div style={{ ...styles.invoiceKv, gridColumn: '1 / -1' }}>
                    <span style={styles.invoiceK}>Referred by</span>
                    <span style={styles.invoiceV}>{invoiceData.order.referred_by || '—'}</span>
                  </div>
                </div>
              </div>

              <div className="bill-invoice-items-wrap" style={styles.invoiceTableWrap}>
                <div style={styles.invoiceTableHead}>
                  <span>Test / service</span>
                  <span style={{ textAlign: 'right' }}>Amount (₹)</span>
                </div>
                <div style={styles.invoiceTestList}>
                  {invoiceData.items.map((item, i) => (
                    <div
                      key={i}
                      className="bill-invoice-test-row"
                      style={{
                        ...styles.invoiceTestRow,
                        ...(i % 2 === 0 ? styles.invoiceTestRowAlt : {}),
                      }}
                    >
                      <span className="bill-invoice-test-name" style={styles.invoiceTestName}>
                        <span style={styles.invoiceTestDot} aria-hidden />
                        {item.name}
                      </span>
                      <span style={styles.invoiceTestRate}>₹{(Number(item.rate) || 0).toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bill-invoice-grand-total" style={styles.invoiceGrandTotalWrap}>
                <div style={styles.invoiceGrandTotalInner} className="invoice-grand-total-row">
                  <span style={styles.invoiceGrandLabel}>Grand total</span>
                  <span style={styles.invoiceGrandAmount}>
                    ₹{invoiceData.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>

              <div className="bill-invoice-footer" style={styles.invoicePrintedBy}>
                <span style={styles.invoicePrintedByLine} />
                Printed by <strong>{labConfig.default_printed_by}</strong> · Thank you for choosing our lab
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { maxWidth: 1100, paddingBottom: 40 },
  headerTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 20, flexWrap: 'wrap' },
  header: { marginBottom: 0, flex: 1, minWidth: 200 },
  title: { fontSize: 22, fontWeight: 700, color: '#1e3a5f', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#666', margin: 0, lineHeight: 1.4 },
  newBillBtnHero: {
    padding: '14px 28px',
    borderRadius: 12,
    border: 'none',
    background: 'linear-gradient(180deg, #0d7377 0%, #0a5c5f 100%)',
    color: '#fff',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 6px 20px rgba(13,115,119,0.35)',
    whiteSpace: 'nowrap',
    alignSelf: 'center',
  },
  toolbar: { display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 10 },
  periodRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  periodBtn: { padding: '9px 16px', borderRadius: 10, border: '2px solid #e2e8f0', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#475569', fontWeight: 500 },
  periodBtnActive: {
    background: 'linear-gradient(180deg, #0d7377 0%, #0a5c5f 100%)',
    color: '#fff',
    borderColor: '#0d7377',
    fontWeight: 700,
    boxShadow: '0 4px 14px rgba(13,115,119,0.35)',
  },
  customRow: { display: 'flex', alignItems: 'center', gap: 8 },
  dateInput: { padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13 },
  dateSep: { color: '#999', fontSize: 12 },
  searchWrap: { position: 'relative', flex: 1, minWidth: 200 },
  searchInput: { width: '100%', padding: '10px 36px 10px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' },
  searchClear: {
    position: 'absolute',
    right: 8,
    top: '50%',
    transform: 'translateY(-50%)',
    width: 28,
    height: 28,
    borderRadius: 6,
    border: 'none',
    background: '#f1f5f9',
    color: '#64748b',
    fontSize: 18,
    lineHeight: 1,
    cursor: 'pointer',
  },
  recalcBtn: { padding: '8px 14px', borderRadius: 8, border: '1px solid #0d7377', background: '#fff', color: '#0d7377', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  subToolbar: { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 12 },
  viewToggle: { display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid #e2e8f0' },
  viewBtn: { padding: '8px 14px', border: 'none', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#64748b', fontWeight: 500 },
  viewBtnActive: { background: '#e8f4f4', color: '#0d7377', fontWeight: 700 },
  unpaidFirstBtn: { padding: '8px 14px', borderRadius: 10, border: '1px dashed #cbd5e1', background: '#fff', fontSize: 12, fontWeight: 600, color: '#64748b', cursor: 'pointer' },
  unpaidFirstBtnActive: { border: '2px solid #0d7377', color: '#0d7377', background: '#f0fdfa' },
  statsSticky: {
    position: 'sticky',
    top: 0,
    zIndex: 30,
    background: 'linear-gradient(180deg, #f8fafc 88%, rgba(248,250,252,0))',
    paddingTop: 4,
    paddingBottom: 12,
    marginBottom: 8,
  },
  statsRow: { display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', fontSize: 14, color: '#64748b' },
  statHighlight: { fontWeight: 800, color: '#1e3a5f', fontSize: 15 },
  stat: { fontWeight: 500 },
  statDivider: { color: '#cbd5e1', userSelect: 'none' },
  statPaid: { fontWeight: 600, color: '#166534' },
  statUnpaid: { fontWeight: 600, color: '#b45309' },
  recalcToast: {
    marginTop: 8,
    padding: '10px 14px',
    borderRadius: 8,
    background: '#e8f4f4',
    border: '1px solid #99d5d8',
    color: '#0d7377',
    fontSize: 13,
    fontWeight: 600,
  },
  loading: { padding: 32, textAlign: 'center', color: '#666' },
  cardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 },
  billingCard: {
    background: '#fff',
    borderRadius: 12,
    boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
    border: '1px solid #e2e8f0',
    padding: 16,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  billingCardUnpaid: { background: '#fffbeb', borderColor: '#fcd34d', borderLeft: '4px solid #f59e0b' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardPatientId: { fontSize: 12, fontWeight: 700, color: '#0d7377', fontFamily: 'monospace' },
  cardPatientName: { fontSize: 15, fontWeight: 600, color: '#1e3a5f', lineHeight: 1.3 },
  cardMeta: { fontSize: 12, color: '#64748b', display: 'flex', gap: 6, alignItems: 'center' },
  cardReferrer: { fontSize: 11, color: '#64748b', fontStyle: 'italic' },
  cardAmount: { fontSize: 18, fontWeight: 700, color: '#0d7377', marginTop: 4 },
  cardActions: { display: 'flex', gap: 8, marginTop: 8, paddingTop: 10, borderTop: '1px solid #f0f0f0', flexWrap: 'wrap' },
  cardIconBtn: { padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', fontSize: 11, cursor: 'pointer', color: '#0d7377', fontWeight: 500 },
  paymentFilter: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  paymentFilterBtn: { padding: '8px 14px', borderRadius: 999, border: '1px solid #e2e8f0', background: '#fff', fontSize: 12, cursor: 'pointer', color: '#475569', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 },
  paymentFilterActive: { background: '#0d7377', color: '#fff', borderColor: '#0d7377', boxShadow: '0 2px 8px rgba(13,115,119,0.25)' },
  paymentFilterIcon: { fontSize: 10, opacity: 0.9 },
  chipPaid: { display: 'inline-block', background: 'linear-gradient(180deg, #dcfce7 0%, #bbf7d0 100%)', color: '#14532d', padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, border: '1px solid #86efac' },
  chipDue: { display: 'inline-block', background: 'linear-gradient(180deg, #fffbeb 0%, #fef3c7 100%)', color: '#92400e', padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, border: '1px solid #fcd34d' },
  tableWrap: { background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'auto', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '12px 14px', background: '#f8fafb', borderBottom: '2px solid #e2e8f0', color: '#475569', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' },
  thBtn: { background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer', fontWeight: 700 },
  td: { padding: '12px 14px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' },
  tdMono: { padding: '12px 14px', borderBottom: '1px solid #f1f5f9', fontFamily: 'ui-monospace, monospace', fontSize: 12, color: '#0d7377', fontWeight: 600 },
  tdMuted: { padding: '12px 14px', borderBottom: '1px solid #f1f5f9', color: '#94a3b8', fontSize: 12 },
  tdAmount: { padding: '12px 14px', borderBottom: '1px solid #f1f5f9', fontWeight: 800, color: '#1e3a5f', fontVariantNumeric: 'tabular-nums' },
  tdActions: { padding: '8px 14px', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' },
  tableActionBtn: { padding: '6px 10px', marginRight: 6, borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', fontSize: 11, cursor: 'pointer', color: '#0d7377', fontWeight: 600 },
  tableToggleBtn: { padding: '6px 10px', borderRadius: 6, border: '1px solid #0d7377', background: '#fff', color: '#0d7377', fontSize: 11, fontWeight: 600, cursor: 'pointer' },
  trPaid: { cursor: 'pointer', background: '#fff' },
  trUnpaid: { cursor: 'pointer', background: '#fffdf8' },
  toggleBtn: { padding: '4px 10px', borderRadius: 6, border: '1px solid #0d7377', background: '#fff', color: '#0d7377', fontSize: 11, fontWeight: 600, cursor: 'pointer' },
  empty: { padding: 48, textAlign: 'center', color: '#666', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', gridColumn: '1 / -1', background: '#fff', borderRadius: 12, border: '1px solid #eee' },
  emptyTitle: { fontSize: 16, fontWeight: 700, color: '#334155', margin: 0 },
  emptyHint: { margin: 0, maxWidth: 420, lineHeight: 1.5, fontSize: 14, color: '#64748b' },
  emptyActions: { display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 4 },
  emptyBtn: { padding: '8px 18px', borderRadius: 8, border: '1px solid #0d7377', background: '#fff', color: '#0d7377', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  emptyBtnSecondary: { borderColor: '#cbd5e1', color: '#475569', background: '#f8fafc' },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  invoiceModal: {
    background: '#fff',
    borderRadius: 16,
    boxShadow: '0 24px 48px rgba(15, 40, 71, 0.22), 0 0 0 1px rgba(13,115,119,0.08)',
    width: '210mm',
    maxWidth: '95vw',
    height: '148.5mm',
    minHeight: '148.5mm',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    borderLeft: '5px solid #0d7377',
  },
  invoiceHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #eee', background: '#f8fafb' },
  invoiceTitle: { margin: 0, fontSize: 16, fontWeight: 700, color: '#1e3a5f' },
  invoicePrintHint: { margin: '6px 0 0', fontSize: 11, color: '#0d7377', fontWeight: 500, maxWidth: 280, lineHeight: 1.35 },
  invoiceActions: { display: 'flex', alignItems: 'center', gap: 10 },
  printBtn: { padding: '8px 16px', borderRadius: 8, border: 'none', background: '#0d7377', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  closeBtn: { background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#666', lineHeight: 1, padding: '0 4px' },
  invoiceBody: {
    padding: '12px 16px 14px',
    overflowY: 'auto',
    flex: 1,
    fontSize: 11,
    background: 'linear-gradient(180deg, #f8fafc 0%, #fff 120px)',
  },
  invoiceHero: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    background: 'linear-gradient(135deg, #1e3a5f 0%, #0d7377 55%, #14a3a8 100%)',
    boxShadow: '0 8px 24px rgba(13,115,119,0.25)',
  },
  invoiceHeroAccent: {
    position: 'absolute',
    right: -40,
    top: -40,
    width: 120,
    height: 120,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.08)',
  },
  invoiceHeroInner: { display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', position: 'relative', zIndex: 1 },
  invoiceMonogram: {
    width: 48,
    height: 48,
    borderRadius: 12,
    background: 'rgba(255,255,255,0.2)',
    color: '#fff',
    fontSize: 22,
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    border: '2px solid rgba(255,255,255,0.35)',
  },
  invoiceHeroText: { flex: 1, minWidth: 0, textAlign: 'left' },
  invoiceLabName: {
    fontSize: 17,
    fontWeight: 800,
    color: '#fff',
    letterSpacing: '0.02em',
    lineHeight: 1.2,
    marginBottom: 6,
    textShadow: '0 1px 2px rgba(0,0,0,0.15)',
  },
  invoiceContactRow: { display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 10 },
  invoiceContactChip: {
    color: 'rgba(255,255,255,0.92)',
    background: 'rgba(0,0,0,0.12)',
    padding: '4px 10px',
    borderRadius: 20,
    fontWeight: 500,
  },
  invoiceBillBadge: {
    position: 'absolute',
    top: 10,
    right: 12,
    background: '#fff',
    color: '#0d7377',
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    padding: '6px 10px',
    borderRadius: 6,
    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
    zIndex: 2,
  },
  invoiceBarcodeBlock: {
    marginBottom: 12,
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px dashed #cbd5e1',
    background: '#fafafa',
  },
  invoiceBarcodeCaption: {
    margin: '0 0 8px',
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: '#64748b',
    textAlign: 'center',
  },
  invoicePatientCard: {
    background: '#fff',
    borderRadius: 10,
    border: '1px solid #e2e8f0',
    padding: '10px 12px',
    marginBottom: 10,
    boxShadow: '0 2px 8px rgba(30,58,95,0.06)',
  },
  invoicePatientCardTitle: {
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: '#0d7377',
    marginBottom: 8,
    paddingBottom: 6,
    borderBottom: '2px solid #e8f4f4',
  },
  invoicePatientGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '6px 16px',
    fontSize: 10,
  },
  invoiceKv: { display: 'flex', flexDirection: 'column', gap: 2 },
  invoiceK: { color: '#94a3b8', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' },
  invoiceV: { color: '#1e293b', fontWeight: 600, lineHeight: 1.35 },
  invoiceTableWrap: {
    borderRadius: 10,
    border: '1px solid #e2e8f0',
    overflow: 'hidden',
    marginBottom: 10,
  },
  invoiceTableHead: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 12px',
    background: 'linear-gradient(180deg, #f1f5f9 0%, #e8f4f4 100%)',
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: '#475569',
    borderBottom: '1px solid #e2e8f0',
  },
  invoiceTestList: { marginBottom: 0 },
  invoiceTestRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    padding: '7px 12px',
    borderBottom: '1px solid #f1f5f9',
    fontSize: 10,
  },
  invoiceTestRowAlt: { background: '#fafbfc' },
  invoiceTestName: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    color: '#334155',
    fontWeight: 500,
    flex: 1,
    minWidth: 0,
    lineHeight: 1.35,
    wordBreak: 'normal',
    overflowWrap: 'break-word',
    hyphens: 'none',
  },
  invoiceTestDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #0d7377, #14a3a8)',
    flexShrink: 0,
  },
  invoiceTestRate: {
    fontWeight: 700,
    color: '#1e3a5f',
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
    minWidth: '4.5em',
  },
  invoiceGrandTotalWrap: { marginTop: 4, marginBottom: 6, width: '100%' },
  invoiceGrandTotalInner: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'baseline',
    gap: 14,
    flexWrap: 'wrap',
    padding: '12px 12px',
    borderRadius: 10,
    background: 'linear-gradient(135deg, #0d7377 0%, #0a5c5f 50%, #1e3a5f 100%)',
    boxShadow: '0 6px 20px rgba(13,115,119,0.35)',
  },
  invoiceGrandLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: 'rgba(255,255,255,0.9)',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
  },
  invoiceGrandAmount: { fontSize: 22, fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums' },
  invoicePrintedBy: {
    marginTop: 8,
    fontSize: 9,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 1.5,
  },
  invoicePrintedByLine: {
    display: 'block',
    width: 48,
    height: 2,
    background: 'linear-gradient(90deg, transparent, #0d7377, transparent)',
    margin: '0 auto 8px',
    borderRadius: 2,
  },
};
