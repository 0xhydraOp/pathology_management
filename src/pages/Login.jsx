import { APP_TITLE } from '../utils/product';
import { useState, useEffect } from 'react';
import ActivationSetup from '../components/ActivationSetup';

export default function Login({ onLogin }) {
  const [setup, setSetup] = useState(false);
  const [checking,setChecking]=useState(true),[activation,setActivation]=useState(null),[recoveryRequired,setRecoveryRequired]=useState(false),[setupLicence,setSetupLicence]=useState(null);
  const [restricted,setRestricted]=useState(null);
  const [nextPassword,setNextPassword]=useState('');
  const [confirmation,setConfirmation]=useState('');
  async function checkSetup(){const credentials=await window.db.credentialState();setRecoveryRequired(Boolean(credentials.recoveryRequired));if(credentials.setupRequired&&!credentials.recoveryRequired){const onboarding=await window.licensing.getOnboardingState();if(!onboarding.freshInstallation)throw new Error('Installation setup requires review. Close the app and follow the recovery guide.');setSetupLicence(onboarding.licensing);setActivation(onboarding.licensing.allowed?null:onboarding.licensing);setSetup(Boolean(onboarding.licensing.allowed));}else{setSetup(false);setActivation(null);}}
  useEffect(()=>{let live=true;(async()=>{try{await checkSetup();const user=await window.db?.getSession?.();if(live&&user?.requiresPasswordChange)setRestricted(user);}catch(e){if(live)setError(e.message);}finally{if(live)setChecking(false);}})();return()=>{live=false;};},[]);
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
        if(setup || restricted){if(nextPassword!==confirmation)throw new Error('Passwords do not match');if(setup)await window.db.setupAdmin(username,nextPassword);else await window.db.changePassword(password,nextPassword);setSetup(false);setRestricted(null);setPassword('');setNextPassword('');setConfirmation('');setLoading(false);setError('Credentials saved. Sign in with your new password.');return;}
        user = await window.db.verifyUser(username, password);
      } else {
        setError('Database not available. Run with npm run electron:dev');
        setLoading(false);
        return;
      }
    } catch (err) {
      setError(err.message || 'Unable to sign in.');
      if(setup){try{await checkSetup();}catch{}}
      setLoading(false);
      return;
    }
    setLoading(false);
    if(user?.requiresPasswordChange){setRestricted(user);setPassword('');return;}
    if (user) {
      sessionStorage.setItem('lab_auth', '1');
      sessionStorage.setItem('lab_user', JSON.stringify({ username: user.username || username, displayName: user.displayName || username, role: user.role }));
      onLogin?.();
    } else {
      setError('Invalid username or password');
    }
  };

  if(checking)return <div className="login-page" data-ui="container"><div data-ui="card"><h1>{APP_TITLE}</h1><p role="status">Checking installation setup…</p></div></div>;
  if(activation)return <ActivationSetup status={activation} onActivated={checkSetup}/>;
  if(recoveryRequired)return <div className="login-page" data-ui="container"><div data-ui="card"><h1>{APP_TITLE}</h1><h2>Administrator recovery required</h2><p>Existing lab records were found without an administrator account. The database has not been replaced. Close the app, preserve the data directory and follow RECOVERY.md or restore a verified backup.</p></div></div>;
  return (
    <div data-ui="container" style={styles.container} className="login-page">
      <div data-ui="card" style={styles.card}>
        <div data-ui="logoWrap" style={styles.logoWrap}>
          <img data-ui="logo" src={`${import.meta.env.BASE_URL}assets/logo.png`} alt="Logo" style={styles.logo} />
        </div>
        <h1 data-ui="labName" style={styles.labName}>{APP_TITLE}</h1>
        {APP_TITLE.includes('-rc.')&&<p role="note">{setupLicence?.syntheticFixture?'Synthetic QA build. Use isolated test data only.':setup&&setupLicence?.allowed?'Activation verified. Complete local administrator setup before signing in.':'Release candidate. Confirm activation readiness before production lab use. Existing-record viewing, issued reprints and recovery remain available.'}</p>}
        <p data-ui="subtitle" style={styles.subtitle}>{setup?'Step 2 of 3 · Create your administrator account':restricted?'Replace the legacy default password':'Step 3 · Sign in to your lab workspace'}</p>
        {(setup||restricted)&&<p>Use a unique password of at least 12 characters. There is no default or hidden recovery account.</p>}

        <form data-ui="form" style={styles.form} onSubmit={handleSubmit}>
          {!restricted&&<div data-ui="field" style={styles.field}>
            <label data-ui="fieldLabel" htmlFor="login-field-1" style={styles.fieldLabel}>Username</label>
            <input data-ui="input" id="login-field-1"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              style={styles.input}
              autoComplete="username"
              disabled={loading}
            />
          </div>}
          {!setup&&<div data-ui="field" style={styles.field}>
            <label data-ui="fieldLabel" htmlFor="login-field-2" style={styles.fieldLabel}>Password</label>
            <input data-ui="input" id="login-field-2"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              style={styles.input}
              autoComplete="current-password"
              disabled={loading}
            />
          </div>}
          {(setup||restricted)&&<><div data-ui="field" style={styles.field}><label data-ui="fieldLabel" style={styles.fieldLabel} htmlFor="new-password">New password</label><input data-ui="input" style={styles.input} id="new-password" type="password" autoComplete="new-password" value={nextPassword} onChange={e=>setNextPassword(e.target.value)} required minLength={12}/></div><div data-ui="field" style={styles.field}><label data-ui="fieldLabel" style={styles.fieldLabel} htmlFor="confirm-password">Confirm new password</label><input data-ui="input" style={styles.input} id="confirm-password" type="password" autoComplete="new-password" value={confirmation} onChange={e=>setConfirmation(e.target.value)} required/></div></>}
          {error && (
            <div data-ui="errorWrap" style={styles.errorWrap}>
              <p data-ui="error" role="alert" style={styles.error}>{error}</p>
              <button data-ui="tryAgainBtn" type="button" style={styles.tryAgainBtn} onClick={() => setError('')}>Try again</button>
            </div>
          )}
          <button data-ui="btn" type="submit" style={styles.btn} disabled={loading} className="login-btn">
            {loading ? 'Saving...' : setup?'Create administrator':restricted?'Replace password':'Login'}
          </button>
        </form>
        {restricted&&<button data-ui="tryAgainBtn" type="button" onClick={async()=>{await window.db.logout();setRestricted(null);setPassword('');setNextPassword('');setConfirmation('');setError('');}}>Sign in with another account</button>}
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
    color: '#1e293b',
    backgroundColor: '#ffffff',
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
