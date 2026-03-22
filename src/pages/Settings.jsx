import { useState, useEffect } from 'react';
import { getUiFontScale, setUiFontScale } from '../utils/uiFontScale';

export default function Settings() {
  const [configMessage, setConfigMessage] = useState('');
  const [catalogueMessage, setCatalogueMessage] = useState('');
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
      if (window.electronApp?.getPath) {
        const p = await window.electronApp.getPath('userData');
        setUserDataPath(p);
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

  const handleReloadCatalog = async () => {
    if (window.db) {
      try {
        await window.db.reloadCatalogue();
        setCatalogueMessage('Saved');
        setTimeout(() => setCatalogueMessage(''), 2500);
      } catch (e) {
        setCatalogueMessage('Error: ' + e.message);
      }
    } else {
      setCatalogueMessage('Database not available (run in Electron).');
    }
  };

  return (
    <div style={styles.container} className="settings-page">
      <div style={styles.header}>
        <div style={styles.headerIconWrap}>
          <span style={styles.headerIcon}>⚙</span>
        </div>
        <div style={styles.headerContent}>
          <h1 style={styles.title}>Settings</h1>
          <p style={styles.subtitle}>
            Configure your lab and manage data
            {appVersion ? (
              <span style={styles.versionBadge}> · App v{appVersion}</span>
            ) : null}
          </p>
        </div>
      </div>

      <div style={styles.grid}>
        <div style={{ ...styles.section, ...styles.sectionLab }} className="settings-section">
          <div style={styles.sectionIconBadge}>
            <span style={styles.sectionIcon}>🔬</span>
          </div>
          <div style={styles.sectionHeader}>
            <h3 style={styles.sectionTitle}>Lab Profile & Configuration</h3>
          </div>
          <p style={styles.desc}>Lab details as shown on report pad header</p>
          <div style={styles.formRow}>
            <label style={styles.label}>Lab Name</label>
            <input tabIndex={0} value={labConfig.name} onChange={(e) => setLabConfig({ ...labConfig, name: e.target.value })} style={styles.input} placeholder="MONDAL DIAGNOSTIC CENTRE" />
          </div>
          <div style={styles.formRow}>
            <label style={styles.label}>Address</label>
            <textarea value={labConfig.address} onChange={(e) => setLabConfig({ ...labConfig, address: e.target.value })} style={{ ...styles.input, minHeight: 60 }} placeholder="Full address" rows={2} />
          </div>
          <div style={styles.formRow}>
            <label style={styles.label}>Phone</label>
            <input value={labConfig.phone} onChange={(e) => setLabConfig({ ...labConfig, phone: e.target.value })} style={styles.input} placeholder="Phone number" />
          </div>
          <div style={styles.formRow}>
            <label style={styles.label}>Email</label>
            <input type="email" value={labConfig.email} onChange={(e) => setLabConfig({ ...labConfig, email: e.target.value })} style={styles.input} placeholder="Email" />
          </div>
          <div style={styles.formRow}>
            <label style={styles.label}>Registration No.</label>
            <input value={labConfig.registration_no} onChange={(e) => setLabConfig({ ...labConfig, registration_no: e.target.value })} style={styles.input} placeholder="Lab registration number (if any)" />
          </div>
          <div style={styles.formRow}>
            <label style={styles.label}>Pathologist (Read by)</label>
            <input tabIndex={1} value={labConfig.pathologist_name} onChange={(e) => setLabConfig({ ...labConfig, pathologist_name: e.target.value })} style={styles.input} />
          </div>
          <div style={styles.formRow}>
            <label style={styles.label}>Default Printed by</label>
            <input tabIndex={2} value={labConfig.default_printed_by} onChange={(e) => setLabConfig({ ...labConfig, default_printed_by: e.target.value })} style={styles.input} />
          </div>
          <div style={styles.formRow}>
            <label style={styles.label}>Staff list (comma-separated)</label>
            <input tabIndex={3} value={labConfig.staff_list} onChange={(e) => setLabConfig({ ...labConfig, staff_list: e.target.value })} style={styles.input} placeholder="Staff names, comma-separated" />
          </div>
          <div style={styles.formRow}>
            <label style={styles.label}>Clinical correlation (footer text)</label>
            <input value={labConfig.clinical_correlation_text} onChange={(e) => setLabConfig({ ...labConfig, clinical_correlation_text: e.target.value })} style={styles.input} placeholder="Please correlate clinically" />
          </div>
          <button type="button" tabIndex={4} style={styles.btn} onClick={handleSaveLabConfig} className="settings-btn">Save Configuration</button>
          {configMessage && <p style={{ ...styles.message, color: configMessage.startsWith('Error') ? '#c00' : '#0d7377' }}>{configMessage}</p>}
        </div>

        <div style={{ ...styles.section, ...styles.sectionDisplay }} className="settings-section">
          <div style={{ ...styles.sectionIconBadge, ...styles.badgeTeal }}>
            <span style={styles.sectionIcon}>Aa</span>
          </div>
          <div style={styles.sectionHeader}>
            <h3 style={styles.sectionTitle}>Display</h3>
          </div>
          <p style={styles.desc}>Larger or smaller text on <strong>Result entry</strong> and <strong>Reports</strong> (saved on this device).</p>
          <div style={styles.fontScaleRow} role="group" aria-label="Text size">
            {[
              { id: 'sm', label: 'Smaller' },
              { id: 'default', label: 'Default' },
              { id: 'lg', label: 'Larger' },
            ].map((opt) => (
              <button
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

        <div style={{ ...styles.section, ...styles.sectionCatalogue }} className="settings-section">
          <div style={{ ...styles.sectionIconBadge, ...styles.badgePurple }}>
            <span style={styles.sectionIcon}>📋</span>
          </div>
          <div style={styles.sectionHeader}>
            <h3 style={styles.sectionTitle}>Investigation Catalogue</h3>
          </div>
          <p style={styles.desc}>Reload parameters from JSON.</p>
          <button type="button" style={styles.btn} onClick={handleReloadCatalog} className="settings-btn">
            Reload Catalogue
          </button>
          {catalogueMessage && <p style={{ ...styles.message, color: catalogueMessage.startsWith('Error') ? '#c00' : '#0d7377' }}>{catalogueMessage}</p>}
        </div>

        <div style={{ ...styles.section, ...styles.sectionBackup }} className="settings-section">
          <div style={{ ...styles.sectionIconBadge, ...styles.badgeGreen }}>
            <span style={styles.sectionIcon}>💾</span>
          </div>
          <div style={styles.sectionHeader}>
            <h3 style={styles.sectionTitle}>Backup</h3>
          </div>
          <p style={styles.desc}>
            Quick backup saves under the app data folder. You can also save a copy anywhere on this PC (Desktop, Documents, USB drive).
          </p>
          <p style={{ ...styles.desc, fontSize: 13, color: '#555' }}>Quick backups use the <code style={{ fontSize: 12 }}>backups</code> folder under the path shown in Support (same place as your database).</p>
          {lastBackupDate ? (
            <p style={{ ...styles.desc, marginBottom: 4 }}>
              Last backup: {new Date(lastBackupDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              {(() => {
                const days = Math.floor((Date.now() - new Date(lastBackupDate)) / 86400000);
                return days > 7 ? <span style={{ color: '#c00', fontWeight: 600 }}> — {days} days ago, consider backing up</span> : null;
              })()}
            </p>
          ) : (
            <p style={{ ...styles.desc, marginBottom: 4, color: '#888' }}>No backup recorded yet on this computer.</p>
          )}
          {dbSize != null && (
            <p style={{ ...styles.desc, marginBottom: 8, fontSize: 13 }}>Database size: {(dbSize / 1024 / 1024).toFixed(2)} MB</p>
          )}
          <div style={styles.btnGroup}>
            <button type="button" style={styles.btn} onClick={handleBackup} disabled={!window.db} className="settings-btn">Backup to app folder</button>
            <button type="button" style={{ ...styles.btn, ...styles.btnSecondary }} onClick={handleBackupToPc} disabled={!window.db?.backupChooseLocation} className="settings-btn">Save to PC…</button>
            <div style={styles.encryptRow}>
              <input type="password" value={encryptPassword} onChange={(e) => setEncryptPassword(e.target.value)} placeholder="Password for encrypted backup" style={{ ...styles.input, maxWidth: 220 }} />
              <button type="button" style={{ ...styles.btn, ...styles.btnSecondary }} onClick={handleBackupEncrypted} disabled={!window.db?.backupEncrypted} className="settings-btn">Encrypted (app folder)</button>
              <button type="button" style={{ ...styles.btn, ...styles.btnSecondary }} onClick={handleBackupEncryptedToPc} disabled={!window.db?.backupEncryptedChooseLocation} className="settings-btn">Encrypted to PC…</button>
            </div>
          </div>
          {backupMessage && <p style={styles.message}>{backupMessage}</p>}
        </div>

        <div style={{ ...styles.section, ...styles.sectionDanger }} className="settings-section">
          <div style={{ ...styles.sectionIconBadge, ...styles.badgeDanger }}>
            <span style={styles.sectionIcon}>⚠</span>
          </div>
          <div style={styles.sectionHeader}>
            <h3 style={styles.sectionTitle}>Remove all patient data</h3>
          </div>
          <p style={styles.desc}>
            Deletes every <strong>patient</strong>, <strong>order</strong>, <strong>result</strong>, print log entry, and commission log row.
            Resets patient ID numbering (next registration starts from PT01 for the current month).
          </p>
          <p style={{ ...styles.desc, color: '#991b1b', fontWeight: 600 }}>
            Does not delete: login users, lab profile, investigation catalogue, test rates, or referrer commission settings.
          </p>
          <button
            type="button"
            style={{ ...styles.btn, ...styles.btnDanger }}
            onClick={handleClearAllPatientData}
            disabled={!window.db?.clearAllPatientData || wipePatientBusy}
            className="settings-btn"
          >
            {wipePatientBusy ? 'Removing…' : 'Delete all patients & orders…'}
          </button>
          {wipePatientMessage && (
            <p style={{ ...styles.message, color: wipePatientMessage.startsWith('Error') ? '#c00' : '#0d7377', marginTop: 12 }}>
              {wipePatientMessage}
            </p>
          )}
        </div>

        <div style={{ ...styles.section, ...styles.sectionExport }} className="settings-section">
          <div style={{ ...styles.sectionIconBadge, ...styles.badgeCoral }}>
            <span style={styles.sectionIcon}>📊</span>
          </div>
          <div style={styles.sectionHeader}>
            <h3 style={styles.sectionTitle}>Excel Export</h3>
          </div>
          <p style={styles.desc}>Export orders to Excel. Files are saved under the <code style={{ fontSize: 12 }}>exports</code> folder in your app data path (see Support).</p>
          <div style={styles.dateRow}>
            <input tabIndex={5} type="date" value={exportDateFrom} onChange={(e) => setExportDateFrom(e.target.value)} style={styles.input} placeholder="From" />
            <span style={styles.dateSep}>→</span>
            <input tabIndex={6} type="date" value={exportDateTo} onChange={(e) => setExportDateTo(e.target.value)} style={styles.input} placeholder="To" />
          </div>
          <button type="button" style={styles.btn} onClick={handleExportExcel} disabled={!window.db?.exportOrdersExcel} className="settings-btn">Export Orders to Excel</button>
        </div>

        <div style={{ ...styles.section, ...styles.sectionSupport }} className="settings-section">
          <div style={{ ...styles.sectionIconBadge, ...styles.badgeSlate }}>
            <span style={styles.sectionIcon}>ℹ</span>
          </div>
          <div style={styles.sectionHeader}>
            <h3 style={styles.sectionTitle}>Support &amp; diagnostics</h3>
          </div>
          <p style={styles.desc}>Use this when IT asks for version or data location. Help → About also shows the app version.</p>
          <div style={styles.supportGrid}>
            <div>
              <span style={styles.supportLabel}>App version</span>
              <p style={styles.supportValue}>{appVersion ?? (window.electronApp?.getVersion ? '…' : 'Browser preview (Electron only)')}</p>
            </div>
            <div>
              <span style={styles.supportLabel}>Database</span>
              <p style={styles.supportValue}>
                {dbSize != null ? `${(dbSize / 1024 / 1024).toFixed(2)} MB` : '—'}
              </p>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <span style={styles.supportLabel}>User data folder (backups, DB)</span>
              <p style={{ ...styles.supportValue, wordBreak: 'break-all', fontSize: 12, fontFamily: 'monospace' }}>
                {userDataPath ?? '—'}
              </p>
            </div>
          </div>
          <button
            type="button"
            style={{ ...styles.btn, ...styles.btnGhost }}
            onClick={refreshSupportStats}
            disabled={supportRefreshing}
            className="settings-btn"
          >
            {supportRefreshing ? 'Refreshing…' : 'Refresh storage info'}
          </button>
        </div>
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
