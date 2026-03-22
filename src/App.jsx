import React, { useState, useEffect, lazy, Suspense } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { applyUiFontScale } from './utils/uiFontScale';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import NewRegistration from './pages/NewRegistration';
import ResultEntrySimple from './pages/ResultEntrySimple';
import Layout from './components/Layout';
import ToastProvider from './components/ToastProvider';

const Reports = lazy(() => import('./pages/Reports'));
const Billing = lazy(() => import('./pages/Billing'));
const Referrals = lazy(() => import('./pages/Referrals'));
const ReferrerCommission = lazy(() => import('./pages/ReferrerCommission'));
const RateChart = lazy(() => import('./pages/RateChart'));
const Settings = lazy(() => import('./pages/Settings'));

class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, maxWidth: 600, margin: 'auto' }}>
          <h2 style={{ color: '#c00', marginBottom: 12 }}>Something went wrong</h2>
          <pre style={{ background: '#f5f5f5', padding: 16, overflow: 'auto', fontSize: 12 }}>{this.state.error?.message}</pre>
          <p style={{ marginTop: 16, color: '#666' }}>Run the app with <code>npm run electron:dev</code> (not just <code>npm run dev</code>).</p>
          <button type="button" onClick={() => window.location.reload()} style={{ marginTop: 12, padding: '8px 16px', background: '#0d7377', color: '#fff', border: 'none', borderRadius: 8 }}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    setIsLoggedIn(sessionStorage.getItem('lab_auth') === '1');
  }, []);

  useEffect(() => {
    applyUiFontScale();
  }, []);

  const handleLogin = () => setIsLoggedIn(true);
  const handleLogout = () => {
    sessionStorage.removeItem('lab_auth');
    sessionStorage.removeItem('lab_user');
    setIsLoggedIn(false);
  };

  return (
    <ErrorBoundary>
      <ToastProvider>
        {/* HashRouter: required for Electron file:// so routes match after login */}
        <HashRouter>
          {!isLoggedIn ? (
            <Login onLogin={handleLogin} />
          ) : (
            <Routes>
              <Route path="/" element={<Layout onLogout={handleLogout} />}>
                <Route index element={<Dashboard />} />
                <Route path="new-registration" element={<NewRegistration />} />
                <Route path="result-entry" element={<ResultEntrySimple />} />
                <Route path="reports" element={<Suspense fallback={<div style={{ padding: 24, color: '#666' }}>Loading...</div>}><Reports /></Suspense>} />
                <Route path="billing" element={<Suspense fallback={<div style={{ padding: 24, color: '#666' }}>Loading...</div>}><Billing /></Suspense>} />
                <Route path="referrals" element={<Suspense fallback={<div style={{ padding: 24, color: '#666' }}>Loading...</div>}><Referrals /></Suspense>} />
                <Route path="referrer-commission" element={<Suspense fallback={<div style={{ padding: 24, color: '#666' }}>Loading...</div>}><ReferrerCommission /></Suspense>} />
                <Route path="rate-chart" element={<Suspense fallback={<div style={{ padding: 24, color: '#666' }}>Loading...</div>}><RateChart /></Suspense>} />
                <Route path="settings" element={<Suspense fallback={<div style={{ padding: 24, color: '#666' }}>Loading...</div>}><Settings /></Suspense>} />
              </Route>
            </Routes>
          )}
        </HashRouter>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
