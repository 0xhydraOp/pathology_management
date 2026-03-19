import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const money = (n) => (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Last Week' },
  { id: 'month', label: 'This Month' },
  { id: 'lastmonth', label: 'Last Month' },
  { id: 'year', label: 'This Year' },
  { id: 'all', label: 'All Time' },
  { id: 'custom', label: 'Custom' },
];

function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDateRange(filter, customFrom, customTo) {
  const now = new Date();
  const today = toLocalDateStr(now);
  let start, end;
  if (filter === 'today') {
    return [today, today];
  }
  if (filter === 'week') {
    end = new Date(now);
    start = new Date(now);
    start.setDate(start.getDate() - 7);
  } else if (filter === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date();
  } else if (filter === 'lastmonth') {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end = new Date(now.getFullYear(), now.getMonth(), 0);
  } else if (filter === 'year') {
    start = new Date(now.getFullYear(), 0, 1);
    end = new Date();
  } else if (filter === 'custom' && customFrom && customTo) {
    const d1 = new Date(customFrom);
    const d2 = new Date(customTo);
    start = d1 <= d2 ? d1 : d2;
    end = d1 <= d2 ? d2 : d1;
  } else {
    start = new Date(2000, 0, 1);
    end = new Date();
  }
  return [toLocalDateStr(start), toLocalDateStr(end)];
}

/** Pretty date for invoice period (avoids UTC shift on YYYY-MM-DD). */
function formatDisplayDateStr(dateStr) {
  if (!dateStr) return '—';
  const s = String(dateStr);
  const x = new Date(s.length === 10 ? `${s}T12:00:00` : s);
  if (isNaN(x.getTime())) return s;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(x.getDate()).padStart(2, '0')} ${months[x.getMonth()]} ${x.getFullYear()}`;
}

export default function Referrals() {
  const navigate = useNavigate();
  const today = toLocalDateStr(new Date());
  const weekAgo = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return toLocalDateStr(d);
  })();
  const [filter, setFilter] = useState('month');
  const [customFrom, setCustomFrom] = useState(weekAgo);
  const [customTo, setCustomTo] = useState(today);
  const [referrers, setReferrers] = useState([]);
  const [referrerPerformance, setReferrerPerformance] = useState({});
  const [referrerCommission, setReferrerCommission] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState('');
  const [exportFeedback, setExportFeedback] = useState('');
  const [selectedReferrer, setSelectedReferrer] = useState(null);
  const [patientList, setPatientList] = useState([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  /** Payment invoice (double-click card) — uses main period filter */
  const [invoiceReferrer, setInvoiceReferrer] = useState(null);
  const [invoiceData, setInvoiceData] = useState(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [invoicePrintHint, setInvoicePrintHint] = useState('');
  const [labConfig, setLabConfig] = useState({
    name: 'MONDAL DIAGNOSTIC CENTRE',
    email: '',
    phone: '',
    default_printed_by: 'Admin',
  });

  const loadReferrersRequestRef = useRef(0);
  const rowClickTimeoutRef = useRef(null);
  const loadReferrers = useCallback(async () => {
    if (!window.db) {
      setLoading(false);
      return;
    }
    const reqId = ++loadReferrersRequestRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const [start, end] = getDateRange(filter, customFrom, customTo);
      const rows = await window.db.all(
        `SELECT p.referred_by as name, COUNT(DISTINCT p.id) as count 
         FROM patients p
         JOIN orders o ON o.patient_id = p.id
         WHERE p.referred_by IS NOT NULL AND p.referred_by != ''
         AND LOWER(TRIM(p.referred_by)) != 'self'
         AND date(o.order_date) >= ? AND date(o.order_date) <= ?
         GROUP BY p.referred_by ORDER BY count DESC`,
        [start, end]
      );
      if (reqId !== loadReferrersRequestRef.current) return;
      setReferrers(rows || []);

      const [todayStr] = getDateRange('today', null, null);
      const [weekStart, weekEnd] = getDateRange('week', null, null);
      const [monthStart, monthEnd] = getDateRange('month', null, null);
      const [lastMonthStart, lastMonthEnd] = getDateRange('lastmonth', null, null);
      const [todayRows, weekRows, monthRows, lastMonthRows] = await Promise.all([
        window.db.all(
          `SELECT p.referred_by as name, COUNT(DISTINCT p.id) as count
           FROM patients p JOIN orders o ON o.patient_id = p.id
           WHERE p.referred_by IS NOT NULL AND p.referred_by != ''
           AND LOWER(TRIM(p.referred_by)) != 'self'
           AND date(o.order_date) = ?
           GROUP BY p.referred_by`,
          [todayStr]
        ),
        window.db.all(
          `SELECT p.referred_by as name, COUNT(DISTINCT p.id) as count
           FROM patients p JOIN orders o ON o.patient_id = p.id
           WHERE p.referred_by IS NOT NULL AND p.referred_by != ''
           AND LOWER(TRIM(p.referred_by)) != 'self'
           AND date(o.order_date) >= ? AND date(o.order_date) <= ?
           GROUP BY p.referred_by`,
          [weekStart, weekEnd]
        ),
        window.db.all(
          `SELECT p.referred_by as name, COUNT(DISTINCT p.id) as count
           FROM patients p JOIN orders o ON o.patient_id = p.id
           WHERE p.referred_by IS NOT NULL AND p.referred_by != ''
           AND LOWER(TRIM(p.referred_by)) != 'self'
           AND date(o.order_date) >= ? AND date(o.order_date) <= ?
           GROUP BY p.referred_by`,
          [monthStart, monthEnd]
        ),
        window.db.all(
          `SELECT p.referred_by as name, COUNT(DISTINCT p.id) as count
           FROM patients p JOIN orders o ON o.patient_id = p.id
           WHERE p.referred_by IS NOT NULL AND p.referred_by != ''
           AND LOWER(TRIM(p.referred_by)) != 'self'
           AND date(o.order_date) >= ? AND date(o.order_date) <= ?
           GROUP BY p.referred_by`,
          [lastMonthStart, lastMonthEnd]
        ),
      ]);
      if (reqId !== loadReferrersRequestRef.current) return;
      const perfMap = {};
      (todayRows || []).forEach((r) => { perfMap[r.name] = { ...(perfMap[r.name] || {}), today: r.count || 0 }; });
      (weekRows || []).forEach((r) => { perfMap[r.name] = { ...(perfMap[r.name] || {}), week: r.count || 0 }; });
      (monthRows || []).forEach((r) => { perfMap[r.name] = { ...(perfMap[r.name] || {}), month: r.count || 0 }; });
      (lastMonthRows || []).forEach((r) => { perfMap[r.name] = { ...(perfMap[r.name] || {}), lastMonth: r.count || 0 }; });
      setReferrerPerformance(perfMap);

      const commissionRows = await window.db.all(
        `SELECT ocl.referrer_name as name, SUM(ocl.commission_amount) as commission
         FROM order_commission_log ocl
         JOIN orders o ON o.id = ocl.order_id
         WHERE date(o.order_date) >= ? AND date(o.order_date) <= ?
         GROUP BY ocl.referrer_name`,
        [start, end]
      );
      const commMap = {};
      (commissionRows || []).forEach((r) => { commMap[r.name] = parseFloat(r.commission) || 0; });
      setReferrerCommission(commMap);
    } catch (e) {
      if (reqId === loadReferrersRequestRef.current) {
        console.error(e);
        setReferrers([]);
        setReferrerPerformance({});
        setReferrerCommission({});
        setLoadError(e?.message || 'Failed to load referral data');
      }
    } finally {
      if (reqId === loadReferrersRequestRef.current) setLoading(false);
    }
  }, [filter, customFrom, customTo]);

  useEffect(() => {
    loadReferrers();
  }, [loadReferrers]);

  useEffect(() => {
    if (window.db?.getLabConfig) {
      window.db.getLabConfig().then((c) => {
        if (c) {
          setLabConfig((prev) => ({
            ...prev,
            name: c.name || prev.name,
            email: c.email || prev.email || '',
            phone: c.phone || prev.phone || '',
            default_printed_by: c.default_printed_by || prev.default_printed_by,
          }));
        }
      }).catch(() => {});
    }
  }, []);

  const loadPatientsRequestRef = useRef(null);
  const loadPatientsForReferrer = useCallback(async (referrerName) => {
    if (!window.db || !referrerName) return;
    loadPatientsRequestRef.current = referrerName;
    setLoadingPatients(true);
    try {
      const [start, end] = getDateRange(filter, customFrom, customTo);
      const rows = await window.db.all(
        `SELECT p.patient_id, p.name, p.age, p.sex, o.order_date
         FROM patients p JOIN orders o ON o.patient_id = p.id
         WHERE p.referred_by = ? AND date(o.order_date) >= ? AND date(o.order_date) <= ?
         ORDER BY o.order_date DESC`,
        [referrerName, start, end]
      );
      if (loadPatientsRequestRef.current !== referrerName) return;
      setPatientList(rows || []);
      setSelectedReferrer(referrerName);
    } catch (e) {
      if (loadPatientsRequestRef.current === referrerName) {
        console.error(e);
        setPatientList([]);
      }
    } finally {
      if (loadPatientsRequestRef.current === referrerName) setLoadingPatients(false);
    }
  }, [filter, customFrom, customTo]);

  const loadReferrerPaymentInvoice = useCallback(async (referrerName) => {
    if (!window.db || !referrerName) return;
    setInvoiceReferrer(referrerName);
    setLoadingInvoice(true);
    setInvoiceData(null);
    try {
      const [start, end] = getDateRange(filter, customFrom, customTo);
      const ordersRows = await window.db.all(
        `SELECT o.id, o.order_date, o.total_amount, p.patient_id, p.name as patient_name,
                ocl.commission_amount, ocl.commission_percent, ocl.order_amount
         FROM orders o
         JOIN patients p ON o.patient_id = p.id
         LEFT JOIN order_commission_log ocl ON ocl.order_id = o.id
         WHERE p.referred_by = ?
         AND date(o.order_date) >= ? AND date(o.order_date) <= ?
         ORDER BY o.order_date DESC, o.id DESC`,
        [referrerName, start, end]
      );
      const orderIds = (ordersRows || []).map((r) => r.id);
      const testsByOrder = {};
      if (orderIds.length > 0) {
        const ph = orderIds.map(() => '?').join(',');
        const testRows = await window.db.all(
          `SELECT ot.order_id, pr.name as test_name, ot.display_order
           FROM order_tests ot
           JOIN parameters pr ON pr.id = ot.parameter_id
           WHERE ot.order_id IN (${ph})
           ORDER BY ot.order_id, ot.display_order`,
          orderIds
        );
        (testRows || []).forEach((t) => {
          if (!testsByOrder[t.order_id]) testsByOrder[t.order_id] = [];
          testsByOrder[t.order_id].push(t.test_name);
        });
      }
      const lines = (ordersRows || []).map((r) => {
        const bill = parseFloat(r.order_amount);
        const billAmt = !Number.isNaN(bill) && bill > 0 ? bill : (parseFloat(r.total_amount) || 0);
        const comm = parseFloat(r.commission_amount);
        const commissionAmount = !Number.isNaN(comm) ? comm : 0;
        const cp = r.commission_percent != null ? parseFloat(r.commission_percent) : null;
        return {
          orderId: r.id,
          patientName: r.patient_name || '—',
          patientId: r.patient_id || '—',
          orderDate: r.order_date,
          tests: (testsByOrder[r.id] || []).join(', ') || '—',
          billAmount: billAmt,
          commissionAmount,
          commissionPct: cp != null && !Number.isNaN(cp) ? cp : null,
        };
      });
      const totalBill = lines.reduce((s, l) => s + l.billAmount, 0);
      const totalCommission = lines.reduce((s, l) => s + l.commissionAmount, 0);
      const pctRow = await window.db.get(
        'SELECT commission_percent FROM referrer_commission_pct WHERE referrer_name = ?',
        [referrerName]
      );
      const labRow = await window.db.get('SELECT commission_default_percent FROM lab WHERE id = 1');
      const defaultPct = parseFloat(pctRow?.commission_percent ?? labRow?.commission_default_percent ?? 45);
      const pctVals = lines.map((l) => l.commissionPct).filter((x) => x != null && !Number.isNaN(x));
      const pctSet = new Set(pctVals);
      let displayPct = defaultPct;
      let rateNote = null;
      if (pctSet.size === 1) displayPct = [...pctSet][0];
      else if (pctSet.size > 1) {
        displayPct = null;
        rateNote = 'Multiple rates in period — see % column per order.';
      }

      setInvoiceData({
        referrerName,
        periodStart: start,
        periodEnd: end,
        periodLabel: `${formatDisplayDateStr(start)} – ${formatDisplayDateStr(end)}`,
        lines,
        orderCount: lines.length,
        totalBill,
        totalCommission,
        displayPct,
        defaultPct,
        rateNote,
      });
    } catch (e) {
      console.error(e);
      setInvoiceData(null);
    } finally {
      setLoadingInvoice(false);
    }
  }, [filter, customFrom, customTo]);

  const closeInvoiceModal = useCallback(() => {
    setInvoiceReferrer(null);
    setInvoiceData(null);
    setInvoicePrintHint('');
  }, []);

  const runReferrerInvoicePrint = useCallback(async () => {
    setInvoicePrintHint('');
    if (typeof window.electronPrintPreview === 'function') {
      const result = await window.electronPrintPreview();
      if (result?.ok) {
        setInvoicePrintHint('Opened in PDF preview — use Print there.');
        setTimeout(() => setInvoicePrintHint(''), 4000);
        return;
      }
    }
    if (typeof window.electronPrint === 'function') {
      await window.electronPrint(1);
      setInvoicePrintHint('Use the print dialog to finish.');
      setTimeout(() => setInvoicePrintHint(''), 3000);
      return;
    }
    window.print();
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (invoiceReferrer) closeInvoiceModal();
        else if (selectedReferrer) setSelectedReferrer(null);
      } else if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        loadReferrers();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedReferrer, invoiceReferrer, closeInvoiceModal, loadReferrers]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [filter, customFrom, customTo, search]);

  const handleExportExcel = async () => {
    if (!window.db?.exportReferralsExcel) return;
    try {
      const [start, end] = getDateRange(filter, customFrom, customTo);
      const path = await window.db.exportReferralsExcel({ dateFrom: start, dateTo: end });
      setExportFeedback(`Exported: ${path}`);
      setTimeout(() => setExportFeedback(''), 3000);
    } catch (e) {
      setExportFeedback('Export failed');
      setTimeout(() => setExportFeedback(''), 3000);
    }
  };

  const totalPatients = referrers.reduce((s, r) => s + (r.count || 0), 0);
  const maxCount = Math.max(...referrers.map((r) => r.count || 0), 1);
  const topReferrer = referrers[0];

  const filteredReferrers = search.trim()
    ? referrers.filter((r) =>
        (r.name || '').toLowerCase().includes(search.trim().toLowerCase())
      )
    : referrers;

  const getRankBadge = (idx) => {
    if (idx === 0) return { bg: 'linear-gradient(135deg, #ffd700 0%, #ffb700 100%)', label: '1st' };
    if (idx === 1) return { bg: 'linear-gradient(135deg, #c0c0c0 0%, #a0a0a0 100%)', label: '2nd' };
    if (idx === 2) return { bg: 'linear-gradient(135deg, #cd7f32 0%, #b87333 100%)', label: '3rd' };
    return null;
  };

  const formatDate = (d) => {
    if (!d) return '—';
    const x = new Date(d);
    return `${String(x.getDate()).padStart(2, '0')}-${String(x.getMonth() + 1).padStart(2, '0')}-${x.getFullYear()}`;
  };

  /** Order date on invoice table (avoids UTC shift on YYYY-MM-DD). */
  const formatOrderDateOnly = (d) => {
    if (!d) return '—';
    const s = String(d);
    const x = new Date(s.length === 10 ? `${s}T12:00:00` : s);
    if (isNaN(x.getTime())) return '—';
    return `${String(x.getDate()).padStart(2, '0')}-${String(x.getMonth() + 1).padStart(2, '0')}-${x.getFullYear()}`;
  };

  const formatDisplayDate = (dateStr) => {
    if (!dateStr) return '—';
    const x = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${String(x.getDate()).padStart(2, '0')} ${months[x.getMonth()]} ${x.getFullYear()}`;
  };

  const [start, end] = getDateRange(filter, customFrom, customTo);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Referral Report</h1>
        <p style={styles.subtitle}>
          Track doctors and clinics who refer patients to your lab
        </p>
      </div>

      <div style={styles.commissionBanner}>
        <strong>Commission</strong> — Per referrer rate (default 45%). Edit in Referrer tab.
      </div>

      <div style={styles.periodRow}>
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            style={{
              ...styles.periodBtn,
              ...(filter === p.id ? styles.periodBtnActive : {}),
            }}
            onClick={() => setFilter(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {filter === 'custom' && (
        <div style={styles.customRow}>
          <div style={styles.dateCol}>
            <label style={styles.dateLabel}>From</label>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              style={styles.dateInput}
            />
          </div>
          <div style={styles.dateCol}>
            <label style={styles.dateLabel}>To</label>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              style={styles.dateInput}
            />
          </div>
        </div>
      )}

      <p style={styles.dateRangeLabel}>Showing: {formatDisplayDate(start)} – {formatDisplayDate(end)}</p>

      <div style={styles.toolbar}>
        <button style={styles.refreshBtn} onClick={loadReferrers} disabled={loading}>
          ↻ Refresh
        </button>
        {window.db?.exportReferralsExcel && (
          <button style={styles.exportBtn} onClick={handleExportExcel} disabled={loading}>
            Export to Excel
          </button>
        )}
        {exportFeedback && <span style={styles.exportFeedback}>{exportFeedback}</span>}
      </div>

      {loadError && (
        <div style={styles.loadError}>
          {loadError}
          <button style={styles.retryBtn} onClick={loadReferrers}>Retry</button>
        </div>
      )}
      {loading ? (
        <div style={styles.loading}>Loading...</div>
      ) : (
        <>
          <div style={styles.statsRow}>
            <div style={styles.statCard}>
              <div style={styles.statValue}>{referrers.length}</div>
              <div style={styles.statLabel}>Referrers</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statValue}>{totalPatients}</div>
              <div style={styles.statLabel}>Total Patients</div>
            </div>
            <div style={styles.statCardHighlight}>
              <div style={styles.statValueHighlight}>
                {topReferrer ? topReferrer.name || '—' : '—'}
              </div>
              <div style={styles.statLabelHighlight}>
                Top referrer {topReferrer ? `(${topReferrer.count} patients)` : ''}
              </div>
            </div>
          </div>

          <div style={styles.searchRow}>
            <input
              type="text"
              placeholder="Search referrer by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={styles.searchInput}
            />
          </div>

          <div style={styles.referrerCardSection}>
            {filteredReferrers.length === 0 ? (
              <div style={styles.emptyWrap}>
                <div style={styles.empty}>
                  {search.trim()
                    ? 'No referrers match your search'
                    : 'No referral data for this period'}
                </div>
                {search.trim() ? (
                  <button style={styles.emptyBtn} onClick={() => setSearch('')}>Clear search</button>
                ) : (
                  <button style={styles.emptyBtn} onClick={() => navigate('/new-registration')}>Register patient</button>
                )}
              </div>
            ) : (
              <>
                <p style={styles.clickHint}>Click: patient list · Double-click: referrer payment invoice (uses period above)</p>
                <div style={styles.referrerCardGrid}>
                {filteredReferrers.map((r, i) => {
                  const rank = referrers.findIndex((x) => x.name === r.name);
                  const badge = getRankBadge(rank);
                  const pct = totalPatients ? ((r.count / totalPatients) * 100).toFixed(1) : '0';
                  const perf = referrerPerformance[r.name] || {};
                  const commission = referrerCommission[r.name] ?? 0;
                  return (
                    <div
                      key={i}
                      style={styles.referrerCard}
                      className="referrer-card-clickable"
                      onClick={() => {
                        if (rowClickTimeoutRef.current) clearTimeout(rowClickTimeoutRef.current);
                        rowClickTimeoutRef.current = setTimeout(() => {
                          rowClickTimeoutRef.current = null;
                          setInvoiceReferrer(null);
                          setInvoiceData(null);
                          loadPatientsForReferrer(r.name);
                        }, 250);
                      }}
                      onDoubleClick={() => {
                        if (rowClickTimeoutRef.current) {
                          clearTimeout(rowClickTimeoutRef.current);
                          rowClickTimeoutRef.current = null;
                        }
                        setSelectedReferrer(null);
                        void loadReferrerPaymentInvoice(r.name);
                      }}
                    >
                      {badge && (
                        <span
                          style={{
                            ...styles.referrerCardBadge,
                            background: badge.bg,
                          }}
                        >
                          {badge.label}
                        </span>
                      )}
                      <div style={styles.referrerCardName}>{r.name || '—'}</div>
                      <div style={styles.referrerCardMeta}>
                        <span style={styles.referrerCardCount}>{r.count}</span>
                        <span style={styles.referrerCardLabel}>patients</span>
                        <span style={styles.referrerCardPct}>{pct}%</span>
                      </div>
                      <div style={styles.referrerCardPerf}>
                        <div style={styles.referrerCardPerfRow}>
                          <span style={styles.referrerCardPerfLabel}>Today</span>
                          <span style={styles.referrerCardPerfVal}>{perf.today ?? 0}</span>
                        </div>
                        <div style={styles.referrerCardPerfRow}>
                          <span style={styles.referrerCardPerfLabel}>This Week</span>
                          <span style={styles.referrerCardPerfVal}>{perf.week ?? 0}</span>
                        </div>
                        <div style={styles.referrerCardPerfRow}>
                          <span style={styles.referrerCardPerfLabel}>This Month</span>
                          <span style={styles.referrerCardPerfVal}>{perf.month ?? 0}</span>
                        </div>
                        <div style={styles.referrerCardPerfRow}>
                          <span style={styles.referrerCardPerfLabel}>Last Month</span>
                          <span style={styles.referrerCardPerfVal}>{perf.lastMonth ?? 0}</span>
                        </div>
                        <div style={{ ...styles.referrerCardPerfRow, marginTop: 8, paddingTop: 8, borderTop: '1px solid #e8ecef' }}>
                          <span style={styles.referrerCardPerfLabel}>Commission</span>
                          <span style={{ ...styles.referrerCardPerfVal, color: '#166534' }}>₹{commission.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              </>
            )}
          </div>
        </>
      )}

      {invoiceReferrer && (
        <div className="referrer-invoice-overlay" style={styles.invoiceOverlay} onClick={closeInvoiceModal}>
          <div
            className="referrer-payment-print"
            style={styles.invoiceSheet}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="no-print" style={styles.invoiceToolbar}>
              <div>
                <h3 style={styles.invoiceToolbarTitle}>Referrer payment invoice</h3>
                {invoicePrintHint && <p style={styles.invoicePrintHint}>{invoicePrintHint}</p>}
              </div>
              <div style={styles.modalHeaderActions}>
                <button type="button" style={styles.printBtn} onClick={runReferrerInvoicePrint}>
                  🖨 Print invoice
                </button>
                <button type="button" style={styles.modalClose} onClick={closeInvoiceModal}>×</button>
              </div>
            </div>
            {loadingInvoice ? (
              <div style={styles.modalLoading}>Loading invoice…</div>
            ) : invoiceData ? (
              <div className="referrer-invoice-body invoice-sheet-body" style={styles.invoiceBody}>
                {/* On-screen header; hidden when printing — print uses table thead banner */}
                <div className="referrer-screen-header">
                  <div style={styles.invHero}>
                    <div style={styles.invHeroInner}>
                      <div style={styles.invMonogram} aria-hidden>
                        {(labConfig.name || 'M').trim().charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={styles.invLabName}>{labConfig.name}</div>
                        <div style={styles.invContactRow}>
                          {labConfig.email ? (
                            <span style={styles.invChip}>✉ {labConfig.email}</span>
                          ) : null}
                          {labConfig.phone ? (
                            <span style={styles.invChip}>☎ {labConfig.phone}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={styles.invDocTitle}>Payment invoice</div>
                  <div style={styles.invMetaGrid}>
                    <div>
                      <span style={styles.invMetaK}>Referrer</span>
                      <span style={styles.invMetaV}>{invoiceData.referrerName}</span>
                    </div>
                    <div>
                      <span style={styles.invMetaK}>Period</span>
                      <span style={styles.invMetaV}>{invoiceData.periodLabel}</span>
                    </div>
                    <div>
                      <span style={styles.invMetaK}>Orders in period</span>
                      <span style={styles.invMetaV}>{invoiceData.orderCount}</span>
                    </div>
                  </div>
                </div>

                {invoiceData.lines.length === 0 ? (
                  <p style={styles.modalEmpty}>No orders for this referrer in the selected period.</p>
                ) : (
                  <>
                    <div style={styles.invTableWrap}>
                      <table className="referrer-a4-table" style={{ width: '100%' }}>
                        <colgroup>
                          <col style={{ width: '17%' }} />
                          <col style={{ width: '9%' }} />
                          <col style={{ width: '40%' }} />
                          <col style={{ width: '12%' }} />
                          <col style={{ width: '12%' }} />
                          <col style={{ width: '10%' }} />
                        </colgroup>
                        <thead>
                          <tr className="referrer-print-banner-row">
                            <th colSpan={6} className="referrer-print-banner-cell">
                              <div className="referrer-print-banner-title">{labConfig.name}</div>
                              <div className="referrer-print-banner-sub">
                                {[labConfig.email ? `✉ ${labConfig.email}` : null, labConfig.phone ? `☎ ${labConfig.phone}` : null].filter(Boolean).join(' · ') || '\u00A0'}
                              </div>
                              <div className="referrer-print-banner-doc">
                                Payment invoice · {invoiceData.referrerName} · {invoiceData.periodLabel}
                                {' · '}
                                Orders: {invoiceData.orderCount}
                              </div>
                            </th>
                          </tr>
                          <tr>
                            <th scope="col">Patient</th>
                            <th scope="col">Date</th>
                            <th scope="col">Tests</th>
                            <th scope="col" className="referrer-a4-numeric">Bill (₹)</th>
                            <th scope="col" className="referrer-a4-numeric">Comm (₹)</th>
                            <th scope="col" className="referrer-a4-numeric">%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {invoiceData.lines.map((line) => (
                            <tr key={line.orderId}>
                              <td className="referrer-a4-patient">
                                <strong>{line.patientName}</strong>
                                <span className="referrer-a4-pid">{line.patientId}</span>
                              </td>
                              <td>{formatOrderDateOnly(line.orderDate)}</td>
                              <td style={{ lineHeight: 1.35 }}>{line.tests}</td>
                              <td className="referrer-a4-numeric">₹{money(line.billAmount)}</td>
                              <td className="referrer-a4-numeric">₹{money(line.commissionAmount)}</td>
                              <td className="referrer-a4-numeric">
                                {line.commissionPct != null ? `${line.commissionPct}%` : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="referrer-invoice-summary-block" style={styles.invSummaryBox}>
                      <div style={styles.invSummaryLeft}>
                        <div style={styles.invSummaryLine}>
                          <span>Total patient billing</span>
                          <strong>₹{money(invoiceData.totalBill)}</strong>
                        </div>
                        {invoiceData.rateNote && (
                          <p style={styles.invRateNote}>{invoiceData.rateNote}</p>
                        )}
                      </div>
                      <div style={styles.invSummaryRight}>
                        <div style={styles.invGrandLabel}>Grand total (payable)</div>
                        <div style={styles.invGrandAmount}>₹{money(invoiceData.totalCommission)}</div>
                        <div style={styles.invPctBelow}>
                          {invoiceData.displayPct != null
                            ? `Commission rate: ${invoiceData.displayPct}%`
                            : `Default rate: ${invoiceData.defaultPct}%`}
                        </div>
                      </div>
                    </div>

                    <div className="referrer-invoice-footer-print" style={styles.invFooter}>
                      Printed by <strong>{labConfig.default_printed_by}</strong>
                      {' · '}
                      {formatDate(new Date())}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div style={styles.modalEmpty}>Could not load invoice.</div>
            )}
          </div>
        </div>
      )}

      {selectedReferrer && (
        <div style={styles.modalOverlay} onClick={() => setSelectedReferrer(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Patients referred by {selectedReferrer}</h3>
              <div style={styles.modalHeaderActions}>
                {patientList.length > 0 && (
                  <button
                    style={styles.copyBtn}
                    onClick={() => {
                      const header = 'Patient ID\tName\tAge\tSex\tOrder Date';
                      const rows = patientList.map((pt) =>
                        [pt.patient_id || '—', pt.name || '—', pt.age ?? '—', pt.sex || '—', formatDate(pt.order_date)].join('\t')
                      ).join('\n');
                      navigator.clipboard.writeText(`${header}\n${rows}`);
                    }}
                  >
                    Copy
                  </button>
                )}
                <button style={styles.modalClose} onClick={() => setSelectedReferrer(null)}>×</button>
              </div>
            </div>
            {loadingPatients ? (
              <div style={styles.modalLoading}>Loading...</div>
            ) : (
              <div style={styles.modalBody}>
                {patientList.length === 0 ? (
                  <p style={styles.modalEmpty}>No patients found</p>
                ) : (
                  <div style={styles.patientTable}>
                    <div style={styles.patientRowHeader}>
                      <span>Patient ID</span>
                      <span>Name</span>
                      <span>Age</span>
                      <span>Sex</span>
                      <span>Order Date</span>
                    </div>
                    {patientList.map((pt, idx) => (
                      <div key={idx} style={styles.patientRow}>
                        <span>{pt.patient_id || '—'}</span>
                        <span>{pt.name || '—'}</span>
                        <span>{pt.age ?? '—'}</span>
                        <span>{pt.sex || '—'}</span>
                        <span>{formatDate(pt.order_date)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    maxWidth: 920,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: '#1e3a5f',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    margin: 0,
  },
  commissionBanner: {
    padding: 12,
    marginBottom: 16,
    background: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: 10,
    fontSize: 13,
    color: '#166534',
  },
  periodRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  periodBtn: {
    padding: '10px 18px',
    borderRadius: 8,
    border: '1px solid #ddd',
    background: '#fff',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    color: '#555',
  },
  periodBtnActive: {
    background: '#0d7377',
    color: '#fff',
    borderColor: '#0d7377',
  },
  customRow: {
    display: 'flex',
    gap: 16,
    marginBottom: 16,
  },
  dateCol: {
    minWidth: 140,
  },
  dateLabel: {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: '#666',
    marginBottom: 4,
  },
  dateInput: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #ddd',
    fontSize: 14,
  },
  dateRangeLabel: {
    fontSize: 13,
    color: '#64748b',
    margin: '0 0 16px',
    fontWeight: 500,
  },
  toolbar: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  refreshBtn: {
    padding: '10px 18px',
    borderRadius: 8,
    border: '1px solid #ddd',
    background: '#fff',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    color: '#555',
  },
  exportBtn: {
    padding: '10px 18px',
    borderRadius: 8,
    border: 'none',
    background: '#0d7377',
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  exportFeedback: {
    fontSize: 13,
    color: '#0d7377',
    fontWeight: 500,
  },
  loading: {
    padding: 48,
    textAlign: 'center',
    color: '#666',
    fontSize: 15,
  },
  loadError: {
    padding: 16,
    marginBottom: 16,
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 10,
    color: '#b91c1c',
    fontSize: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  retryBtn: {
    padding: '8px 16px',
    borderRadius: 8,
    border: '1px solid #b91c1c',
    background: '#fff',
    color: '#b91c1c',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 16,
    marginBottom: 24,
  },
  statCard: {
    background: '#fff',
    borderRadius: 12,
    padding: 20,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    textAlign: 'center',
    border: '1px solid #eee',
  },
  statValue: {
    fontSize: 28,
    fontWeight: 700,
    color: '#0d7377',
    lineHeight: 1.2,
  },
  statLabel: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  statCardHighlight: {
    background: 'linear-gradient(135deg, #1e3a5f 0%, #0d7377 100%)',
    borderRadius: 12,
    padding: 20,
    boxShadow: '0 4px 12px rgba(13,115,119,0.25)',
    textAlign: 'center',
    gridColumn: '1 / -1',
  },
  statValueHighlight: {
    fontSize: 18,
    fontWeight: 600,
    color: '#fff',
    lineHeight: 1.3,
  },
  statLabelHighlight: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 4,
  },
  searchRow: {
    marginBottom: 16,
  },
  searchInput: {
    width: '100%',
    padding: '12px 16px',
    borderRadius: 10,
    border: '1px solid #ddd',
    fontSize: 14,
    background: '#fff',
  },
  referrerCardSection: {
    background: '#fff',
    borderRadius: 12,
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
    overflow: 'hidden',
    border: '1px solid #eee',
    padding: '0 0 20px',
  },
  clickHint: {
    margin: 0,
    padding: '8px 20px',
    fontSize: 12,
    color: '#999',
    background: '#fafafa',
    borderBottom: '1px solid #eee',
  },
  referrerCardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: 16,
    padding: 20,
    maxHeight: 480,
    overflowY: 'auto',
  },
  referrerCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px 16px',
    borderRadius: 12,
    border: '2px solid #e8ecef',
    background: '#fff',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    minHeight: 200,
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    position: 'relative',
  },
  referrerCardBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    fontWeight: 700,
    color: '#fff',
    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
  },
  referrerCardName: {
    fontSize: 15,
    fontWeight: 600,
    color: '#1e3a5f',
    textAlign: 'center',
    lineHeight: 1.3,
    marginBottom: 10,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    wordBreak: 'break-word',
  },
  referrerCardMeta: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  referrerCardCount: {
    fontSize: 22,
    fontWeight: 700,
    color: '#0d7377',
    lineHeight: 1.2,
  },
  referrerCardLabel: {
    fontSize: 11,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  referrerCardPct: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  referrerCardPerf: {
    marginTop: 12,
    paddingTop: 10,
    borderTop: '1px solid #e8ecef',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  referrerCardPerfRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 12,
  },
  referrerCardPerfLabel: {
    color: '#64748b',
  },
  referrerCardPerfVal: {
    fontWeight: 600,
    color: '#0d7377',
  },
  empty: {
    padding: '24px 48px 12px',
    textAlign: 'center',
    color: '#999',
    fontSize: 15,
  },
  emptyWrap: {
    padding: 24,
    textAlign: 'center',
  },
  emptyBtn: {
    padding: '10px 20px',
    borderRadius: 8,
    border: '1px solid #0d7377',
    background: '#fff',
    color: '#0d7377',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: '#fff',
    borderRadius: 12,
    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
    maxWidth: 560,
    width: '90%',
    maxHeight: '80vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  reportModal: {
    background: '#fff',
    borderRadius: 12,
    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
    maxWidth: 680,
    width: '92%',
    maxHeight: '85vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  reportModalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid #eee',
    background: '#f8fafb',
  },
  reportModalTitle: {
    fontSize: 17,
    fontWeight: 600,
    color: '#1e3a5f',
    margin: 0,
  },
  reportFilters: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
    padding: '14px 20px',
    borderBottom: '1px solid #eee',
    background: '#fafbfc',
  },
  reportPeriodBtn: {
    padding: '8px 14px',
    borderRadius: 8,
    border: '1px solid #ddd',
    background: '#fff',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    color: '#555',
  },
  reportDateRow: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
  },
  reportDateInput: {
    minWidth: 140,
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid #ddd',
    fontSize: 14,
  },
  reportBody: {
    padding: 20,
    overflowY: 'auto',
    flex: 1,
  },
  reportSummary: {
    fontSize: 15,
    color: '#333',
    marginBottom: 16,
  },
  reportTotal: {
    fontWeight: 700,
    color: '#0d7377',
    fontSize: 18,
  },
  reportTableWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid #eee',
    background: '#f8fafb',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: '#1e3a5f',
    margin: 0,
  },
  modalHeaderActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  copyBtn: {
    padding: '6px 12px',
    borderRadius: 6,
    border: '1px solid #0d7377',
    background: '#fff',
    color: '#0d7377',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  modalClose: {
    background: 'none',
    border: 'none',
    fontSize: 24,
    cursor: 'pointer',
    color: '#666',
    lineHeight: 1,
    padding: '0 4px',
  },
  modalBody: {
    padding: 20,
    overflowY: 'auto',
    flex: 1,
  },
  modalLoading: {
    padding: 32,
    textAlign: 'center',
    color: '#666',
  },
  modalEmpty: {
    color: '#999',
    textAlign: 'center',
    margin: 0,
  },
  patientTable: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  patientRowHeader: {
    display: 'grid',
    gridTemplateColumns: '90px 1fr 50px 50px 90px',
    gap: 12,
    padding: '10px 0',
    borderBottom: '2px solid #eee',
    fontSize: 12,
    fontWeight: 600,
    color: '#666',
  },
  patientRow: {
    display: 'grid',
    gridTemplateColumns: '90px 1fr 50px 50px 90px',
    gap: 12,
    padding: '10px 0',
    borderBottom: '1px solid #f0f0f0',
    fontSize: 14,
    color: '#333',
  },
  printBtn: {
    padding: '8px 16px',
    borderRadius: 8,
    border: 'none',
    background: '#0d7377',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  invoiceOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1100,
    padding: 16,
  },
  invoiceSheet: {
    background: '#fff',
    borderRadius: 14,
    boxShadow: '0 20px 48px rgba(15,40,71,0.2)',
    width: '100%',
    maxWidth: 820,
    maxHeight: '92vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    borderLeft: '5px solid #0d7377',
  },
  invoiceToolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #e2e8f0',
    background: '#f8fafb',
    flexShrink: 0,
  },
  invoiceToolbarTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: '#1e3a5f',
  },
  invoicePrintHint: {
    margin: '4px 0 0',
    fontSize: 12,
    color: '#0d7377',
  },
  invoiceBody: {
    padding: '14px 16px 18px',
    overflowY: 'auto',
    flex: 1,
    fontSize: 11,
    background: 'linear-gradient(180deg, #f8fafc 0%, #fff 100px)',
  },
  invHero: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    background: 'linear-gradient(135deg, #1e3a5f 0%, #0d7377 55%, #14a3a8 100%)',
    boxShadow: '0 6px 20px rgba(13,115,119,0.25)',
  },
  invHeroInner: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '14px 16px',
  },
  invMonogram: {
    width: 44,
    height: 44,
    borderRadius: 10,
    background: 'rgba(255,255,255,0.2)',
    color: '#fff',
    fontSize: 20,
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    border: '2px solid rgba(255,255,255,0.35)',
  },
  invLabName: {
    fontSize: 16,
    fontWeight: 800,
    color: '#fff',
    marginBottom: 6,
    lineHeight: 1.2,
  },
  invContactRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  invChip: {
    color: 'rgba(255,255,255,0.92)',
    background: 'rgba(0,0,0,0.12)',
    padding: '4px 10px',
    borderRadius: 20,
    fontSize: 10,
    fontWeight: 500,
  },
  invDocTitle: {
    fontSize: 14,
    fontWeight: 800,
    color: '#1e3a5f',
    textTransform: 'uppercase',
    letterSpacing: '0.14em',
    borderBottom: '2px solid #0d7377',
    paddingBottom: 6,
    marginBottom: 10,
  },
  invMetaGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: 10,
    marginBottom: 14,
    fontSize: 10,
  },
  invMetaK: {
    display: 'block',
    color: '#94a3b8',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 2,
  },
  invMetaV: { display: 'block', color: '#1e293b', fontWeight: 600 },
  invTableWrap: {
    border: '1px solid #e2e8f0',
    borderRadius: 10,
    overflow: 'auto',
    marginBottom: 14,
    maxWidth: '100%',
  },
  invSummaryBox: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 16,
    padding: '14px 16px',
    borderRadius: 10,
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    marginBottom: 12,
  },
  invSummaryLeft: { flex: '1 1 200px' },
  invSummaryLine: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 16,
    fontSize: 12,
    color: '#475569',
  },
  invRateNote: { margin: '8px 0 0', fontSize: 10, color: '#b45309' },
  invSummaryRight: { textAlign: 'right', flex: '0 1 auto' },
  invGrandLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
  },
  invGrandAmount: {
    fontSize: 22,
    fontWeight: 800,
    color: '#0d7377',
    fontVariantNumeric: 'tabular-nums',
    marginTop: 4,
  },
  invPctBelow: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: 600,
    color: '#1e3a5f',
  },
  invFooter: {
    fontSize: 9,
    color: '#64748b',
    textAlign: 'center',
    paddingTop: 8,
    borderTop: '1px dashed #e2e8f0',
  },
};
