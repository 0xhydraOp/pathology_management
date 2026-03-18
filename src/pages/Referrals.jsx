import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const PERIODS = [
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
    start = new Date(0);
    end = new Date();
  }
  return [toLocalDateStr(start), toLocalDateStr(end)];
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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState('');
  const [exportFeedback, setExportFeedback] = useState('');
  const [selectedReferrer, setSelectedReferrer] = useState(null);
  const [patientList, setPatientList] = useState([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [reportReferrer, setReportReferrer] = useState(null);
  const [reportFilter, setReportFilter] = useState('month');
  const [reportFrom, setReportFrom] = useState(weekAgo);
  const [reportTo, setReportTo] = useState(today);
  const [reportData, setReportData] = useState({ patients: [], total: 0 });
  const [loadingReport, setLoadingReport] = useState(false);

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
           AND date(o.order_date) = ?
           GROUP BY p.referred_by`,
          [todayStr]
        ),
        window.db.all(
          `SELECT p.referred_by as name, COUNT(DISTINCT p.id) as count
           FROM patients p JOIN orders o ON o.patient_id = p.id
           WHERE p.referred_by IS NOT NULL AND p.referred_by != ''
           AND date(o.order_date) >= ? AND date(o.order_date) <= ?
           GROUP BY p.referred_by`,
          [weekStart, weekEnd]
        ),
        window.db.all(
          `SELECT p.referred_by as name, COUNT(DISTINCT p.id) as count
           FROM patients p JOIN orders o ON o.patient_id = p.id
           WHERE p.referred_by IS NOT NULL AND p.referred_by != ''
           AND date(o.order_date) >= ? AND date(o.order_date) <= ?
           GROUP BY p.referred_by`,
          [monthStart, monthEnd]
        ),
        window.db.all(
          `SELECT p.referred_by as name, COUNT(DISTINCT p.id) as count
           FROM patients p JOIN orders o ON o.patient_id = p.id
           WHERE p.referred_by IS NOT NULL AND p.referred_by != ''
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
    } catch (e) {
      if (reqId === loadReferrersRequestRef.current) {
        console.error(e);
        setReferrers([]);
        setReferrerPerformance({});
        setLoadError(e?.message || 'Failed to load referral data');
      }
    } finally {
      if (reqId === loadReferrersRequestRef.current) setLoading(false);
    }
  }, [filter, customFrom, customTo]);

  useEffect(() => {
    loadReferrers();
  }, [loadReferrers]);

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

  const loadReportData = useCallback(async () => {
    if (!window.db || !reportReferrer) return;
    setLoadingReport(true);
    try {
      const [start, end] = getDateRange(reportFilter, reportFrom, reportTo);
      const rows = await window.db.all(
        `SELECT p.patient_id, p.name, p.age, p.sex, o.order_date
         FROM patients p JOIN orders o ON o.patient_id = p.id
         WHERE p.referred_by = ? AND date(o.order_date) >= ? AND date(o.order_date) <= ?
         ORDER BY o.order_date DESC`,
        [reportReferrer, start, end]
      );
      setReportData({ patients: rows || [], total: (rows || []).length });
    } catch (e) {
      console.error(e);
      setReportData({ patients: [], total: 0 });
    } finally {
      setLoadingReport(false);
    }
  }, [reportReferrer, reportFilter, reportFrom, reportTo]);

  useEffect(() => {
    if (reportReferrer) loadReportData();
  }, [reportReferrer, reportFilter, reportFrom, reportTo, loadReportData]);

  const openReportModal = (referrerName) => {
    setSelectedReferrer(null);
    setReportReferrer(referrerName);
    setReportFilter('month');
    const now = new Date();
    const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
    setReportFrom(toLocalDateStr(mStart));
    setReportTo(today);
  };

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

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Referral Report</h1>
        <p style={styles.subtitle}>
          Track doctors and clinics who refer patients to your lab
        </p>
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
                <p style={styles.clickHint}>Click to view patients · Double-click for performance report</p>
                <div style={styles.referrerCardGrid}>
                {filteredReferrers.map((r, i) => {
                  const rank = referrers.findIndex((x) => x.name === r.name);
                  const badge = getRankBadge(rank);
                  const pct = totalPatients ? ((r.count / totalPatients) * 100).toFixed(1) : '0';
                  const perf = referrerPerformance[r.name] || {};
                  return (
                    <div
                      key={i}
                      style={styles.referrerCard}
                      className="referrer-card-clickable"
                      onClick={() => {
                        if (rowClickTimeoutRef.current) clearTimeout(rowClickTimeoutRef.current);
                        rowClickTimeoutRef.current = setTimeout(() => {
                          rowClickTimeoutRef.current = null;
                          setReportReferrer(null);
                          loadPatientsForReferrer(r.name);
                        }, 250);
                      }}
                      onDoubleClick={() => {
                        if (rowClickTimeoutRef.current) {
                          clearTimeout(rowClickTimeoutRef.current);
                          rowClickTimeoutRef.current = null;
                        }
                        openReportModal(r.name);
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

      {reportReferrer && (
        <div style={styles.modalOverlay} onClick={() => setReportReferrer(null)}>
          <div style={styles.reportModal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.reportModalHeader}>
              <h3 style={styles.reportModalTitle}>Performance Report — {reportReferrer}</h3>
              <button style={styles.modalClose} onClick={() => setReportReferrer(null)}>×</button>
            </div>
            <div style={styles.reportFilters}>
              {['week', 'month', 'lastmonth', 'custom'].map((pid) => (
                <button
                  key={pid}
                  type="button"
                  style={{ ...styles.reportPeriodBtn, ...(reportFilter === pid ? styles.periodBtnActive : {}) }}
                  onClick={() => setReportFilter(pid)}
                >
                  {pid === 'week' ? 'Week' : pid === 'month' ? 'This Month' : pid === 'lastmonth' ? 'Last Month' : 'From–To Date'}
                </button>
              ))}
              {reportFilter === 'custom' && (
                <div style={styles.reportDateRow}>
                  <input type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} style={styles.reportDateInput} />
                  <span style={{ color: '#999' }}>→</span>
                  <input type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)} style={styles.reportDateInput} />
                </div>
              )}
            </div>
            {loadingReport ? (
              <div style={styles.modalLoading}>Loading...</div>
            ) : (
              <div style={styles.reportBody}>
                <div style={styles.reportSummary}>
                  <span style={styles.reportTotal}>{reportData.total}</span> patients in selected period
                </div>
                {reportData.patients.length > 0 ? (
                  <div style={styles.reportTableWrap}>
                    <div style={styles.patientRowHeader}>
                      <span>Patient ID</span>
                      <span>Name</span>
                      <span>Age</span>
                      <span>Sex</span>
                      <span>Order Date</span>
                    </div>
                    {reportData.patients.map((pt, idx) => (
                      <div key={idx} style={styles.patientRow}>
                        <span>{pt.patient_id || '—'}</span>
                        <span>{pt.name || '—'}</span>
                        <span>{pt.age ?? '—'}</span>
                        <span>{pt.sex || '—'}</span>
                        <span>{formatDate(pt.order_date)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={styles.modalEmpty}>No patients in this period</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {selectedReferrer && (
        <div style={styles.modalOverlay} onClick={() => setSelectedReferrer(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Patients referred by {selectedReferrer}</h3>
              <button style={styles.modalClose} onClick={() => setSelectedReferrer(null)}>×</button>
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
    maxWidth: 720,
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
};
