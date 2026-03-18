import { useState } from 'react';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    let user = null;
    try {
      if (window.db?.verifyUser) {
        user = await window.db.verifyUser(username, password);
      } else {
        setError('Database not available. Run with npm run electron:dev');
        setLoading(false);
        return;
      }
    } catch (err) {
      setError('Database error. Please try again or restart the app.');
      setLoading(false);
      return;
    }
    setLoading(false);
    if (user) {
      sessionStorage.setItem('lab_auth', '1');
      sessionStorage.setItem('lab_user', JSON.stringify({ username: user.username || username, displayName: user.displayName || username }));
      onLogin?.();
    } else {
      setError('Invalid username or password');
    }
  };

  return (
    <div style={styles.container} className="login-page">
      <div style={styles.card}>
        <div style={styles.logoWrap}>
          <img src={`${import.meta.env.BASE_URL}assets/logo.png`} alt="Logo" style={styles.logo} />
        </div>
        <h1 style={styles.labName}>MONDAL DIAGNOSTIC CENTRE</h1>
        <p style={styles.subtitle}>Pathology Lab Management System</p>

        <form style={styles.form} onSubmit={handleSubmit}>
          <div style={styles.field}>
            <label style={styles.fieldLabel}>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              style={styles.input}
              autoComplete="username"
              disabled={loading}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.fieldLabel}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              style={styles.input}
              autoComplete="current-password"
              disabled={loading}
            />
          </div>
          {error && (
            <div style={styles.errorWrap}>
              <p style={styles.error}>{error}</p>
              <button type="button" style={styles.tryAgainBtn} onClick={() => setError('')}>Try again</button>
            </div>
          )}
          <button type="submit" style={styles.btn} disabled={loading} className="login-btn">
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(160deg, #0f2847 0%, #1e3a5f 35%, #0d7377 85%, #14a3a8 100%)',
    padding: 24,
    position: 'relative',
    overflow: 'hidden',
  },
  card: {
    background: '#fff',
    borderRadius: 20,
    boxShadow: '0 24px 64px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.08) inset',
    padding: 48,
    width: '100%',
    maxWidth: 420,
    textAlign: 'center',
    position: 'relative',
    zIndex: 1,
  },
  logoWrap: {
    marginBottom: 20,
  },
  logo: {
    height: 80,
    objectFit: 'contain',
  },
  labName: {
    fontSize: 22,
    fontWeight: 700,
    color: '#1e3a5f',
    marginBottom: 6,
    letterSpacing: '-0.3px',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 36,
    fontWeight: 500,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 22,
  },
  field: {
    textAlign: 'left',
  },
  fieldLabel: {
    color: '#334155',
    display: 'block',
    marginBottom: 6,
    fontSize: 13,
    fontWeight: 600,
  },
  input: {
    width: '100%',
    padding: '14px 18px',
    borderRadius: 12,
    border: '2px solid #e2e8f0',
    fontSize: 15,
    marginTop: 4,
    transition: 'border-color 0.2s, box-shadow 0.2s',
  },
  errorWrap: { marginBottom: 4 },
  error: {
    color: '#dc2626',
    fontSize: 13,
    margin: '0 0 10px',
    padding: '10px 14px',
    background: '#fef2f2',
    borderRadius: 10,
    border: '1px solid #fecaca',
  },
  tryAgainBtn: {
    padding: '8px 16px',
    borderRadius: 8,
    border: '1px solid #dc2626',
    background: '#fff',
    color: '#dc2626',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btn: {
    background: 'linear-gradient(180deg, #0d7377 0%, #0a5c5f 100%)',
    color: '#fff',
    border: 'none',
    padding: '16px',
    borderRadius: 12,
    fontSize: 16,
    fontWeight: 600,
    marginTop: 8,
    boxShadow: '0 4px 16px rgba(13,115,119,0.4)',
    transition: 'transform 0.15s, box-shadow 0.15s',
  },
};
