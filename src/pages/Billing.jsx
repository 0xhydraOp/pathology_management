import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDate(d) {
  if (!d) return '—';
  const x = new Date(d);
  return `${String(x.getDate()).padStart(2, '0')}-${String(x.getMonth() + 1).padStart(2, '0')}-${x.getFullYear()}`;
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
  const invoiceOrderIdRef = useRef(null);

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
        `SELECT o.id, o.order_date, o.status, o.total_amount, o.payment_status, o.referring_doctor,
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
    if (invoiceData && printOnOpen) {
      window.print();
      setPrintOnOpen(false);
    }
  }, [invoiceData, printOnOpen]);

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
      if (invoiceOrderIdRef.current === orderId) {
        setInvoiceData({ order: { ...order }, items, total });
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
    try {
      const [start, end] = getDateRange(filter, customFrom, customTo);
      const orderRows = await window.db.all(
        'SELECT id FROM orders WHERE date(order_date) >= ? AND date(order_date) <= ?',
        [start, end]
      );
      for (const row of orderRows || []) {
        await window.db.computeOrderBillAndCommission(row.id);
      }
      await loadOrders();
      if (invoiceOrder) loadInvoiceData(invoiceOrder);
    } catch (e) {
      console.error(e);
    } finally {
      setRecalculating(false);
    }
  };

  const handlePaymentToggle = async (orderId, currentStatus) => {
    if (!window.db || updating) return;
    const next = currentStatus === 'paid' ? 'unpaid' : 'paid';
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
    window.print();
  };

  const handleSort = (col) => {
    setSortCol(col);
    setSortDir((d) => (sortCol === col ? (d === 'asc' ? 'desc' : 'asc') : 'desc'));
  };

  let filteredOrders = paymentFilter === 'paid'
    ? orders.filter((o) => o.payment_status === 'paid')
    : paymentFilter === 'unpaid'
      ? orders.filter((o) => o.payment_status !== 'paid')
      : orders;
  filteredOrders = search.trim()
    ? filteredOrders.filter(
        (o) =>
          (o.patient_name || '').toLowerCase().includes(search.trim().toLowerCase()) ||
          (o.patient_id || '').toLowerCase().includes(search.trim().toLowerCase()) ||
          (o.referred_by || '').toLowerCase().includes(search.trim().toLowerCase())
      )
    : filteredOrders;

  const sortedOrders = [...filteredOrders].sort((a, b) => {
    let cmp = 0;
    if (sortCol === 'date') {
      cmp = new Date(a.order_date) - new Date(b.order_date);
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

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Billing</h1>
        <p style={styles.subtitle}>Click a card to view invoice</p>
      </div>

      <div style={styles.toolbar}>
        <button style={styles.newBillBtn} onClick={() => navigate('/new-registration')}>+ New Bill</button>
        <div style={styles.periodRow}>
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              style={{ ...styles.periodBtn, ...(filter === p.id ? styles.periodBtnActive : {}) }}
              onClick={() => setFilter(p.id)}
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
        <input
          type="text"
          placeholder="Search patient, ID, referrer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={styles.searchInput}
        />
        <button style={styles.recalcBtn} onClick={handleRecalculateAll} disabled={recalculating} title="Recalculate bills">
          {recalculating ? '…' : '↻ Recalc'}
        </button>
        <div style={styles.paymentFilter}>
          {['all', 'unpaid', 'paid'].map((pf) => (
            <button
              key={pf}
              type="button"
              style={{ ...styles.paymentFilterBtn, ...(paymentFilter === pf ? styles.paymentFilterActive : {}) }}
              onClick={() => setPaymentFilter(pf)}
            >
              {pf === 'all' ? 'All' : pf === 'unpaid' ? 'Unpaid' : 'Paid'}
            </button>
          ))}
        </div>
      </div>

      <div style={styles.statsRow}>
        <span style={styles.stat}>{filteredOrders.length} orders</span>
        <span style={styles.stat}>₹{totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })} total</span>
        <span style={styles.stat}>{paidCount} paid · {unpaidCount} unpaid</span>
      </div>

      {loading ? (
        <div style={styles.loading}>Loading...</div>
      ) : (
        <div style={styles.cardGrid}>
          {sortedOrders.length === 0 ? (
            <div style={styles.empty}>
              No orders
              <button style={styles.emptyBtn} onClick={() => navigate('/new-registration')}>New Registration</button>
            </div>
          ) : (
            sortedOrders.map((o) => (
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
                onKeyDown={(e) => e.key === 'Enter' && handleViewInvoice(o, false)}
                title="Click to view invoice"
              >
                <div style={styles.cardHeader}>
                  <span style={styles.cardPatientId}>{o.patient_id}</span>
                  <span style={o.payment_status === 'paid' ? styles.badgePaid : styles.badgeUnpaid}>
                    {o.payment_status || 'unpaid'}
                  </span>
                </div>
                <div style={styles.cardPatientName}>{o.patient_name ?? '—'}</div>
                <div style={styles.cardMeta}>
                  <span>{formatDate(o.order_date)}</span>
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
                    style={styles.cardIconBtn}
                    onClick={() => handleViewInvoice(o, false)}
                    title="View invoice"
                  >
                    📄 View
                  </button>
                  <button
                    style={styles.cardIconBtn}
                    onClick={() => handleViewInvoice(o, true)}
                    title="Print invoice"
                  >
                    🖨 Print
                  </button>
                  <button
                    style={styles.toggleBtn}
                    onClick={() => handlePaymentToggle(o.id, o.payment_status)}
                    disabled={updating === o.id}
                  >
                    {updating === o.id ? '…' : o.payment_status === 'paid' ? 'Unpaid' : 'Paid'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {invoiceData && (
        <div className="billing-invoice-overlay" style={styles.modalOverlay} onClick={closeInvoice}>
          <div style={styles.invoiceModal} onClick={(e) => e.stopPropagation()} className="bill-invoice-print">
            <div className="no-print" style={styles.invoiceHeader}>
              <h3 style={styles.invoiceTitle}>Bill Invoice</h3>
              <div style={styles.invoiceActions}>
                <button style={styles.printBtn} onClick={handlePrintInvoice}>🖨 Print</button>
                <button style={styles.closeBtn} onClick={closeInvoice}>×</button>
              </div>
            </div>
            <div style={styles.invoiceBody}>
              <div style={styles.invoiceHeaderTitle}>Bill Invoice</div>
              <div style={styles.invoicePatient}>
                <div style={styles.invoicePatientRow}>
                  <strong>Patient:</strong> {invoiceData.order.patient_name ?? '—'} &nbsp;|&nbsp;
                  <strong>ID:</strong> {invoiceData.order.patient_id ?? '—'} &nbsp;|&nbsp;
                  <strong>Age:</strong> {invoiceData.order.age ?? '—'} &nbsp;|&nbsp;
                  <strong>Sex:</strong> {invoiceData.order.sex === 'male' ? 'M' : invoiceData.order.sex === 'female' ? 'F' : '—'}
                </div>
                {invoiceData.order.phone && <div style={styles.invoicePatientRow}><strong>Phone:</strong> {invoiceData.order.phone}</div>}
                {invoiceData.order.address && <div style={styles.invoicePatientRow}><strong>Address:</strong> {invoiceData.order.address}</div>}
                <div style={styles.invoicePatientRow}><strong>Referred by:</strong> {invoiceData.order.referred_by || '—'}</div>
                <div style={styles.invoicePatientRow}><strong>Date:</strong> {formatDate(invoiceData.order.order_date)}</div>
              </div>
              <table style={styles.invoiceTable}>
                <thead>
                  <tr>
                    <th style={styles.invoiceTh}>#</th>
                    <th style={styles.invoiceTh}>Test</th>
                    <th style={{ ...styles.invoiceTh, textAlign: 'right' }}>Rate (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceData.items.map((item, i) => (
                    <tr key={i}>
                      <td style={styles.invoiceTd}>{i + 1}</td>
                      <td style={styles.invoiceTd}>{item.name}</td>
                      <td style={{ ...styles.invoiceTd, textAlign: 'right' }}>{(Number(item.rate) || 0).toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={styles.invoiceTotal}>
                <strong>Total: ₹{invoiceData.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</strong>
                <span style={invoiceData.order.payment_status === 'paid' ? styles.badgePaid : styles.badgeUnpaid}>
                  {invoiceData.order.payment_status || 'unpaid'}
                </span>
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
  header: { marginBottom: 16 },
  title: { fontSize: 20, fontWeight: 700, color: '#1e3a5f', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#666', margin: 0 },
  toolbar: { display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 16 },
  periodRow: { display: 'flex', gap: 6 },
  periodBtn: { padding: '8px 14px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#555' },
  periodBtnActive: { background: '#0d7377', color: '#fff', borderColor: '#0d7377' },
  customRow: { display: 'flex', alignItems: 'center', gap: 8 },
  dateInput: { padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13 },
  dateSep: { color: '#999', fontSize: 12 },
  searchInput: { flex: 1, minWidth: 180, padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13 },
  recalcBtn: { padding: '8px 14px', borderRadius: 8, border: '1px solid #0d7377', background: '#fff', color: '#0d7377', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  statsRow: { display: 'flex', gap: 20, marginBottom: 12, fontSize: 13, color: '#64748b' },
  stat: { fontWeight: 500 },
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
  newBillBtn: { padding: '8px 16px', borderRadius: 8, border: 'none', background: '#0d7377', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  paymentFilter: { display: 'flex', gap: 4 },
  paymentFilterBtn: { padding: '6px 12px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', fontSize: 12, cursor: 'pointer', color: '#555' },
  paymentFilterActive: { background: '#0d7377', color: '#fff', borderColor: '#0d7377' },
  badgePaid: { background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 },
  badgeUnpaid: { background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 },
  toggleBtn: { padding: '4px 10px', borderRadius: 6, border: '1px solid #0d7377', background: '#fff', color: '#0d7377', fontSize: 11, fontWeight: 600, cursor: 'pointer' },
  empty: { padding: 48, textAlign: 'center', color: '#666', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', gridColumn: '1 / -1', background: '#fff', borderRadius: 12, border: '1px solid #eee' },
  emptyBtn: { padding: '8px 18px', borderRadius: 8, border: '1px solid #0d7377', background: '#fff', color: '#0d7377', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  invoiceModal: { background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.2)', width: '210mm', maxWidth: '95vw', height: '148.5mm', minHeight: '148.5mm', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  invoiceHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #eee', background: '#f8fafb' },
  invoiceTitle: { margin: 0, fontSize: 16, fontWeight: 700, color: '#1e3a5f' },
  invoiceActions: { display: 'flex', alignItems: 'center', gap: 10 },
  printBtn: { padding: '8px 16px', borderRadius: 8, border: 'none', background: '#0d7377', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  closeBtn: { background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#666', lineHeight: 1, padding: '0 4px' },
  invoiceBody: { padding: 12, overflowY: 'auto', flex: 1 },
  invoiceHeaderTitle: { fontSize: 16, fontWeight: 700, color: '#1e3a5f', marginBottom: 10, textAlign: 'center' },
  invoicePatient: { marginBottom: 10, fontSize: 11 },
  invoicePatientRow: { marginBottom: 4 },
  invoiceTable: { width: '100%', borderCollapse: 'collapse', fontSize: 11 },
  invoiceTh: { textAlign: 'left', padding: '4px 6px', borderBottom: '1px solid #e2e8f0', fontWeight: 600, color: '#64748b', fontSize: 10 },
  invoiceTd: { padding: '4px 6px', borderBottom: '1px solid #f0f0f0' },
  invoiceTotal: { marginTop: 10, paddingTop: 8, borderTop: '1px solid #0d7377', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, fontWeight: 700 },
};
