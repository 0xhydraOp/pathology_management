import React, { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import NewRegistration from './pages/NewRegistration';
import ResultEntrySimple from './pages/ResultEntrySimple';
import Layout from './components/Layout';

const Reports = lazy(() => import('./pages/Reports'));
const Referrals = lazy(() => import('./pages/Referrals'));
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
          <button onClick={() => window.location.reload()} style={{ marginTop: 12, padding: '8px 16px', background: '#0d7377', color: '#fff', border: 'none', borderRadius: 8 }}>Reload</button>
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

  const handleLogin = () => setIsLoggedIn(true);
  const handleLogout = () => {
    sessionStorage.removeItem('lab_auth');
    sessionStorage.removeItem('lab_user');
    setIsLoggedIn(false);
  };

  return (
    <ErrorBoundary>
      <BrowserRouter>
        {!isLoggedIn ? (
          <Login onLogin={handleLogin} />
        ) : (
          <Routes>
            <Route path="/" element={<Layout onLogout={handleLogout} />}>
              <Route index element={<Dashboard />} />
              <Route path="new-registration" element={<NewRegistration />} />
              <Route path="result-entry" element={<ResultEntrySimple />} />
              <Route path="reports" element={<Suspense fallback={<div style={{ padding: 24, color: '#666' }}>Loading...</div>}><Reports /></Suspense>} />
              <Route path="referrals" element={<Suspense fallback={<div style={{ padding: 24, color: '#666' }}>Loading...</div>}><Referrals /></Suspense>} />
              <Route path="settings" element={<Suspense fallback={<div style={{ padding: 24, color: '#666' }}>Loading...</div>}><Settings /></Suspense>} />
            </Route>
          </Routes>
        )}
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
