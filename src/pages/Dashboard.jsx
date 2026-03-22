import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { SQL_EXCLUDE_WALK_IN_REFERRALS } from '../utils/labRules';
import { formatOrderDateShortIN } from '../utils/dateDisplay';
import { keyboardActivateHandler } from '../utils/keyboardClick';

const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
];

function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDateRange(period) {
  const now = new Date();
  const today = toLocalDateStr(now);
  if (period === 'today') return [today, today];
  if (period === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    return [toLocalDateStr(d), today];
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return [toLocalDateStr(start), toLocalDateStr(end)];
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState('month');
  const [labName, setLabName] = useState('MONDAL DIAGNOSTIC CENTRE');

  useEffect(() => {
    if (window.db?.getLabConfig) {
      window.db.getLabConfig().then((c) => c?.name && setLabName(c.name)).catch(() => {});
    }
  }, []);
  const [todayPatients, setTodayPatients] = useState(0);
  const [periodPatients, setPeriodPatients] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [topReferrers, setTopReferrers] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const loadDataRequestRef = useRef(0);

  const loadData = useCallback(async () => {
    if (typeof window === 'undefined' || !window.db) {
      setLoading(false);
      return;
    }
    const reqId = ++loadDataRequestRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const [start, end] = getDateRange(period);
      const todayRange = getDateRange('today');

      const [todayCount, periodCount, pending, referrers, pendingList] = await Promise.all([
        window.db.get(
          `SELECT COUNT(*) as c FROM patients WHERE date(created_at) = ?`,
          [todayRange[0]]
        ),
        window.db.get(
          `SELECT COUNT(*) as c FROM patients WHERE date(created_at) >= ? AND date(created_at) <= ?`,
          [start, end]
        ),
        window.db.get(
          `SELECT COUNT(*) as c FROM orders WHERE status IN ('pending','partial')`,
          []
        ),
        window.db.all(
          `SELECT p.referred_by as name, COUNT(DISTINCT p.id) as count
           FROM patients p JOIN orders o ON o.patient_id = p.id
           WHERE p.referred_by IS NOT NULL AND p.referred_by != ''
           ${SQL_EXCLUDE_WALK_IN_REFERRALS}
           AND date(o.order_date) >= ? AND date(o.order_date) <= ?
           GROUP BY p.referred_by ORDER BY count DESC LIMIT 10`,
          [start, end]
        ),
        window.db.all(
          `SELECT o.id, o.order_date, p.patient_id, p.name
           FROM orders o JOIN patients p ON o.patient_id = p.id
           WHERE o.status IN ('pending','partial')
           ORDER BY o.order_date DESC, o.id DESC LIMIT 8`,
          []
        ),
      ]);

      if (reqId !== loadDataRequestRef.current) return;
      setTodayPatients(todayCount?.c ?? 0);
      setPeriodPatients(periodCount?.c ?? 0);
      setPendingCount(pending?.c ?? 0);
      setTopReferrers(referrers || []);
      setPendingOrders(pendingList || []);
      setLoadError(null);
    } catch (e) {
      if (reqId === loadDataRequestRef.current) {
        console.error(e);
        setLoadError('Could not load dashboard data. Check the database or restart the app.');
      }
    } finally {
      if (reqId === loadDataRequestRef.current) setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const maxRefCount = topReferrers.length > 0
    ? Math.max(...topReferrers.map((r) => r.count || 0), 1)
    : 1;
  const periodLabel = period === 'today' ? 'today' : period === 'week' ? 'this week' : 'this month';

  const quickActions = [
    { label: 'New Registration', desc: 'Register patient & add tests', path: '/new-registration', icon: '⊕', primary: true },
    { label: 'Enter Results & Print', desc: 'Enter test values & print report', path: '/result-entry', icon: '📋', primary: true },
    { label: 'Reports', desc: 'View & print reports', path: '/reports', icon: '📄', primary: true },
  ];

  const shortcuts = [
    { label: 'Billing', path: '/billing', desc: 'Payments & commission' },
    { label: 'Referrer', path: '/referrer-commission', desc: 'Adjust commission %' },
    { label: 'Test Prices', path: '/rate-chart', desc: 'Edit test rates' },
    { label: 'Referrals', path: '/referrals', desc: 'Referrer summary' },
    { label: 'Settings', path: '/settings', desc: 'Lab configuration' },
  ];

  return (
    <div style={styles.container}>
      <div style={styles.welcome}>
        <h1 style={styles.title}>{getGreeting()}, welcome to {labName}</h1>
        <p style={styles.subtitle}>Quick access to your daily lab workflow</p>
      </div>

      <div style={styles.toolbar}>
        <div style={styles.periodRow}>
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              style={{ ...styles.periodBtn, ...(period === p.id ? styles.periodBtnActive : {}) }}
              onClick={() => setPeriod(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button type="button" style={styles.refreshBtn} onClick={loadData} disabled={loading}>
          ↻ Refresh
        </button>
      </div>

      {loadError && (
        <div style={styles.errorBanner} role="alert">
          {loadError}
          <button type="button" style={styles.errorRetry} onClick={() => loadData()}>
            Retry
          </button>
        </div>
      )}

      <div style={styles.quickActions}>
        {quickActions.map((action) => (
          <div
            key={action.path}
            role="button"
            tabIndex={0}
            className={`dashboard-card-hover ${action.primary ? 'dashboard-card-primary' : ''}`}
            style={{ ...styles.actionCard, ...(action.primary ? styles.actionCardPrimary : {}) }}
            onClick={() => navigate(action.path)}
            onKeyDown={keyboardActivateHandler(() => navigate(action.path))}
          >
            <div style={styles.actionIcon}>{action.icon}</div>
            <div style={styles.actionContent}>
              <div style={styles.actionLabel}>{action.label}</div>
              <div style={styles.actionDesc}>{action.desc}</div>
            </div>
            <span style={styles.actionArrow}>→</span>
          </div>
        ))}
      </div>

      <p style={styles.shortcutHint}>Ctrl+N New Reg · Ctrl+E Results · Ctrl+P Reports</p>

      <div style={styles.statsSection}>
        <div
          className="dashboard-card-hover"
          role="button"
          tabIndex={0}
          style={styles.statCard}
          onClick={() => navigate('/new-registration')}
          onKeyDown={keyboardActivateHandler(() => navigate('/new-registration'))}
        >
          <div style={styles.statIcon}>👥</div>
          <div style={styles.statContent}>
            <div style={styles.statValue}>
              {loading ? <span className="dashboard-skeleton" style={styles.skeletonNum} /> : periodPatients}
            </div>
            <div style={styles.statLabel}>Patients {periodLabel}</div>
          </div>
        </div>

        <div
          className="dashboard-card-hover"
          role="button"
          tabIndex={0}
          style={styles.statCard}
          onClick={() => navigate('/new-registration')}
          onKeyDown={keyboardActivateHandler(() => navigate('/new-registration'))}
        >
          <div style={styles.statIcon}>📅</div>
          <div style={styles.statContent}>
            <div style={styles.statValue}>
              {loading ? <span className="dashboard-skeleton" style={styles.skeletonNum} /> : todayPatients}
            </div>
            <div style={styles.statLabel}>Today's patients</div>
          </div>
        </div>

        <div
          className="dashboard-card-hover"
          role="button"
          tabIndex={0}
          style={styles.statCard}
          onClick={() => navigate('/result-entry')}
          onKeyDown={keyboardActivateHandler(() => navigate('/result-entry'))}
        >
          <div style={styles.statIcon}>⏳</div>
          <div style={styles.statContent}>
            <div style={{ ...styles.statValue, color: pendingCount > 0 ? '#c45c26' : '#0d7377' }}>
              {loading ? <span className="dashboard-skeleton" style={styles.skeletonNum} /> : pendingCount}
            </div>
            <div style={styles.statLabel}>Pending reports</div>
          </div>
        </div>
      </div>

      <div style={styles.twoCol}>
        <div style={styles.pendingCard}>
          <div style={styles.pendingHeader}>
            <span style={styles.pendingTitle}>Orders awaiting results</span>
            <button type="button" style={styles.viewAllBtn} onClick={() => navigate('/result-entry')}>
              Enter results →
            </button>
          </div>
          <div style={styles.pendingList}>
            {pendingOrders.length === 0 && !loading && (
              <div style={styles.emptyWrap}>
                <div style={styles.empty}>No pending orders</div>
                <button type="button" style={styles.emptyBtn} onClick={() => navigate('/new-registration')}>Register patient</button>
              </div>
            )}
            {pendingOrders.map((o) => (
              <div
                key={o.id}
                role="button"
                tabIndex={0}
                className="dashboard-referrer-row"
                style={styles.pendingRow}
                title="Click to enter results"
                onClick={() => navigate(`/result-entry?order=${o.id}`)}
                onKeyDown={keyboardActivateHandler(() => navigate(`/result-entry?order=${o.id}`))}
              >
                <span style={styles.pendingId}>#{o.id}</span>
                <span style={styles.pendingName}>{o.name || '—'}</span>
                <span style={styles.pendingDate}>
                  {formatOrderDateShortIN(o.order_date)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={styles.referrersCard}>
          <div style={styles.referrersHeader}>
            <span style={styles.referrersTitle}>Top Referrers</span>
            <button type="button" style={styles.viewAllBtn} onClick={() => navigate('/referrals')}>
              View all →
            </button>
          </div>
          <div style={styles.referrerList}>
            {loading && (
              <>
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} style={styles.skeletonRefRow}>
                    <span className="dashboard-skeleton" style={styles.skeletonCircle} />
                    <span className="dashboard-skeleton" style={{ ...styles.skeletonLine, flex: 1 }} />
                    <span className="dashboard-skeleton" style={{ ...styles.skeletonLine, width: 40 }} />
                  </div>
                ))}
              </>
            )}
            {!loading && topReferrers.length === 0 && (
              <div style={styles.emptyWrap}>
                <div style={styles.empty}>No referral data</div>
                <button type="button" style={styles.emptyBtn} onClick={() => navigate('/new-registration')}>Register patient</button>
              </div>
            )}
            {!loading && topReferrers.slice(0, 5).map((r, i) => (
              <div
                key={`${r.name || ''}-${i}`}
                role="button"
                tabIndex={0}
                className="dashboard-referrer-row"
                style={styles.referrerRow}
                onClick={() => navigate('/referrals')}
                onKeyDown={keyboardActivateHandler(() => navigate('/referrals'))}
              >
                <span style={styles.refRank}>{i + 1}</span>
                <span style={styles.refName}>{r.name || '—'}</span>
                <div style={styles.refBarTrack}>
                  <div style={{ ...styles.refBarFill, width: `${(r.count / maxRefCount) * 100}%` }} />
                </div>
                <span style={styles.refCount}>{r.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={styles.shortcutsSection}>
        <div style={styles.shortcutsTitle}>Quick Links</div>
        <div style={styles.shortcutsGrid}>
          {shortcuts.map((s) => (
            <div
              key={s.path}
              role="button"
              tabIndex={0}
              className="dashboard-card-hover"
              style={styles.shortcutCard}
              onClick={() => navigate(s.path)}
              onKeyDown={keyboardActivateHandler(() => navigate(s.path))}
            >
              <span style={styles.shortcutLabel}>{s.label}</span>
              <span style={styles.shortcutDesc}>{s.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: { maxWidth: 920, paddingBottom: 40 },
  welcome: { marginBottom: 20 },
  title: { fontSize: 24, fontWeight: 700, color: '#1e3a5f', marginBottom: 6 },
  subtitle: { fontSize: 15, color: '#666', margin: 0 },
  toolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  periodRow: { display: 'flex', gap: 8 },
  periodBtn: { padding: '8px 16px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer', color: '#555' },
  periodBtnActive: { background: '#0d7377', color: '#fff', borderColor: '#0d7377' },
  refreshBtn: { padding: '8px 16px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', fontSize: 14, cursor: 'pointer', color: '#555' },
  errorBanner: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    padding: '12px 16px',
    marginBottom: 16,
    background: '#fff3cd',
    border: '1px solid #ffc107',
    borderRadius: 10,
    color: '#856404',
    fontSize: 14,
  },
  errorRetry: {
    padding: '6px 14px',
    borderRadius: 8,
    border: '1px solid #856404',
    background: '#fff',
    color: '#856404',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: 13,
  },
  quickActions: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 12 },
  shortcutHint: { fontSize: 12, color: '#999', marginBottom: 24 },
  actionCard: { background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid #eee', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s' },
  actionCardPrimary: { background: 'linear-gradient(135deg, #0d7377 0%, #14a3a8 100%)', border: 'none', color: '#fff', boxShadow: '0 4px 16px rgba(13,115,119,0.3)' },
  actionIcon: { fontSize: 28, width: 48, height: 48, borderRadius: 12, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  actionContent: { flex: 1 },
  actionLabel: { fontSize: 16, fontWeight: 700, marginBottom: 2 },
  actionDesc: { fontSize: 12, opacity: 0.9 },
  actionArrow: { fontSize: 18, fontWeight: 600, opacity: 0.8 },
  statsSection: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 },
  statCard: { background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid #eee', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s' },
  statIcon: { fontSize: 32, width: 52, height: 52, borderRadius: 12, background: 'linear-gradient(135deg, #e8f5f5 0%, #d4edee 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  statContent: {},
  statValue: { fontSize: 26, fontWeight: 800, color: '#0d7377', lineHeight: 1.2 },
  statLabel: { fontSize: 13, color: '#555', marginTop: 4 },
  twoCol: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, marginBottom: 24 },
  pendingCard: { background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid #eee' },
  pendingHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  pendingTitle: { fontSize: 16, fontWeight: 700, color: '#1e3a5f' },
  viewAllBtn: { background: 'none', border: 'none', color: '#0d7377', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '4px 0' },
  pendingList: { display: 'flex', flexDirection: 'column', gap: 6 },
  pendingRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 14 },
  pendingId: { fontWeight: 600, color: '#666', minWidth: 36 },
  pendingName: { flex: 1, fontWeight: 500, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  pendingDate: { fontSize: 12, color: '#888' },
  referrersCard: { background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid #eee' },
  referrersHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  referrersTitle: { fontSize: 16, fontWeight: 700, color: '#1e3a5f' },
  referrerList: { display: 'flex', flexDirection: 'column', gap: 8 },
  referrerRow: { display: 'grid', gridTemplateColumns: '28px 1fr minmax(60px, 100px) 32px', alignItems: 'center', gap: 10, padding: '8px 12px', margin: '0 -12px', borderRadius: 8, cursor: 'pointer', fontSize: 14 },
  refRank: { width: 22, height: 22, borderRadius: 6, background: '#e8ecef', color: '#666', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  refBarTrack: { height: 6, background: '#e8ecef', borderRadius: 4, overflow: 'hidden', minWidth: 50 },
  refBarFill: { height: '100%', background: 'linear-gradient(90deg, #0d7377 0%, #14a3a8 100%)', borderRadius: 4, transition: 'width 0.3s ease' },
  refName: { fontWeight: 500, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  refCount: { fontWeight: 700, color: '#0d7377', minWidth: 24, textAlign: 'right' },
  empty: { color: '#999', fontSize: 14, marginBottom: 12 },
  emptyWrap: { padding: 16, textAlign: 'center' },
  emptyBtn: { padding: '10px 20px', borderRadius: 8, border: '1px solid #0d7377', background: '#fff', color: '#0d7377', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  shortcutsSection: { marginTop: 8 },
  shortcutsTitle: { fontSize: 14, fontWeight: 600, color: '#666', marginBottom: 12 },
  shortcutsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 },
  shortcutCard: { background: '#fff', borderRadius: 10, padding: '14px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', border: '1px solid #eee', cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s' },
  shortcutLabel: { display: 'block', fontSize: 14, fontWeight: 600, color: '#1e3a5f', marginBottom: 2 },
  shortcutDesc: { fontSize: 12, color: '#888' },
  skeletonNum: { display: 'inline-block', width: 36, height: 28, borderRadius: 6 },
  skeletonLine: { display: 'inline-block', height: 14, borderRadius: 4, minWidth: 60 },
  skeletonCircle: { display: 'inline-block', width: 22, height: 22, borderRadius: 6 },
  skeletonRow: { display: 'flex', gap: 12, padding: '10px 12px', alignItems: 'center' },
  skeletonRefRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px' },
};
