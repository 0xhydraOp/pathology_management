import { APP_NAME, APP_VERSION } from '../utils/product';
import WorkspaceIcon from './WorkspaceIcon';
﻿import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';

/** HashRouter: real route is in `location.hash`, not `window.location.pathname`. */
function getHashRoutePath() {
  const raw = (window.location.hash || '').replace(/^#/, '');
  const pathOnly = raw.split('?')[0] || '/';
  return pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
}

const TITLE_MAP = {
  '/': 'Dashboard',
  '/new-registration': 'New Registration',
  '/result-entry': 'Enter Results & Print',
  '/reports': 'Reports',
  '/billing': 'Billing',
  '/referrals': 'Referrals',
  '/referrer-commission': 'Referrer Commission',
  '/rate-chart': 'Test Prices',
  '/settings': 'Settings',
};

function HotkeyHandler() {
  const navigate = useNavigate();
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.target?.closest?.('input, textarea, select')) {
        if (e.key === 'n') { e.preventDefault(); navigate('/new-registration'); }
        if (e.key === 'e') { e.preventDefault(); navigate('/result-entry'); }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate]);
  return null;
}

function TitleUpdater() {
  const location=useLocation();
  const [version,setVersion]=useState(APP_VERSION);
  useEffect(()=>{window.electronApp?.getVersion?.().then(setVersion).catch(()=>{});},[]);
  useEffect(()=>{const title=`${APP_NAME} — v${version} · ${TITLE_MAP[location.pathname] || 'Dashboard'}`;if(window.electronApp?.setTitle)window.electronApp.setTitle(title).catch(()=>{});else document.title=title;},[location.pathname,version]);
  return null;
}

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/new-registration', label: 'New Registration' },
  { to: '/result-entry', label: 'Enter Results & Print' },
  { to: '/reports', label: 'Reports' },
  { to: '/billing', label: 'Billing' },
  { to: '/referrals', label: 'Referrals' },
  { to: '/referrer-commission', label: 'Referrer' },
  { to: '/rate-chart', label: 'Test Prices' },
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
  const navigate = useNavigate();
  const [clock, setClock] = useState(formatDateTime());
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [labName, setLabName] = useState('MONDAL DIAGNOSTIC CENTRE');
  const [appVersion, setAppVersion] = useState(null);
  const dbReady = typeof window !== 'undefined' && !!window.db;

  useEffect(() => {
    if (window.db?.getLabConfig) {
      window.db.getLabConfig().then((c) => c?.name && setLabName(c.name)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (window.electronApp?.getVersion) {
      window.electronApp.getVersion().then((v) => v && setAppVersion(v)).catch(() => {});
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
      if (getHashRoutePath() === '/reports') {
        window.dispatchEvent(new CustomEvent('app-print-trigger'));
      } else {
        navigate('/reports');
      }
    });
  }, [navigate]);

  const toggleAlwaysOnTop = () => {
    const next = !alwaysOnTop;
    setAlwaysOnTop(next);
    window.electronApp?.setAlwaysOnTop(next)?.catch(()=>{});
  };

  return (
    <div data-ui="layout" style={styles.layout} className="app-layout">
      {!dbReady && (
        <div data-ui="dbBanner" style={styles.dbBanner} className="no-print">
          Database not available. Run <strong>npm run electron:dev</strong> (not npm run dev). Buttons will not work in browser-only mode.
        </div>
      )}
      <header data-ui="header" style={styles.header} className="no-print">
        <div data-ui="headerLeft" style={styles.headerLeft}>
          <img data-ui="logo" src={`${import.meta.env.BASE_URL}assets/logo.png`} alt="Logo" style={styles.logo} />
          <span data-ui="labName" style={styles.labName}>{APP_NAME} · v{appVersion || APP_VERSION}</span>
        </div>
        <div data-ui="headerRight" style={styles.headerRight}>
          <span data-ui="clock" style={styles.clock}>{clock}</span>
          {window.electronApp && (
            <button data-ui={['logoutBtn',(alwaysOnTop)?'pinActive':''].filter(Boolean).join(' ')}
              type="button"
              onClick={toggleAlwaysOnTop}
              style={{ ...styles.logoutBtn, ...(alwaysOnTop ? styles.pinActive : {}) }}
              title={alwaysOnTop ? 'Unpin from top' : 'Keep on top'}
            >
              {alwaysOnTop ? 'On top' : 'Pin'}
            </button>
          )}
          <button data-ui="logoutBtn"
            type="button"
            onClick={() => onLogout?.()}
            style={styles.logoutBtn}
            title="Logout"
          >
            Logout
          </button>
        </div>
      </header>

      <div data-ui="body" style={styles.body} className="layout-body">
        <aside aria-label="Primary navigation" data-ui="sidebar" style={styles.sidebar} className="no-print">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                ...styles.navItem,
                ...(isActive ? styles.navItemActive : {}),
              })}
            >
              <WorkspaceIcon name={item.to==='/'?'dashboard':({'/new-registration':'registration','/result-entry':'results','/reports':'reports','/billing':'billing','/referrals':'referrals','/referrer-commission':'referrals','/rate-chart':'prices','/settings':'settings'}[item.to])}/>{item.label}
            </NavLink>
          ))}
        </aside>

        <main data-ui="main" style={styles.main} className="main-content">
          <div className="workspace-content" data-ui="mainInner" style={styles.mainInner}>
            <HotkeyHandler />
            <TitleUpdater />
            <Outlet />
          </div>
          <footer data-ui="footer" style={styles.footer} className="no-print">
            {appVersion ? (
              <span data-ui="footerVersion" style={styles.footerVersion}>v{appVersion}</span>
            ) : null}
            Developed by <strong>Robiul Islam Molla</strong> · <a data-ui="footerLink" href="mailto:iamrobiul94@gmail.com" style={styles.footerLink}>iamrobiul94@gmail.com</a> · <a data-ui="footerLink" href="tel:+917029655755" style={styles.footerLink}>+91 7029655755</a>
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
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px 12px',
  },
  footerVersion: {
    fontWeight: 700,
    color: '#0d7377',
    fontSize: 12,
    padding: '2px 8px',
    borderRadius: 6,
    background: '#f0fdfa',
    border: '1px solid #99f6e4',
  },
  footerLink: {
    color: '#0d7377',
    textDecoration: 'none',
  },
};

