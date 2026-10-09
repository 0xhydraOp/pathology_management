import { useState, useEffect } from 'react';
import RecoverySettings from '../components/RecoverySettings';
import ReferenceIntervalEditor from '../components/ReferenceIntervalEditor';
import PrintProfileSettings from '../components/PrintProfileSettings';
import { getUiFontScale, setUiFontScale } from '../utils/uiFontScale';

export default function Settings() {
  const [configMessage, setConfigMessage] = useState('');
  const [backupMessage, setBackupMessage] = useState('');
  const [labConfig, setLabConfig] = useState({
    name: 'MONDAL DIAGNOSTIC CENTRE',
    address: '',
    phone: '',
    email: '',
    registration_no: '',
    pathologist_name: 'Pathologist',
    default_printed_by: 'Admin',
    staff_list: '',
    clinical_correlation_text: 'Please correlate clinically',
  });
  const [encryptPassword, setEncryptPassword] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const [exportDateFrom, setExportDateFrom] = useState(today);
  const [exportDateTo, setExportDateTo] = useState(today);
  const [dbSize, setDbSize] = useState(null);
  const [lastBackupDate, setLastBackupDate] = useState(null);
  const [appVersion, setAppVersion] = useState(null);
  const [userDataPath, setUserDataPath] = useState(null);
  const [supportRefreshing, setSupportRefreshing] = useState(false);
  const [uiFontScale, setUiFontScaleState] = useState(() => getUiFontScale());
  const [wipePatientMessage, setWipePatientMessage] = useState('');
  const [wipePatientBusy, setWipePatientBusy] = useState(false);

  const refreshSupportStats = async () => {
    setSupportRefreshing(true);
    try {
      if (window.db?.getDatabaseSize) {
        const bytes = await window.db.getDatabaseSize();
        setDbSize(bytes);
      }
      if (window.db?.getLastBackupDate) {
        const d = await window.db.getLastBackupDate();
        setLastBackupDate(d);
      }
      if (window.electronApp?.getVersion) {
        const v = await window.electronApp.getVersion();
        setAppVersion(v);
      }
      if (window.electronApp?.getPath && (await window.db?.getSession?.())?.role==='admin') {
        const p = await window.electronApp.getPath('userData');
        setUserDataPath(p);
      } else if(window.electronApp?.getPath) {
        setUserDataPath('Admin authorization required');
      }
    } catch (_) {
      /* ignore */
    } finally {
      setSupportRefreshing(false);
    }
  };

  useEffect(() => {
    if (window.db?.getLabConfig) {
      window.db.getLabConfig().then((c) => c && setLabConfig({
        name: c.name || 'MONDAL DIAGNOSTIC CENTRE',
        address: c.address || '',
        phone: c.phone || '',
        email: c.email || '',
        registration_no: c.registration_no || '',
        pathologist_name: c.pathologist_name || 'Pathologist',
        default_printed_by: c.default_printed_by || 'Admin',
        staff_list: c.staff_list || '',
        clinical_correlation_text: c.clinical_correlation_text || 'Please correlate clinically',
      })).catch(() => {});
    }
  }, []);

  useEffect(() => {
    refreshSupportStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional reload when backup/export completes
  }, [backupMessage]);

  useEffect(() => {
    if (window.electronApp?.getVersion) {
      window.electronApp.getVersion().then((v) => v && setAppVersion(v)).catch(() => {});
    }
  }, []);

  const handleSaveLabConfig = async () => {
    if (window.db?.setLabConfig) {
      try {
        await window.db.setLabConfig(labConfig);
        setConfigMessage('Saved');
        setTimeout(() => setConfigMessage(''), 2500);
      } catch (e) {
        setConfigMessage('Error: ' + e.message);
      }
    }
  };

  const handleBackup = async () => {
    if (window.db) {
      try {
        const p = await window.db.backup();
        setBackupMessage(`Backup saved: ${p}`);
        window.db.getLastBackupDate?.().then((d) => setLastBackupDate(d)).catch(() => {});
      } catch (e) {
        setBackupMessage('Error: ' + e.message);
      }
    } else {
      setBackupMessage('Database not available (run in Electron).');
    }
  };

  const handleClearAllPatientData = async () => {
    if (!window.db?.clearAllPatientData) {
      setWipePatientMessage('Only available in the desktop app (Electron).');
      return;
    }
    const warn =
      'This will PERMANENTLY delete ALL patients, orders, test results, print history, and commission logs on this computer.\n\n' +
      'Lab settings, users, test catalogue, and rates will be kept.\n\n' +
      'Back up first if you need any of this data. Continue?';
    if (!window.confirm(warn)) return;
    const typed = window.prompt('Type DELETE in capitals to confirm:');
    if (typed !== 'DELETE') {
      setWipePatientMessage(typed == null ? 'Cancelled.' : 'Cancelled — type exactly DELETE to confirm.');
      setTimeout(() => setWipePatientMessage(''), 5000);
      return;
    }
    setWipePatientBusy(true);
    setWipePatientMessage('');
    try {
      const r = await window.db.clearAllPatientData();
      if (r?.ok) {
        setWipePatientMessage('All patient and order data has been removed. Refresh other open screens if needed.');
        refreshSupportStats();
      } else {
        setWipePatientMessage(`Error: ${r?.error || 'Unknown'}`);
      }
    } catch (e) {
      setWipePatientMessage(`Error: ${e.message || e}`);
    } finally {
      setWipePatientBusy(false);
    }
  };

  const handleBackupEncrypted = async () => {
    if (window.db?.backupEncrypted) {
      try {
        const p = await window.db.backupEncrypted(encryptPassword || undefined);
        setBackupMessage(`Encrypted backup saved: ${p}`);
        setEncryptPassword('');
        window.db.getLastBackupDate?.().then((d) => setLastBackupDate(d)).catch(() => {});
      } catch (e) {
        setBackupMessage('Error: ' + e.message);
      }
    }
  };

  const handleBackupToPc = async () => {
    if (window.db?.backupChooseLocation) {
      try {
        const r = await window.db.backupChooseLocation();
        if (r?.canceled) return;
        if (r?.ok && r.path) setBackupMessage(`Backup saved on your PC: ${r.path}`);
        else setBackupMessage(r?.error ? `Error: ${r.error}` : 'Backup failed');
      } catch (e) {
        setBackupMessage('Error: ' + e.message);
      }
    } else {
      setBackupMessage('Choose-location backup needs the desktop app.');
    }
  };

  const handleBackupEncryptedToPc = async () => {
    if (window.db?.backupEncryptedChooseLocation) {
      try {
        const r = await window.db.backupEncryptedChooseLocation(encryptPassword || undefined);
        if (r?.canceled) return;
        if (r?.ok && r.path) {
          setBackupMessage(`Encrypted backup saved on your PC: ${r.path}`);
          setEncryptPassword('');
        } else {
          setBackupMessage(r?.error ? `Error: ${r.error}` : 'Backup failed');
        }
      } catch (e) {
        setBackupMessage('Error: ' + e.message);
      }
    } else {
      setBackupMessage('Choose-location backup needs the desktop app.');
    }
  };

  const handleExportExcel = async () => {
    if (window.db?.exportOrdersExcel) {
      try {
        const p = await window.db.exportOrdersExcel({ dateFrom: exportDateFrom || undefined, dateTo: exportDateTo || undefined });
        setBackupMessage(`Excel export saved: ${p}`);
      } catch (e) {
        setBackupMessage('Error: ' + e.message);
      }
    }
  };

  return (
    <div data-ui="container" style={styles.container} className="ui-page ui-settings settings-page">
      <div data-ui="header" style={styles.header}>
        <div data-ui="headerIconWrap" style={styles.headerIconWrap}>
          <span data-ui="headerIcon" style={styles.headerIcon}>⚙</span>
        </div>
        <div data-ui="headerContent" style={styles.headerContent}>
          <h1 data-ui="title" style={styles.title}>Settings</h1>
          <p data-ui="subtitle" style={styles.subtitle}>
            Configure your lab and manage data
            {appVersion ? (
              <span data-ui="versionBadge" style={styles.versionBadge}> · App v{appVersion}</span>
            ) : null}
          </p>
        </div>
      </div>

      <div data-ui="grid" style={styles.grid}>
<div data-ui="section sectionLab" style={{ ...styles.section, ...styles.sectionLab }} className="settings-section">
          <div data-ui="sectionIconBadge" style={styles.sectionIconBadge}>
            <span data-ui="sectionIcon" style={styles.sectionIcon}>🔬</span>
          </div>
          <div data-ui="sectionHeader" style={styles.sectionHeader}>
            <h3 data-ui="sectionTitle" style={styles.sectionTitle}>Lab Profile & Configuration</h3>
          </div>
          <p data-ui="desc" style={styles.desc}>Lab details as shown on report pad header</p>
          <div data-ui="formRow" style={styles.formRow}>
            <label data-ui="label" htmlFor="settings-field-1" style={styles.label}>Lab Name</label>
            <input data-ui="input" id="settings-field-1" tabIndex={0} value={labConfig.name} onChange={(e) => setLabConfig({ ...labConfig, name: e.target.value })} style={styles.input} placeholder="MONDAL DIAGNOSTIC CENTRE" />
          </div>
          <div data-ui="formRow" style={styles.formRow}>
            <label data-ui="label" htmlFor="settings-field-2" style={styles.label}>Address</label>
            <textarea data-ui="input" id="settings-field-2" value={labConfig.address} onChange={(e) => setLabConfig({ ...labConfig, address: e.target.value })} style={{ ...styles.input, minHeight: 60 }} placeholder="Full address" rows={2} />
          </div>
          <div data-ui="formRow" style={styles.formRow}>
            <label data-ui="label" htmlFor="settings-field-3" style={styles.label}>Phone</label>
            <input data-ui="input" id="settings-field-3" value={labConfig.phone} onChange={(e) => setLabConfig({ ...labConfig, phone: e.target.value })} style={styles.input} placeholder="Phone number" />
          </div>
          <div data-ui="formRow" style={styles.formRow}>
            <label data-ui="label" htmlFor="settings-field-4" style={styles.label}>Email</label>
            <input data-ui="input" id="settings-field-4" type="email" value={labConfig.email} onChange={(e) => setLabConfig({ ...labConfig, email: e.target.value })} style={styles.input} placeholder="Email" />
          </div>
          <div data-ui="formRow" style={styles.formRow}>
            <label data-ui="label" htmlFor="settings-field-5" style={styles.label}>Registration No.</label>
            <input data-ui="input" id="settings-field-5" value={labConfig.registration_no} onChange={(e) => setLabConfig({ ...labConfig, registration_no: e.target.value })} style={styles.input} placeholder="Lab registration number (if any)" />
          </div>
          <div data-ui="formRow" style={styles.formRow}>
            <label data-ui="label" htmlFor="settings-field-6" style={styles.label}>Pathologist (Read by)</label>
            <input data-ui="input" id="settings-field-6"  value={labConfig.pathologist_name} onChange={(e) => setLabConfig({ ...labConfig, pathologist_name: e.target.value })} style={styles.input} />
          </div>
          <div data-ui="formRow" style={styles.formRow}>
            <label data-ui="label" htmlFor="settings-field-7" style={styles.label}>Default Printed by</label>
            <input data-ui="input" id="settings-field-7"  value={labConfig.default_printed_by} onChange={(e) => setLabConfig({ ...labConfig, default_printed_by: e.target.value })} style={styles.input} />
          </div>
          <div data-ui="formRow" style={styles.formRow}>
            <label data-ui="label" htmlFor="settings-field-8" style={styles.label}>Staff list (comma-separated)</label>
            <input data-ui="input" id="settings-field-8"  value={labConfig.staff_list} onChange={(e) => setLabConfig({ ...labConfig, staff_list: e.target.value })} style={styles.input} placeholder="Staff names, comma-separated" />
          </div>
          <div data-ui="formRow" style={styles.formRow}>
            <label data-ui="label" htmlFor="settings-field-9" style={styles.label}>Clinical correlation (footer text)</label>
            <input data-ui="input" id="settings-field-9" value={labConfig.clinical_correlation_text} onChange={(e) => setLabConfig({ ...labConfig, clinical_correlation_text: e.target.value })} style={styles.input} placeholder="Please correlate clinically" />
          </div>
          <button data-ui="btn" type="button"  style={styles.btn} onClick={handleSaveLabConfig} className="settings-btn">Save Configuration</button>
          {configMessage && <p data-ui="message" style={{ ...styles.message, color: configMessage.startsWith('Error') ? '#c00' : '#0d7377' }}>{configMessage}</p>}
        </div>
<div data-ui="section sectionDisplay" style={{ ...styles.section, ...styles.sectionDisplay }} className="settings-section">
          <div data-ui="sectionIconBadge badgeTeal" style={{ ...styles.sectionIconBadge, ...styles.badgeTeal }}>
            <span data-ui="sectionIcon" style={styles.sectionIcon}>Aa</span>
          </div>
          <div data-ui="sectionHeader" style={styles.sectionHeader}>
            <h3 data-ui="sectionTitle" style={styles.sectionTitle}>Display</h3>
          </div>
          <p data-ui="desc" style={styles.desc}>Larger or smaller text on <strong>Result entry</strong> and <strong>Reports</strong> (saved on this device).</p>
          <div data-ui="fontScaleRow" style={styles.fontScaleRow} role="group" aria-label="Text size">
            {[
              { id: 'sm', label: 'Smaller' },
              { id: 'default', label: 'Default' },
              { id: 'lg', label: 'Larger' },
            ].map((opt) => (
              <button data-ui={['fontScaleBtn',(uiFontScale === opt.id)?'fontScaleBtnActive':''].filter(Boolean).join(' ')}
                key={opt.id}
                type="button"
                style={{
                  ...styles.fontScaleBtn,
                  ...(uiFontScale === opt.id ? styles.fontScaleBtnActive : {}),
                }}
                aria-pressed={uiFontScale === opt.id}
                onClick={() => {
                  setUiFontScale(opt.id);
                  setUiFontScaleState(opt.id);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
<div data-ui="section sectionCatalogue" style={{ ...styles.section, ...styles.sectionCatalogue }} className="settings-section">
          <div data-ui="sectionIconBadge badgePurple" style={{ ...styles.sectionIconBadge, ...styles.badgePurple }}>
            <span data-ui="sectionIcon" style={styles.sectionIcon}>📋</span>
          </div>
          <div data-ui="sectionHeader" style={styles.sectionHeader}>
            <h3 data-ui="sectionTitle" style={styles.sectionTitle}>Investigation Catalogue</h3>
          </div>
          <p data-ui="desc" style={styles.desc}>Catalogue reload is locked to preserve parameter IDs and local reference settings. Use the reference-interval editor in Advanced configuration.</p>
          <button data-ui="btn" type="button" style={styles.btn} disabled className="settings-btn">
            Catalogue IDs protected
          </button>
        </div>
<div data-ui="section sectionBackup" style={{ ...styles.section, ...styles.sectionBackup }} className="settings-section">
          <div data-ui="sectionIconBadge badgeGreen" style={{ ...styles.sectionIconBadge, ...styles.badgeGreen }}>
            <span data-ui="sectionIcon" style={styles.sectionIcon}>💾</span>
          </div>
          <div data-ui="sectionHeader" style={styles.sectionHeader}>
            <h3 data-ui="sectionTitle" style={styles.sectionTitle}>Backup</h3>
          </div>
          <p data-ui="desc" style={styles.desc}>
            Quick backup saves under the app data folder. You can also save a copy anywhere on this PC (Desktop, Documents, USB drive).
          </p>
          <p data-ui="desc" style={{ ...styles.desc, fontSize: 13, color: '#555' }}>Quick backups use the <code style={{ fontSize: 12 }}>backups</code> folder under the path shown in Support (same place as your database).</p>
          {lastBackupDate ? (
            <p data-ui="desc" style={{ ...styles.desc, marginBottom: 4 }}>
              Last backup: {new Date(lastBackupDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              {(() => {
                const days = Math.floor((Date.now() - new Date(lastBackupDate)) / 86400000);
                return days > 7 ? <span style={{ color: '#c00', fontWeight: 600 }}> — {days} days ago, consider backing up</span> : null;
              })()}
            </p>
          ) : (
            <p data-ui="desc" style={{ ...styles.desc, marginBottom: 4, color: '#888' }}>No backup recorded yet on this computer.</p>
          )}
          {dbSize != null && (
            <p data-ui="desc" style={{ ...styles.desc, marginBottom: 8, fontSize: 13 }}>Database size: {(dbSize / 1024 / 1024).toFixed(2)} MB</p>
          )}
          <div data-ui="btnGroup" style={styles.btnGroup}>
            <button data-ui="btn" type="button" style={styles.btn} onClick={handleBackup} disabled={!window.db} className="settings-btn">Backup to app folder</button>
            <button data-ui="btn btnSecondary" type="button" style={{ ...styles.btn, ...styles.btnSecondary }} onClick={handleBackupToPc} disabled={!window.db?.backupChooseLocation} className="settings-btn">Save to PC…</button>
            <div data-ui="encryptRow" style={styles.encryptRow}>
              <input data-ui="input" type="password" value={encryptPassword} onChange={(e) => setEncryptPassword(e.target.value)} aria-label="Backup encryption passphrase" placeholder="Passphrase (12+ characters)" style={{ ...styles.input, maxWidth: 220 }} />
              <button data-ui="btn btnSecondary" type="button" style={{ ...styles.btn, ...styles.btnSecondary }} onClick={handleBackupEncrypted} disabled={!window.db?.backupEncrypted} className="settings-btn">Encrypted (app folder)</button>
              <button data-ui="btn btnSecondary" type="button" style={{ ...styles.btn, ...styles.btnSecondary }} onClick={handleBackupEncryptedToPc} disabled={!window.db?.backupEncryptedChooseLocation} className="settings-btn">Encrypted to PC…</button>
            </div>
          </div>
          <p data-ui="desc">Encrypted backups require your own passphrase. Store it separately: a lost passphrase cannot recover a backup. Quick local recovery copies are unencrypted and require protected storage.</p>
          {backupMessage && <p data-ui="message" style={styles.message}>{backupMessage}</p>}
        </div>
<div data-ui="section sectionExport" style={{ ...styles.section, ...styles.sectionExport }} className="settings-section">
          <div data-ui="sectionIconBadge badgeCoral" style={{ ...styles.sectionIconBadge, ...styles.badgeCoral }}>
            <span data-ui="sectionIcon" style={styles.sectionIcon}>📊</span>
          </div>
          <div data-ui="sectionHeader" style={styles.sectionHeader}>
            <h3 data-ui="sectionTitle" style={styles.sectionTitle}>Excel Export</h3>
          </div>
          <p data-ui="desc" style={styles.desc}>Export orders to Excel. Files are saved under the <code style={{ fontSize: 12 }}>exports</code> folder in your app data path (see Support).</p>
          <div data-ui="dateRow" style={styles.dateRow}>
            <input data-ui="input"  type="date" value={exportDateFrom} onChange={(e) => setExportDateFrom(e.target.value)} style={styles.input} placeholder="From" />
            <span data-ui="dateSep" style={styles.dateSep}>→</span>
            <input data-ui="input"  type="date" value={exportDateTo} onChange={(e) => setExportDateTo(e.target.value)} style={styles.input} placeholder="To" />
          </div>
          <button data-ui="btn" type="button" style={styles.btn} onClick={handleExportExcel} disabled={!window.db?.exportOrdersExcel} className="settings-btn">Export Orders to Excel</button>
        </div>
<details className="advanced-settings"><summary>Reference intervals & approval<small>Parameter rules, local approval history and clinical review.</small></summary><ReferenceIntervalEditor /></details>
<details className="advanced-settings"><summary>Paper & preprinted-pad profile<small>Paper geometry, offsets and patient-free calibration.</small></summary><PrintProfileSettings /></details>
<details className="advanced-settings advanced-danger"><summary>Patient data removal<small>Destructive administration · existing confirmation is required.</small></summary><div data-ui="section sectionDanger" style={{ ...styles.section, ...styles.sectionDanger }} className="settings-section">
          <div data-ui="sectionIconBadge badgeDanger" style={{ ...styles.sectionIconBadge, ...styles.badgeDanger }}>
            <span data-ui="sectionIcon" style={styles.sectionIcon}>⚠</span>
          </div>
          <div data-ui="sectionHeader" style={styles.sectionHeader}>
            <h3 data-ui="sectionTitle" style={styles.sectionTitle}>Remove all patient data</h3>
          </div>
          <p data-ui="desc" style={styles.desc}>
            Deletes every <strong>patient</strong>, <strong>order</strong>, <strong>result</strong>, print log entry, and commission log row.
            Resets patient ID numbering (next registration starts from PT01 for the current month).
          </p>
          <p data-ui="desc" style={{ ...styles.desc, color: '#991b1b', fontWeight: 600 }}>
            Does not delete: login users, lab profile, investigation catalogue, test rates, or referrer commission settings.
          </p>
          <button data-ui="btn btnDanger"
            type="button"
            style={{ ...styles.btn, ...styles.btnDanger }}
            onClick={handleClearAllPatientData}
            disabled={!window.db?.clearAllPatientData || wipePatientBusy}
            className="settings-btn"
          >
            {wipePatientBusy ? 'Removing…' : 'Delete all patients & orders…'}
          </button>
          {wipePatientMessage && (
            <p data-ui="message" style={{ ...styles.message, color: wipePatientMessage.startsWith('Error') ? '#c00' : '#0d7377', marginTop: 12 }}>
              {wipePatientMessage}
            </p>
          )}
        </div></details>
<RecoverySettings/>
<details className="advanced-settings"><summary>Support & storage<small>App version, database location and backup information.</small></summary><div data-ui="section sectionSupport" style={{ ...styles.section, ...styles.sectionSupport }} className="settings-section">
          <div data-ui="sectionIconBadge badgeSlate" style={{ ...styles.sectionIconBadge, ...styles.badgeSlate }}>
            <span data-ui="sectionIcon" style={styles.sectionIcon}>ℹ</span>
          </div>
          <div data-ui="sectionHeader" style={styles.sectionHeader}>
            <h3 data-ui="sectionTitle" style={styles.sectionTitle}>Support &amp; diagnostics</h3>
          </div>
          <p data-ui="desc" style={styles.desc}>Use this when IT asks for version or data location. Help → About also shows the app version.</p>
          <div data-ui="supportGrid" style={styles.supportGrid}>
            <div>
              <span data-ui="supportLabel" style={styles.supportLabel}>App version</span>
              <p data-ui="supportValue" style={styles.supportValue}>{appVersion ?? (window.electronApp?.getVersion ? '…' : 'Browser preview (Electron only)')}</p>
            </div>
            <div>
              <span data-ui="supportLabel" style={styles.supportLabel}>Database</span>
              <p data-ui="supportValue" style={styles.supportValue}>
                {dbSize != null ? `${(dbSize / 1024 / 1024).toFixed(2)} MB` : '—'}
              </p>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <span data-ui="supportLabel" style={styles.supportLabel}>User data folder (backups, DB)</span>
              <p data-ui="supportValue" style={{ ...styles.supportValue, wordBreak: 'break-all', fontSize: 12, fontFamily: 'monospace' }}>
                {userDataPath ?? '—'}
              </p>
            </div>
          </div>
          <button data-ui="btn btnGhost"
            type="button"
            style={{ ...styles.btn, ...styles.btnGhost }}
            onClick={refreshSupportStats}
            disabled={supportRefreshing}
            className="settings-btn"
          >
            {supportRefreshing ? 'Refreshing…' : 'Refresh storage info'}
          </button>
        </div></details>
</div>
    </div>
  );
}

const styles = {
  container: { maxWidth: 780 },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 20,
    marginBottom: 32,
    padding: '28px 32px',
    background: 'linear-gradient(135deg, #1e3a5f 0%, #0d7377 40%, #14a3a8 100%)',
    borderRadius: 20,
    boxShadow: '0 12px 40px rgba(13,115,119,0.4), 0 0 0 1px rgba(255,255,255,0.1) inset',
    color: '#fff',
    position: 'relative',
    overflow: 'hidden',
  },
  headerIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 16,
    background: 'rgba(255,255,255,0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(8px)',
  },
  headerIcon: { fontSize: 32 },
  headerContent: { flex: 1 },
  backBtn: { padding: '10px 18px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  title: { fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' },
  subtitle: { fontSize: 15, margin: '6px 0 0', opacity: 0.95 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 24 },
  section: {
    background: '#fff',
    padding: 28,
    borderRadius: 18,
    boxShadow: '0 6px 24px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04)',
    border: '1px solid rgba(0,0,0,0.06)',
    position: 'relative',
    overflow: 'hidden',
    transition: 'transform 0.25s ease, box-shadow 0.25s ease',
  },
  sectionLab: { borderLeft: '5px solid #0d7377', background: 'linear-gradient(to bottom, #fff 0%, #f8fcfc 100%)' },
  sectionDisplay: { borderLeft: '5px solid #0891b2', background: 'linear-gradient(to bottom, #fff 0%, #f0fdfa 100%)' },
  sectionCatalogue: { borderLeft: '5px solid #6c5ce7', background: 'linear-gradient(to bottom, #fff 0%, #f8f6ff 100%)' },
  sectionBackup: { borderLeft: '5px solid #00b894', background: 'linear-gradient(to bottom, #fff 0%, #f0fdf9 100%)' },
  sectionExport: { borderLeft: '5px solid #e17055', background: 'linear-gradient(to bottom, #fff 0%, #fff8f6 100%)' },
  sectionSupport: { borderLeft: '5px solid #64748b', background: 'linear-gradient(to bottom, #fff 0%, #f8fafc 100%)' },
  sectionDanger: { borderLeft: '5px solid #b91c1c', background: 'linear-gradient(to bottom, #fff 0%, #fef2f2 100%)' },
  sectionIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    background: 'linear-gradient(135deg, #0d7377 0%, #14a3a8 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    boxShadow: '0 4px 12px rgba(13,115,119,0.3)',
  },
  badgePurple: { background: 'linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%)', boxShadow: '0 4px 12px rgba(108,92,231,0.3)' },
  badgeGreen: { background: 'linear-gradient(135deg, #00b894 0%, #55efc4 100%)', boxShadow: '0 4px 12px rgba(0,184,148,0.3)' },
  badgeCoral: { background: 'linear-gradient(135deg, #e17055 0%, #fab1a0 100%)', boxShadow: '0 4px 12px rgba(225,112,85,0.3)' },
  badgeSlate: { background: 'linear-gradient(135deg, #64748b 0%, #94a3b8 100%)', boxShadow: '0 4px 12px rgba(100,116,139,0.3)' },
  badgeTeal: { background: 'linear-gradient(135deg, #0891b2 0%, #22d3ee 100%)', boxShadow: '0 4px 12px rgba(8,145,178,0.35)' },
  badgeDanger: { background: 'linear-gradient(135deg, #b91c1c 0%, #ef4444 100%)', boxShadow: '0 4px 12px rgba(185,28,28,0.35)' },
  fontScaleRow: { display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  fontScaleBtn: {
    padding: '10px 18px',
    borderRadius: 10,
    border: '2px solid #e2e8f0',
    background: '#fff',
    color: '#475569',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  fontScaleBtnActive: {
    borderColor: '#0d7377',
    background: '#f0fdfa',
    color: '#0d7377',
    boxShadow: '0 0 0 1px rgba(13,115,119,0.2)',
  },
  versionBadge: { fontWeight: 700, opacity: 1 },
  supportGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 },
  supportLabel: { fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' },
  supportValue: { margin: '6px 0 0', fontSize: 14, color: '#1e293b', fontWeight: 600 },
  btnGhost: {
    background: '#f1f5f9',
    color: '#334155',
    border: '2px solid #e2e8f0',
    boxShadow: 'none',
  },
  sectionHeader: { marginBottom: 12 },
  sectionIcon: { fontSize: 24 },
  sectionTitle: { margin: 0, fontSize: 18, fontWeight: 700, color: '#1e3a5f' },
  desc: { color: '#666', marginBottom: 12, fontSize: 13, lineHeight: 1.5 },
  formRow: { marginBottom: 14 },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' },
  input: { width: '100%', maxWidth: 400, padding: '12px 16px', borderRadius: 10, border: '2px solid #e8ecef', fontSize: 14, transition: 'border-color 0.2s, box-shadow 0.2s' },
  btn: { background: 'linear-gradient(180deg, #0d7377 0%, #0a5c5f 100%)', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 12, fontWeight: 600, fontSize: 14, boxShadow: '0 4px 14px rgba(13,115,119,0.35)', transition: 'transform 0.15s, box-shadow 0.15s' },
  btnSecondary: { background: 'linear-gradient(180deg, #14a3a8 0%, #0d7377 100%)' },
  btnDanger: {
    background: 'linear-gradient(180deg, #dc2626 0%, #991b1b 100%)',
    boxShadow: '0 4px 14px rgba(185,28,28,0.35)',
  },
  btnGroup: { display: 'flex', flexDirection: 'column', gap: 12 },
  encryptRow: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  dateRow: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 },
  dateSep: { color: '#999', fontWeight: 600, fontSize: 14 },
  message: { marginTop: 12, fontSize: 13, color: '#0d7377' },
};
