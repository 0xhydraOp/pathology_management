import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import OrderBarcode from '../components/OrderBarcode.jsx';

/** USB scanners type alnum + Enter — lookup order by bill barcode (orders.access_code). */
async function fetchOrderByAccessCode(raw) {
  const q = (raw || '').trim().toUpperCase();
  if (q.length < 8 || q.length > 14 || !/^[A-Z2-9]+$/.test(q) || !window.db) return null;
  return window.db.get(
    `SELECT o.*, p.patient_id as pt_id, p.name as patient_name, p.age, p.sex, p.phone, p.address, p.referred_by
     FROM orders o JOIN patients p ON o.patient_id = p.id
     WHERE UPPER(TRIM(COALESCE(o.access_code, ''))) = ?`,
    [q]
  );
}

function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDatePreset(preset) {
  const d = new Date();
  const today = toLocalDateStr(d);
  if (preset === 'today') return { dateFrom: today, dateTo: today };
  const y = new Date(d);
  y.setDate(y.getDate() - 1);
  const yesterday = toLocalDateStr(y);
  if (preset === 'yesterday') return { dateFrom: yesterday, dateTo: yesterday };
  const w = new Date(d);
  w.setDate(w.getDate() - 6);
  const weekAgo = toLocalDateStr(w);
  if (preset === 'last7') return { dateFrom: weekAgo, dateTo: today };
  const m = new Date(d.getFullYear(), d.getMonth(), 1);
  const monthStart = toLocalDateStr(m);
  if (preset === 'month') return { dateFrom: monthStart, dateTo: today };
  const lastMonthStart = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const lastMonthEnd = new Date(d.getFullYear(), d.getMonth(), 0);
  if (preset === 'lastmonth') return { dateFrom: toLocalDateStr(lastMonthStart), dateTo: toLocalDateStr(lastMonthEnd) };
  return null;
}

export default function Reports() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const orderId = searchParams.get('order');
  const shouldPrint = searchParams.get('print') === '1';
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [labConfig, setLabConfig] = useState({ name: 'MONDAL DIAGNOSTIC CENTRE', address: '', phone: '', email: '', pathologist_name: 'Pathologist', default_printed_by: 'Admin', clinical_correlation_text: 'Please correlate clinically' });
  const [printCopies, setPrintCopies] = useState(1);
  const [search, setSearch] = useState('');
  const [printFeedback, setPrintFeedback] = useState('');
  const searchInputRef = useRef(null);
  const autoPrintFiredRef = useRef(false);
  const today = toLocalDateStr(new Date());
  const [orderFilter, setOrderFilter] = useState({ dateFrom: today, dateTo: today });

  const margins = { top: 12, left: 28, right: 28, bottom: 12 }; /* Page margins (1.5" top, 0.5" bottom) set via @page in CSS */

  useEffect(() => {
    if (window.db?.getLabConfig) {
      window.db.getLabConfig().then((c) => {
        if (c) setLabConfig((prev) => ({
          ...prev,
          name: c.name || prev.name,
          address: c.address || prev.address || '',
          phone: c.phone || prev.phone || '',
          email: c.email || prev.email || '',
          pathologist_name: c.pathologist_name || prev.pathologist_name,
          default_printed_by: c.default_printed_by || prev.default_printed_by,
          clinical_correlation_text: c.clinical_correlation_text || prev.clinical_correlation_text,
        }));
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (window.db) {
      let sql = `SELECT o.*, p.patient_id as pt_id, p.name as patient_name, p.age, p.sex, p.phone, p.address, p.referred_by 
         FROM orders o JOIN patients p ON o.patient_id = p.id WHERE 1=1`;
      const params = [];
      if (orderFilter.dateFrom) { sql += ' AND date(o.order_date) >= ?'; params.push(orderFilter.dateFrom); }
      if (orderFilter.dateTo) { sql += ' AND date(o.order_date) <= ?'; params.push(orderFilter.dateTo); }
      sql += ' ORDER BY o.created_at DESC LIMIT 200';
      window.db.all(sql, params.length ? params : []).then((rows) => {
        setOrders(rows || []);
        // Do not setSelectedOrder from ?order= here — date refetch would override barcode pick.
        // Deep link is handled in the effect below when selectedOrder is still null.
      }).catch(console.error);
    }
  }, [orderId, orderFilter.dateFrom, orderFilter.dateTo]);

  useEffect(() => {
    const t = setTimeout(() => searchInputRef.current?.focus?.(), 400);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!orderId || !window.db || selectedOrder) return;
    const id = parseInt(orderId, 10);
    if (isNaN(id)) return;
    window.db.get(
      `SELECT o.*, p.patient_id as pt_id, p.name as patient_name, p.age, p.sex, p.phone, p.address, p.referred_by 
       FROM orders o JOIN patients p ON o.patient_id = p.id WHERE o.id = ?`,
      [id]
    ).then((ord) => ord && setSelectedOrder(ord)).catch(() => {});
  }, [orderId, selectedOrder]);

  useEffect(() => {
    if (shouldPrint && reportData && (reportData.results?.length ?? 0) > 0 && !autoPrintFiredRef.current) {
      autoPrintFiredRef.current = true;
      const timer = setTimeout(() => {
        if (typeof window.electronPrintPreview === 'function') {
          window.electronPrintPreview();
        } else if (typeof window.electronPrint === 'function') {
          window.electronPrint(printCopies);
        } else {
          window.print();
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [reportData, shouldPrint, printCopies]);

  const selectedOrderIdRef = useRef(null);
  useEffect(() => {
    if (!selectedOrder || !window.db) {
      setReportData(null);
      selectedOrderIdRef.current = null;
      return;
    }
    const orderId = selectedOrder.id;
    selectedOrderIdRef.current = orderId;
    Promise.all([
      window.db.all(
        `SELECT pr.id as parameter_id, pr.code, pr.name as test_name, pr.unit, pr.decimal_places, pr.section, sr.result_value, sr.result_text, sr.flag
         FROM order_results sr
         JOIN parameters pr ON sr.parameter_id = pr.id
         WHERE sr.order_id = ?
         ORDER BY pr.section, pr.display_order`,
        [orderId]
      ),
      window.db.all('SELECT parameter_id, sex, min_age, max_age, low_value, high_value FROM parameter_ranges'),
    ]).then(([results, ranges]) => {
      if (selectedOrderIdRef.current !== orderId) return;
      const age = selectedOrder.age ?? 30;
      const sex = selectedOrder.sex || 'any';
      const rangeMap = {};
      (ranges || []).forEach((r) => {
        const match = (r.sex === 'any' || r.sex === sex) && age >= (r.min_age ?? 0) && age <= (r.max_age ?? 150);
        if (match) {
          const existing = rangeMap[r.parameter_id];
          if (!existing || (r.sex !== 'any' && existing.sex === 'any')) rangeMap[r.parameter_id] = r;
        }
      });
      const resultsWithRange = (results || []).map((r) => {
        const rr = rangeMap[r.parameter_id];
        const lo = rr?.low_value;
        const hi = rr?.high_value;
        const refRange = (lo != null || hi != null) ? `(${lo ?? '—'} – ${hi ?? '—'})` : '';
        return { ...r, refRange };
      });
      setReportData({ ...selectedOrder, results: resultsWithRange });
    }).catch(() => {
      if (selectedOrderIdRef.current === orderId) setReportData({ ...selectedOrder, results: [] });
    });
  }, [selectedOrder]);

  const getPrintedBy = () => {
    try {
      const u = JSON.parse(sessionStorage.getItem('lab_user') || '{}');
      return u.displayName || u.username || labConfig.default_printed_by || 'Admin';
    } catch { return labConfig.default_printed_by || 'Admin'; }
  };

  const handlePrint = useCallback(async () => {
    if (!reportData || (reportData.results?.length ?? 0) === 0) return;
    const printedBy = (() => {
      try {
        const u = JSON.parse(sessionStorage.getItem('lab_user') || '{}');
        return u.displayName || u.username || labConfig.default_printed_by || 'Admin';
      } catch { return labConfig.default_printed_by || 'Admin'; }
    })();
    if (window.db) {
      try {
        await window.db.logPrint(reportData.id, printedBy);
      } catch (e) {
        console.error(e);
      }
    }
    if (typeof window.electronPrintPreview === 'function') {
      const result = await window.electronPrintPreview();
      if (result?.ok) {
        setPrintFeedback('Report opened in preview — use Ctrl+P in that window to print');
      } else {
        setPrintFeedback(result?.error || 'Preview failed');
      }
      setTimeout(() => setPrintFeedback(''), 3500);
    } else if (typeof window.electronPrint === 'function') {
      await window.electronPrint(printCopies);
      setPrintFeedback('Printed');
      setTimeout(() => setPrintFeedback(''), 2500);
    } else {
      for (let i = 0; i < printCopies; i++) {
        window.print();
        if (i < printCopies - 1) await new Promise((r) => setTimeout(r, 800));
      }
      setPrintFeedback('Printed');
      setTimeout(() => setPrintFeedback(''), 2500);
    }
  }, [reportData, printCopies, labConfig.default_printed_by]);

  const handlePrintPreview = useCallback(async () => {
    if (!reportData || (reportData.results?.length ?? 0) === 0) return;
    if (typeof window.electronPrintPreview === 'function') {
      const result = await window.electronPrintPreview();
      if (!result?.ok) {
        setPrintFeedback(result?.error || 'Preview failed');
        setTimeout(() => setPrintFeedback(''), 3000);
      }
    } else {
      window.print();
    }
  }, [reportData]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        if (reportData && (reportData.results?.length ?? 0) > 0) handlePrint();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [reportData, handlePrint]);

  useEffect(() => {
    const onPrintTrigger = () => {
      if (reportData && (reportData.results?.length ?? 0) > 0) handlePrint();
    };
    window.addEventListener('app-print-trigger', onPrintTrigger);
    return () => window.removeEventListener('app-print-trigger', onPrintTrigger);
  }, [reportData, handlePrint]);

  const formatDate = (d) => {
    if (!d) return '—';
    const x = new Date(d);
    if (isNaN(x.getTime())) return '—';
    return `${String(x.getDate()).padStart(2, '0')}-${String(x.getMonth() + 1).padStart(2, '0')}-${x.getFullYear()} ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
  };

  const filteredOrders = (() => {
    const list = orders.filter((o) => {
      if (!search || !search.trim()) return true;
      const q = search.trim().toLowerCase();
      const qRaw = search.trim();
      if (/^\d+$/.test(qRaw) && String(o.id) === qRaw) return true;
      return (
        (o.patient_name && o.patient_name.toLowerCase().includes(q)) ||
        (o.pt_id && o.pt_id.toLowerCase().includes(q)) ||
        (o.phone && o.phone.includes(qRaw)) ||
        (o.referred_by && o.referred_by.toLowerCase().includes(q)) ||
        (o.access_code && o.access_code.toLowerCase().includes(q))
      );
    });
    const pinId = selectedOrder?.id;
    const sorted = pinId
      ? [...list].sort((a, b) => {
          if (a.id === pinId) return -1;
          if (b.id === pinId) return 1;
          return 0;
        })
      : list;
    if (selectedOrder && !sorted.some((o) => o.id === selectedOrder.id)) {
      return [selectedOrder, ...sorted];
    }
    return sorted;
  })();

  return (
    <div style={styles.container} className="reports-print-container reports-page">
      <div style={styles.pageHeader} className="no-print">
        <div style={styles.pageHeaderIcon}>📄</div>
        <div>
          <h1 style={styles.title}>Reports</h1>
          <p style={styles.subtitle}>
            Search <strong>order #</strong>, name, mobile, Ref. by, or <strong>scan bill barcode</strong> (focus here; Enter opens). Selected report stays at top of the list. Ctrl+P to print.
          </p>
        </div>
      </div>

      <div style={styles.card} className="no-print reports-filter-card">
        <div style={styles.presetCardGrid}>
          {[
            { id: 'today', label: 'Today', icon: '📅' },
            { id: 'yesterday', label: 'Yesterday', icon: '📆' },
            { id: 'last7', label: 'This Week', icon: '📋' },
            { id: 'month', label: 'This Month', icon: '📆' },
            { id: 'lastmonth', label: 'Last Month', icon: '🗓️' },
          ].map(({ id, label, icon }) => {
            const preset = getDatePreset(id);
            const isActive = orderFilter.dateFrom === preset?.dateFrom && orderFilter.dateTo === preset?.dateTo;
            return (
              <button
                key={id}
                type="button"
                className={`reports-preset-card ${isActive ? 'reports-preset-active' : ''}`}
                style={{
                  ...styles.presetCard,
                  ...(isActive ? styles.presetCardActive : {}),
                }}
                onClick={() => preset && setOrderFilter(preset)}
              >
                <span style={styles.presetCardIcon}>{icon}</span>
                <span style={styles.presetCardLabel}>{label}</span>
              </button>
            );
          })}
        </div>
        <div style={styles.filterRow}>
          <div style={styles.filterCol}>
            <label style={styles.label}>From</label>
            <input
              type="date"
              value={orderFilter.dateFrom}
              onChange={(e) => {
                const v = e.target.value;
                setOrderFilter((f) => {
                  const next = { ...f, dateFrom: v };
                  if (next.dateTo && v > next.dateTo) next.dateTo = v;
                  return next;
                });
              }}
              style={styles.input}
            />
          </div>
          <div style={styles.filterCol}>
            <label style={styles.label}>To</label>
            <input
              type="date"
              value={orderFilter.dateTo}
              onChange={(e) => {
                const v = e.target.value;
                setOrderFilter((f) => {
                  const next = { ...f, dateTo: v };
                  if (next.dateFrom && v < next.dateFrom) next.dateFrom = v;
                  return next;
                });
              }}
              style={styles.input}
            />
          </div>
          <div style={{ ...styles.filterCol, flex: 1 }}>
            <label style={styles.label}>Search or barcode scan</label>
            <input
              ref={searchInputRef}
              type="text"
              autoComplete="off"
              placeholder="Order #, name, mobile, referrer, or scan barcode…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                void (async () => {
                  const qRaw = search.trim();
                  const byCode = await fetchOrderByAccessCode(qRaw);
                  if (byCode) {
                    let od = '';
                    if (byCode.order_date) {
                      const s = String(byCode.order_date);
                      od = s.length >= 10 ? s.slice(0, 10) : s;
                    }
                    if (!od) od = toLocalDateStr(new Date());
                    setOrderFilter((f) => {
                      const curFrom = f.dateFrom || od;
                      const curTo = f.dateTo || od;
                      return {
                        dateFrom: curFrom <= od ? curFrom : od,
                        dateTo: curTo >= od ? curTo : od,
                      };
                    });
                    setSelectedOrder(byCode);
                    setSearch('');
                    navigate('/reports', { replace: true });
                    setPrintFeedback(`Loaded order #${byCode.id} from barcode`);
                    setTimeout(() => setPrintFeedback(''), 3500);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    setTimeout(() => searchInputRef.current?.focus?.(), 100);
                    return;
                  }
                  const qEnter = search.trim();
                  const qLower = qEnter.toLowerCase();
                  const list = orders.filter((o) => {
                    if (!qEnter) return true;
                    if (/^\d+$/.test(qEnter) && String(o.id) === qEnter) return true;
                    return (
                      (o.patient_name?.toLowerCase().includes(qLower))
                      || (o.pt_id?.toLowerCase().includes(qLower))
                      || (o.phone?.includes(qEnter))
                      || (o.referred_by?.toLowerCase().includes(qLower))
                      || (o.access_code?.toLowerCase().includes(qLower))
                    );
                  });
                  if (list.length > 0) setSelectedOrder(list[0]);
                })();
              }}
              style={styles.searchInput}
            />
          </div>
        </div>
        <div style={styles.filterRow}>
          <div style={{ ...styles.filterCol, flex: 1 }}>
            <label style={styles.label}>Select order</label>
            <select
              value={selectedOrder?.id || ''}
              onChange={(e) => {
                const id = parseInt(e.target.value, 10);
                const ord = filteredOrders.find((o) => o.id === id) || orders.find((o) => o.id === id);
                setSelectedOrder(ord || null);
              }}
              style={styles.select}
            >
              <option value="">— Choose order —</option>
              {filteredOrders.map((o) => (
                <option key={o.id} value={o.id}>
                  #{o.id}{o.access_code ? ` [${o.access_code}]` : ''} — {o.pt_id} — {o.patient_name}
                </option>
              ))}
            </select>
            {orders.length > 0 && <span style={styles.resultCount}>{filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''}</span>}
          </div>
        </div>
      </div>

      {reportData && (() => {
        const resultsBySection = (reportData.results || []).reduce((acc, r) => {
          const sec = r.section || 'Other';
          if (!acc[sec]) acc[sec] = [];
          acc[sec].push(r);
          return acc;
        }, {});
        const sectionOrder = ['DEPARTMENT OF HEMATOLOGY', 'DEPARTMENT OF BIOCHEMISTRY', 'DEPARTMENT OF LIVER FUNCTION TEST', 'DEPARTMENT OF KIDNEY FUNCTION TEST', 'DEPARTMENT OF LIPID PROFILE', 'DEPARTMENT OF SEROLOGY', 'DEPARTMENT OF IMMUNOLOGY', 'DEPARTMENT OF BLOOD GROUP TESTS', 'DEPARTMENT OF COAGULATION', 'DEPARTMENT OF CLINICAL PATHOLOGY', 'Other'];
        const orderedSections = Object.keys(resultsBySection).sort((a, b) => {
          const ia = sectionOrder.indexOf(a);
          const ib = sectionOrder.indexOf(b);
          if (ia >= 0 && ib >= 0) return ia - ib;
          if (ia >= 0) return -1;
          if (ib >= 0) return 1;
          return a.localeCompare(b);
        });
        const hasResults = orderedSections.length > 0;
        return (
        <>
          {!hasResults && (
            <div style={styles.reportCard} className="no-print">
              <p style={styles.hint}>No results entered yet for this order. Enter results first.</p>
              <button type="button" style={styles.actionBtn} onClick={() => navigate(`/result-entry?order=${reportData.id}`)}>Go to Result Entry</button>
            </div>
          )}
          <div style={styles.reportCardWrap} className="report-card-wrap">
            {orderedSections.map((sectionName, sectionIdx) => (
            <div
              key={sectionName}
              className={`report-print report-page report-card report-page-dept ${sectionIdx > 0 ? 'report-page-break-before' : ''} ${sectionIdx < orderedSections.length - 1 ? 'report-page-break' : ''}`}
              style={{
                ...styles.reportCard,
                paddingTop: margins.top,
                paddingLeft: margins.left,
                paddingRight: margins.right,
                paddingBottom: margins.bottom,
              }}
            >
              <div style={styles.reportHeader} className="report-header-no-break">
                <div style={styles.patientCard} className="patient-card-print">
                  <div style={styles.patientCardMain}>
                    <div style={styles.patientName}>{reportData.patient_name}</div>
                    <div style={styles.patientId}>ID: {reportData.pt_id}</div>
                  </div>
                  <div style={styles.patientCardGrid} className="patient-card-grid">
                    <div style={styles.patientItem}>
                      <span style={styles.patientLabel}>Age</span>
                      <span style={styles.patientValue}>{reportData.age || '—'}</span>
                    </div>
                    <div style={styles.patientItem}>
                      <span style={styles.patientLabel}>Sex</span>
                      <span style={styles.patientValue}>{reportData.sex === 'male' ? 'M' : reportData.sex === 'female' ? 'F' : '—'}</span>
                    </div>
                    <div style={styles.patientItem}>
                      <span style={styles.patientLabel}>Phone</span>
                      <span style={styles.patientValue}>{reportData.phone || '—'}</span>
                    </div>
                    <div style={styles.patientItem}>
                      <span style={styles.patientLabel}>Referred by</span>
                      <span style={styles.patientValue}>{reportData.referred_by || '—'}</span>
                    </div>
                  </div>
                  <div style={styles.patientAddress}>
                    <span style={styles.patientLabel}>Address</span>
                    <span style={styles.patientValue}>{reportData.address || '—'}</span>
                  </div>
                  {reportData.access_code && (
                    <div style={styles.reportBarcodeSection} className="report-barcode-section">
                      <span style={styles.patientLabel}>Bill barcode</span>
                      <OrderBarcode value={reportData.access_code} height={36} fontSize={10} />
                    </div>
                  )}
                  <div style={styles.reportDate}>Report Date: {formatDate(new Date())}</div>
                </div>
                <div style={styles.departmentTitle}>{sectionName}</div>
              </div>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Test</th>
                    <th style={styles.th}>Result</th>
                    <th style={styles.th}>Unit</th>
                    <th style={styles.th}>Ref</th>
                    <th style={styles.th}>Flag</th>
                  </tr>
                </thead>
                <tbody>
                  {resultsBySection[sectionName].map((r, i) => (
                    <tr key={i}>
                      <td style={styles.td}>{r.test_name}</td>
                      <td style={{ ...styles.td, fontWeight: 700, fontSize: 13 }}>
                        {r.result_value != null ? r.result_value : r.result_text || '—'}
                      </td>
                      <td style={styles.td}>{r.unit || '—'}</td>
                      <td style={{ ...styles.td, fontSize: 11, color: '#666' }}>{r.refRange || '—'}</td>
                      <td style={{ ...styles.td, color: r.flag === 'L' || r.flag === 'H' || r.flag === 'C' ? '#c00' : '#666' }}>
                        {r.flag === 'N' ? 'N' : r.flag === 'L' ? '↓' : r.flag === 'H' ? '↑' : r.flag === 'C' ? '!!' : r.flag || 'N'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={styles.footer}>
                <div style={styles.footerReadBy}>Read by: {labConfig.pathologist_name} · Printed by: {getPrintedBy()} · {formatDate(new Date())}</div>
                <div style={styles.footerClinical}>{labConfig.clinical_correlation_text || 'Please correlate clinically'}</div>
                {orderedSections.length > 1 && (
                  <div style={styles.pageNumber}>Page {sectionIdx + 1} of {orderedSections.length}</div>
                )}
              </div>
            </div>
          ))}
          </div>

          <div style={styles.actions} className="no-print reports-actions-bar">
            <select value={printCopies} onChange={(e) => setPrintCopies(parseInt(e.target.value, 10) || 1)} style={styles.copiesSelect}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n} {n === 1 ? 'copy' : 'copies'}</option>
              ))}
            </select>
            {typeof window.electronPrintPreview === 'function' ? (
              <button type="button" style={styles.printBtn} onClick={handlePrint} disabled={!hasResults} className="reports-action-btn" title="Opens report in new window — use Ctrl+P there to print">
                🖨 View & Print
              </button>
            ) : (
              <button type="button" style={styles.printBtn} onClick={handlePrint} disabled={!hasResults} className="reports-action-btn">
                🖨 Print Report
              </button>
            )}
            {printFeedback && <span style={styles.printFeedback}>{printFeedback}</span>}
            <span style={styles.shortcutHint}>Ctrl+P to print</span>
          </div>
        </>
      );
      })()}

      {!reportData && selectedOrder && <p style={styles.loading} className="no-print">Loading...</p>}
      {!selectedOrder && orders.length > 0 && (
        <div className="no-print" style={styles.hintWrap}>
          <p style={styles.hint}>Select an order above to view and print.</p>
          <button type="button" style={styles.actionBtn} onClick={() => navigate('/new-registration')}>New Registration</button>
        </div>
      )}
      {orders.length === 0 && (
        <div className="no-print" style={styles.hintWrap}>
          <p style={styles.hint}>No orders in this date range.</p>
          <button type="button" style={styles.actionBtn} onClick={() => navigate('/new-registration')}>New Registration</button>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { maxWidth: 780 },
  pageHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 20,
    marginBottom: 24,
    padding: '24px 28px',
    background: 'linear-gradient(135deg, #1e3a5f 0%, #0d7377 50%, #14a3a8 100%)',
    borderRadius: 16,
    color: '#fff',
    boxShadow: '0 8px 24px rgba(13,115,119,0.25)',
  },
  pageHeaderIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    background: 'rgba(255,255,255,0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 28,
  },
  title: { fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' },
  subtitle: { fontSize: 14, margin: '6px 0 0', opacity: 0.95 },
  card: {
    background: '#fff',
    padding: 24,
    borderRadius: 14,
    boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
    marginBottom: 20,
    border: '1px solid rgba(0,0,0,0.04)',
  },
  reportCardWrap: { display: 'flex', flexDirection: 'column', gap: 24, marginBottom: 24 },
  reportCard: {
    background: '#fff',
    padding: 24,
    borderRadius: 14,
    boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
    border: '1px solid #e8ecef',
  },
  presetCardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: 16,
    marginBottom: 20,
  },
  presetCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '20px 16px',
    borderRadius: 14,
    border: '2px solid #e2e8f0',
    background: '#fff',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    minHeight: 88,
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    color: '#475569',
  },
  presetCardActive: {
    background: 'linear-gradient(135deg, #0d7377 0%, #14a3a8 100%)',
    borderColor: 'transparent',
    color: '#fff',
    boxShadow: '0 4px 16px rgba(13,115,119,0.35)',
  },
  presetCardIcon: { fontSize: 28, lineHeight: 1 },
  presetCardLabel: { fontSize: 14, fontWeight: 600, letterSpacing: '0.3px' },
  filterRow: { display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 14 },
  filterCol: { minWidth: 120 },
  row: { marginBottom: 12 },
  label: { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' },
  input: { width: '100%', minWidth: 140, padding: '12px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, transition: 'border-color 0.2s' },
  searchInput: { width: '100%', minWidth: 180, padding: '12px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, transition: 'border-color 0.2s' },
  select: { width: '100%', padding: '12px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, transition: 'border-color 0.2s' },
  reportHeader: { marginTop: 0, marginBottom: 12, paddingBottom: 8 },
  patientCard: {
    background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    padding: '8px 12px',
    marginBottom: 10,
    borderLeft: '3px solid #0d7377',
  },
  patientCardMain: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 4, marginBottom: 6 },
  patientName: { fontSize: 14, fontWeight: 700, color: '#1e293b', letterSpacing: '0.2px' },
  patientId: { fontSize: 10, fontWeight: 600, color: '#0d7377', backgroundColor: 'rgba(13,115,119,0.12)', padding: '2px 6px', borderRadius: 4 },
  patientCardGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px 16px', marginBottom: 6 },
  patientItem: { display: 'flex', flexDirection: 'column', gap: 0 },
  patientLabel: { fontSize: 9, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.3px' },
  patientValue: { fontSize: 11, fontWeight: 500, color: '#334155' },
  patientAddress: { display: 'flex', flexDirection: 'column', gap: 0, paddingTop: 6, borderTop: '1px dashed #e2e8f0' },
  reportBarcodeSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    alignItems: 'center',
    paddingTop: 8,
    marginTop: 6,
    borderTop: '1px dashed #e2e8f0',
  },
  reportDate: { fontSize: 11, fontWeight: 600, color: '#0d7377', marginTop: 6, paddingTop: 4 },
  departmentTitle: { fontSize: 14, fontWeight: 700, marginTop: 10, marginBottom: 10, color: '#0d7377', borderBottom: '2px solid #0d7377', paddingBottom: 6, textAlign: 'center', letterSpacing: '0.5px', textTransform: 'uppercase' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: { textAlign: 'left', padding: '8px 12px', borderBottom: '2px solid #e2e8f0', fontWeight: 600, fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' },
  td: { padding: '8px 12px', borderBottom: '1px solid #f1f5f9' },
  footer: { marginTop: 16, paddingTop: 10, fontSize: 11, color: '#64748b' },
  footerReadBy: { marginBottom: 8 },
  footerClinical: { fontStyle: 'italic' },
  pageNumber: { marginTop: 8, fontSize: 11, color: '#64748b', textAlign: 'center' },
  actions: { display: 'flex', gap: 14, alignItems: 'center', marginTop: 20, padding: '18px 20px', background: 'linear-gradient(to right, #f8fafc 0%, #f1f5f9 100%)', borderRadius: 12, border: '1px solid #e2e8f0' },
  copiesSelect: { padding: '10px 16px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, background: '#fff' },
  previewBtn: { background: 'linear-gradient(135deg, #475569 0%, #64748b 100%)', color: '#fff', border: 'none', padding: '12px 22px', borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: 'pointer', boxShadow: '0 2px 8px rgba(71,85,105,0.25)' },
  printBtn: { background: 'linear-gradient(135deg, #0d7377 0%, #14a3a8 100%)', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 10, fontWeight: 600, fontSize: 15, cursor: 'pointer', boxShadow: '0 4px 14px rgba(13,115,119,0.35)' },
  printFeedback: { color: '#0d7377', fontWeight: 600, fontSize: 14 },
  shortcutHint: { fontSize: 12, color: '#94a3b8', marginLeft: 8 },
  resultCount: { fontSize: 12, color: '#64748b', marginLeft: 12 },
  loading: { color: '#64748b', padding: 20 },
  hint: { color: '#94a3b8', fontSize: 14, marginBottom: 12 },
  hintWrap: { padding: 20 },
  actionBtn: { padding: '10px 20px', borderRadius: 10, border: '2px solid #0d7377', background: '#fff', color: '#0d7377', fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' },
};
