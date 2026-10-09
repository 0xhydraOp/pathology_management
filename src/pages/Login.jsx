import { APP_TITLE } from '../utils/product';
import { useEffect, useRef, useState } from 'react';
import './Login.css';

const INVALID_LOGIN = 'Username or password is incorrect.';
const RETRY_LOGIN = 'Too many sign-in attempts. Wait 30 seconds, then try again.';
const RecoveryGuide = () => <><p>Ask this lab’s administrator for help. There is no online password reset.</p><p>If you are the administrator, close the app and open <strong>Recover Administrator.cmd</strong> in its installation folder. Follow <strong>RECOVERY.md</strong>. Recovery requires access to the local data folder; it does not create a new account or replace lab records.</p><p>Keep a verified backup. Do not delete <strong>lab.db</strong>.</p></>;

export default function Login({ onLogin }) {
  const [setup, setSetup] = useState(false), [checking, setChecking] = useState(true);
  const [recoveryRequired, setRecoveryRequired] = useState(false), [checkFailed, setCheckFailed] = useState(false);
  const [restricted, setRestricted] = useState(null), [loading, setLoading] = useState(false);
  const [username, setUsername] = useState(''), [password, setPassword] = useState('');
  const [nextPassword, setNextPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState({}), [notice, setNotice] = useState('');
  const [visible, setVisible] = useState({}), [capsLock, setCapsLock] = useState(false);
  const busy = useRef(false), live = useRef(true), form = useRef(null);
  const changing = setup || Boolean(restricted);
  const clearSecrets = () => { setPassword(''); setNextPassword(''); setConfirmation(''); setVisible({}); setCapsLock(false); };
  const focus = name => requestAnimationFrame(() => { if (live.current) form.current?.elements.namedItem(name)?.focus(); });
  async function checkSetup() {
    const state = await window.db.credentialState();
    if (live.current) { setRecoveryRequired(Boolean(state.recoveryRequired)); setSetup(Boolean(state.setupRequired && !state.recoveryRequired)); }
    return state;
  }
  async function inspect() {
    setChecking(true); setCheckFailed(false);
    try {
      await checkSetup();
      const user = await window.db.getSession();
      if (live.current && user?.requiresPasswordChange) setRestricted(user);
    } catch { if (live.current) setCheckFailed(true); }
    finally { if (live.current) setChecking(false); }
  }
  useEffect(() => { live.current = true; void inspect(); return () => { live.current = false; }; }, []);
  useEffect(() => { if (!checking && !checkFailed && !recoveryRequired) focus(restricted ? 'password' : 'username'); }, [checking, checkFailed, recoveryRequired, restricted]);
  const fieldError = (name, text) => { setErrors({ [name]: text }); focus(name); };
  const edit = (name, setter) => event => { setter(event.target.value); setErrors(previous => ({ ...previous, [name]: undefined, form: undefined })); setNotice(''); };

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy.current) return;
    setErrors({}); setNotice('');
    if (!restricted && !username) return fieldError('username', 'Enter your username.');
    if (setup && !/^[A-Za-z0-9._-]{1,100}$/.test(username)) return fieldError('username', 'Use 1–100 letters, numbers, dots, underscores or hyphens.');
    if (!setup && !password) return fieldError('password', 'Enter your password.');
    if (changing && (nextPassword.length < 12 || nextPassword.length > 1024)) return fieldError('newPassword', 'Use a unique password of 12–1024 characters.');
    if (changing && nextPassword !== confirmation) return fieldError('confirmation', 'Passwords do not match. Enter the same new password again.');
    busy.current = true; setLoading(true);
    try {
      if (changing) {
        if (setup) await window.db.setupAdmin(username, nextPassword);
        else await window.db.changePassword(password, nextPassword);
        if (!live.current) return;
        clearSecrets(); setSetup(false); setRestricted(null);
        setNotice('Credentials saved. Sign in with your new password.'); focus('password');
      } else {
        const user = await window.db.verifyUser(username, password);
        if (!live.current) return;
        clearSecrets();
        if (!user) return fieldError('password', INVALID_LOGIN);
        if (user.requiresPasswordChange) { setRestricted(user); return; }
        sessionStorage.setItem('lab_auth', '1');
        sessionStorage.setItem('lab_user', JSON.stringify({ username: user.username, displayName: user.displayName || user.username, role: user.role }));
        onLogin?.();
      }
    } catch (error) {
      if (!live.current) return;
      // IPC messages may include Electron wrappers. Only map known safe errors;
      // never render arbitrary database paths, exception contents or input values.
      const text = String(error?.message || '');
      if (/Too many sign-in attempts/.test(text)) { setPassword(''); fieldError('password', RETRY_LOGIN); }
      else if (setup && /Invalid username/.test(text)) fieldError('username', 'Use 1–100 letters, numbers, dots, underscores or hyphens.');
      else if (changing && /Use a unique password/.test(text)) fieldError('newPassword', 'Use a unique password of 12–1024 characters.');
      else if (restricted && /Current password is incorrect/.test(text)) { setPassword(''); fieldError('password', 'Current password is incorrect.'); }
      else if (restricted && /Choose a different password/.test(text)) fieldError('newPassword', 'Choose a password different from your current one.');
      else if (setup && /already complete|Setup changed|recovery is required|offline administrator recovery/.test(text)) {
        clearSecrets();
        try { await checkSetup(); setNotice('Setup changed. Sign in with the existing account or follow the recovery guidance.'); }
        catch { setCheckFailed(true); }
      } else {
        clearSecrets(); setErrors({ form: changing ? 'Credentials could not be saved. Try again. If this continues, close the app and follow RECOVERY.md.' : 'Sign-in is unavailable. Try again. If this continues, close the app and follow RECOVERY.md.' });
      }
    } finally { busy.current = false; if (live.current) setLoading(false); }
  }

  function passwordField(name, label, value, setter, autoComplete, help) {
    const id = `auth-${name}`;
    return <div className="auth-field"><label htmlFor={id}>{label}</label><div className="auth-password"><input id={id} name={name} className="auth-input" type={visible[name] ? 'text' : 'password'} value={value} onChange={edit(name, setter)} autoComplete={autoComplete} required maxLength={1024} disabled={loading} aria-invalid={Boolean(errors[name])} aria-describedby={[help ? `${id}-help` : '', errors[name] ? `${id}-error` : '', capsLock ? 'auth-caps' : ''].filter(Boolean).join(' ') || undefined} onKeyDown={event => setCapsLock(Boolean(event.getModifierState?.('CapsLock')))} onKeyUp={event => setCapsLock(Boolean(event.getModifierState?.('CapsLock')))} onBlur={() => setCapsLock(false)}/><button className="auth-visibility" type="button" aria-label={`${visible[name] ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-controls={id} aria-pressed={Boolean(visible[name])} disabled={loading} onClick={() => setVisible(previous => ({ ...previous, [name]: !previous[name] }))}>{visible[name] ? 'Hide' : 'Show'}</button></div>{help && <p className="auth-hint" id={`${id}-help`}>{help}</p>}{errors[name] && <p className="auth-error" id={`${id}-error`} role="alert">{errors[name]}</p>}</div>;
  }
  return <main className="login-page auth-page"><section className="auth-panel" aria-labelledby="auth-title">
    <p className="auth-brand">{APP_TITLE}</p>
    {checking ? <><h1 id="auth-title">Opening your lab workspace</h1><p role="status">Checking local account setup…</p></> : checkFailed ? <><h1 id="auth-title">Account check unavailable</h1><p role="alert">We could not check this installation. Try again before signing in or creating an account.</p><button className="auth-primary" onClick={() => void inspect()}>Retry account check</button><RecoveryGuide /></> : recoveryRequired ? <><h1 id="auth-title">Administrator recovery required</h1><p>Existing lab records were found without an account. Your database has not been replaced.</p><RecoveryGuide /></> : <>
      <h1 id="auth-title">{setup ? 'Create this lab’s administrator account.' : restricted ? 'Replace the legacy password' : 'Sign in to your lab workspace'}</h1>
      <p className="auth-intro">{setup ? 'Choose local credentials for managing this lab’s users and settings.' : restricted ? 'Replace the default password before continuing.' : 'Use your local account to continue.'} No internet connection is needed.</p>
      <form ref={form} onSubmit={handleSubmit} noValidate aria-busy={loading}>
        {!restricted && <div className="auth-field"><label htmlFor="auth-username">Username</label><input id="auth-username" name="username" className="auth-input" value={username} onChange={edit('username', setUsername)} autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={100} disabled={loading} aria-invalid={Boolean(errors.username)} aria-describedby={errors.username ? 'auth-username-error' : setup ? 'auth-username-help' : undefined}/>{setup && <p className="auth-hint" id="auth-username-help">Letters, numbers, dots, underscores or hyphens. No spaces.</p>}{errors.username && <p className="auth-error" id="auth-username-error" role="alert">{errors.username}</p>}</div>}
        {!setup && passwordField('password', 'Password', password, setPassword, 'current-password')}
        {changing && <>{passwordField('newPassword', 'New password', nextPassword, setNextPassword, 'new-password', '12–1024 characters. Use a unique password and save it securely.')}{passwordField('confirmation', 'Confirm new password', confirmation, setConfirmation, 'new-password')}</>}
        {capsLock && <p id="auth-caps" className="auth-hint" role="status">Caps Lock is on.</p>}
        {errors.form && <p role="alert" className="auth-error auth-message">{errors.form}</p>}
        {notice && <p role="status" className="auth-success auth-message">{notice}</p>}
        <button className="auth-primary" type="submit" disabled={loading}>{loading ? changing ? 'Saving credentials…' : 'Signing in…' : setup ? 'Create administrator' : restricted ? 'Replace password' : 'Login'}</button>
      </form>
      {restricted && <button className="auth-secondary" disabled={loading} onClick={async () => { if (busy.current) return; busy.current = true; setLoading(true); try { await window.db.logout(); if (live.current) { clearSecrets(); setRestricted(null); setErrors({}); setNotice(''); } } catch { if (live.current) setErrors({ form: 'Could not sign out. Close the app before trying another account.' }); } finally { busy.current = false; if (live.current) setLoading(false); } }}>Sign in with another account</button>}
      <details className="auth-recovery"><summary>{setup ? 'Keeping administrator access safe' : 'Need help signing in?'}</summary><RecoveryGuide /></details>
      {APP_TITLE.includes('-rc.') && <p className="auth-release">Release candidate · Validate backup, recovery and printing before lab use.</p>}
    </>}
  </section></main>;
}
