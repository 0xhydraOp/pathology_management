import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';

const TITLE_MAP = {
  '/': 'Dashboard',
  '/new-registration': 'New Registration',
  '/result-entry': 'Enter Results & Print',
  '/reports': 'Reports',
  '/billing': 'Billing',
  '/referrals': 'Referrals',
  '/settings': 'Settings',
};

function HotkeyHandler() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.target?.closest?.('input, textarea, select')) {
        if (e.key === 'n') { e.preventDefault(); navigate('/new-registration'); }
        if (e.key === 'p') {
          e.preventDefault();
          if (location.pathname === '/reports') {
            window.dispatchEvent(new CustomEvent('app-print-trigger'));
          } else {
            navigate('/reports');
          }
        }
        if (e.key === 'e') { e.preventDefault(); navigate('/result-entry'); }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, location.pathname]);
  return null;
}

function TitleUpdater() {
  const location = useLocation();
  const [labName, setLabName] = useState('MONDAL DIAGNOSTIC CENTRE');
  useEffect(() => {
    if (window.db?.getLabConfig) {
      window.db.getLabConfig().then((c) => c?.name && setLabName(c.name)).catch(() => {});
    }
  }, []);
  useEffect(() => {
    const page = TITLE_MAP[location.pathname] || 'MONDAL DIAGNOSTIC CENTRE';
    const title = `${labName} - ${page}`;
    if (window.electronApp?.setTitle) window.electronApp.setTitle(title);
    else document.title = title;
  }, [location.pathname, labName]);
  return null;
}

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/new-registration', label: 'New Registration' },
  { to: '/result-entry', label: 'Enter Results & Print' },
  { to: '/reports', label: 'Reports' },
  { to: '/billing', label: 'Billing' },
  { to: '/referrals', label: 'Referrals' },
  { to: '/settings', label: 'Settings' },
];

function formatDateTime() {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${day}-${month}-${year} ${h}:${m}:${s}`;
}

export default function Layout({ children, onLogout }) {
  const [clock, setClock] = useState(formatDateTime());
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [labName, setLabName] = useState('MONDAL DIAGNOSTIC CENTRE');
  const dbReady = typeof window !== 'undefined' && !!window.db;

  useEffect(() => {
    if (window.db?.getLabConfig) {
      window.db.getLabConfig().then((c) => c?.name && setLabName(c.name)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => setClock(formatDateTime()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!window.electronApp?.getAlwaysOnTop) return;
    window.electronApp.getAlwaysOnTop().then(setAlwaysOnTop).catch(() => {});
  }, []);

  useEffect(() => {
    if (!window.electronApp?.onPrintTrigger) return;
    return window.electronApp.onPrintTrigger(() => {
      if (window.location.pathname === '/reports') {
        window.dispatchEvent(new CustomEvent('app-print-trigger'));
      }
    });
  }, []);

  const toggleAlwaysOnTop = () => {
    const next = !alwaysOnTop;
    setAlwaysOnTop(next);
    window.electronApp?.setAlwaysOnTop(next);
  };

  return (
    <div style={styles.layout} className="app-layout">
      {!dbReady && (
        <div style={styles.dbBanner} className="no-print">
          Database not available. Run <strong>npm run electron:dev</strong> (not npm run dev). Buttons will not work in browser-only mode.
        </div>
      )}
      <header style={styles.header} className="no-print">
        <div style={styles.headerLeft}>
          <img src={`${import.meta.env.BASE_URL}assets/logo.png`} alt="Logo" style={styles.logo} />
          <span style={styles.labName}>{labName}</span>
        </div>
        <div style={styles.headerRight}>
          <span style={styles.clock}>{clock}</span>
          {window.electronApp && (
            <button
              type="button"
              onClick={toggleAlwaysOnTop}
              style={{ ...styles.logoutBtn, ...(alwaysOnTop ? styles.pinActive : {}) }}
              title={alwaysOnTop ? 'Unpin from top' : 'Keep on top'}
            >
              {alwaysOnTop ? '📌 On top' : 'Pin'}
            </button>
          )}
          <button
            type="button"
            onClick={() => onLogout?.()}
            style={styles.logoutBtn}
            title="Logout"
          >
            Logout
          </button>
        </div>
      </header>

      <div style={styles.body} className="layout-body">
        <aside style={styles.sidebar} className="no-print">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                ...styles.navItem,
                ...(isActive ? styles.navItemActive : {}),
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </aside>

        <main style={styles.main} className="main-content">
          <div style={styles.mainInner}>
            <HotkeyHandler />
            <TitleUpdater />
            <Outlet />
          </div>
          <footer style={styles.footer} className="no-print">
            Developed by <strong>Robiul Islam Molla</strong> · <a href="mailto:iamrobiul94@gmail.com" style={styles.footerLink}>iamrobiul94@gmail.com</a> · <a href="tel:+917029655755" style={styles.footerLink}>+91 7029655755</a>
          </footer>
        </main>
      </div>
    </div>
  );
}

const styles = {
  layout: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 24px',
    background: '#1e3a5f',
    color: '#fff',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  logo: {
    height: 48,
    objectFit: 'contain',
  },
  labName: {
    fontSize: 18,
    fontWeight: 600,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  clock: {
    fontSize: 14,
    fontFamily: 'monospace',
  },
  logoutBtn: {
    background: 'rgba(255,255,255,0.2)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.4)',
    padding: '6px 14px',
    borderRadius: 6,
    fontSize: 13,
    cursor: 'pointer',
  },
  pinActive: {
    background: 'rgba(13,115,119,0.6)',
    borderColor: 'rgba(255,255,255,0.6)',
  },
  body: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  sidebar: {
    width: 200,
    background: '#fff',
    padding: 16,
    boxShadow: '1px 0 3px rgba(0,0,0,0.08)',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  navItem: {
    padding: '12px 16px',
    borderRadius: 8,
    textDecoration: 'none',
    color: '#333',
    fontSize: 14,
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  navItemActive: {
    background: '#0d7377',
    color: '#fff',
    fontWeight: 600,
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: '#f5f5f5',
  },
  mainInner: {
    flex: 1,
    overflow: 'auto',
    padding: 24,
  },
  dbBanner: {
    background: '#fff3cd',
    color: '#856404',
    padding: '10px 24px',
    fontSize: 13,
    textAlign: 'center',
  },
  footer: {
    padding: '12px 24px',
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    borderTop: '1px solid #e2e8f0',
    background: '#fff',
    flexShrink: 0,
  },
  footerLink: {
    color: '#0d7377',
    textDecoration: 'none',
  },
};
