import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Settings() {
  const navigate = useNavigate();
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
    if (window.db?.getDatabaseSize) {
      window.db.getDatabaseSize().then((bytes) => setDbSize(bytes)).catch(() => {});
    }
  }, [backupMessage]);

  useEffect(() => {
    if (window.db?.getLastBackupDate) {
      window.db.getLastBackupDate().then((d) => setLastBackupDate(d)).catch(() => {});
    }
  }, [backupMessage]);

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

  const handleBackupEncrypted = async () => {
    if (window.db?.backupEncrypted) {
      try {
        const p = await window.db.backupEncrypted(encryptPassword || undefined);
        setBackupMessage(`Encrypted backup saved: ${p}`);
        setEncryptPassword('');
      } catch (e) {
        setBackupMessage('Error: ' + e.message);
      }
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
        await window.db.seed();
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
          <p style={styles.subtitle}>Configure your lab and manage data</p>
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
            <input tabIndex={3} value={labConfig.staff_list} onChange={(e) => setLabConfig({ ...labConfig, staff_list: e.target.value })} style={styles.input} placeholder="Admin, Ramesh, Sita" />
          </div>
          <div style={styles.formRow}>
            <label style={styles.label}>Clinical correlation (footer text)</label>
            <input value={labConfig.clinical_correlation_text} onChange={(e) => setLabConfig({ ...labConfig, clinical_correlation_text: e.target.value })} style={styles.input} placeholder="Please correlate clinically" />
          </div>
          <button tabIndex={4} style={styles.btn} onClick={handleSaveLabConfig} className="settings-btn">Save Configuration</button>
          {configMessage && <p style={{ ...styles.message, color: configMessage.startsWith('Error') ? '#c00' : '#0d7377' }}>{configMessage}</p>}
        </div>

        <div style={{ ...styles.section, ...styles.sectionCatalogue }} className="settings-section">
          <div style={{ ...styles.sectionIconBadge, ...styles.badgePurple }}>
            <span style={styles.sectionIcon}>📋</span>
          </div>
          <div style={styles.sectionHeader}>
            <h3 style={styles.sectionTitle}>Investigation Catalogue</h3>
          </div>
          <p style={styles.desc}>Reload parameters from JSON.</p>
          <button style={styles.btn} onClick={handleReloadCatalog} className="settings-btn">
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
          <p style={styles.desc}>Default location: %APPDATA%/MondalDiagnosticCentre/backups/</p>
          {lastBackupDate && (
            <p style={{ ...styles.desc, marginBottom: 4 }}>
              Last backup: {new Date(lastBackupDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              {(() => {
                const days = Math.floor((Date.now() - new Date(lastBackupDate)) / 86400000);
                return days > 7 ? <span style={{ color: '#c00', fontWeight: 600 }}> — {days} days ago, consider backing up</span> : null;
              })()}
            </p>
          )}
          {dbSize != null && (
            <p style={{ ...styles.desc, marginBottom: 8, fontSize: 13 }}>Database size: {(dbSize / 1024 / 1024).toFixed(2)} MB</p>
          )}
          <div style={styles.btnGroup}>
            <button style={styles.btn} onClick={handleBackup} disabled={!window.db} className="settings-btn">Create Backup Now</button>
            <div style={styles.encryptRow}>
              <input type="password" value={encryptPassword} onChange={(e) => setEncryptPassword(e.target.value)} placeholder="Password for encrypted backup" style={{ ...styles.input, maxWidth: 220 }} />
              <button style={{ ...styles.btn, ...styles.btnSecondary }} onClick={handleBackupEncrypted} disabled={!window.db?.backupEncrypted} className="settings-btn">Encrypted Backup</button>
            </div>
          </div>
          {backupMessage && <p style={styles.message}>{backupMessage}</p>}
        </div>

        <div style={{ ...styles.section, ...styles.sectionExport }} className="settings-section">
          <div style={{ ...styles.sectionIconBadge, ...styles.badgeCoral }}>
            <span style={styles.sectionIcon}>📊</span>
          </div>
          <div style={styles.sectionHeader}>
            <h3 style={styles.sectionTitle}>Excel Export</h3>
          </div>
          <p style={styles.desc}>Export orders to Excel. Saved to %APPDATA%/MondalDiagnosticCentre/exports/</p>
          <div style={styles.dateRow}>
            <input tabIndex={5} type="date" value={exportDateFrom} onChange={(e) => setExportDateFrom(e.target.value)} style={styles.input} placeholder="From" />
            <span style={styles.dateSep}>→</span>
            <input tabIndex={6} type="date" value={exportDateTo} onChange={(e) => setExportDateTo(e.target.value)} style={styles.input} placeholder="To" />
          </div>
          <button style={styles.btn} onClick={handleExportExcel} disabled={!window.db?.exportOrdersExcel} className="settings-btn">Export Orders to Excel</button>
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
  sectionCatalogue: { borderLeft: '5px solid #6c5ce7', background: 'linear-gradient(to bottom, #fff 0%, #f8f6ff 100%)' },
  sectionBackup: { borderLeft: '5px solid #00b894', background: 'linear-gradient(to bottom, #fff 0%, #f0fdf9 100%)' },
  sectionExport: { borderLeft: '5px solid #e17055', background: 'linear-gradient(to bottom, #fff 0%, #fff8f6 100%)' },
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
  sectionHeader: { marginBottom: 12 },
  sectionIcon: { fontSize: 24 },
  sectionTitle: { margin: 0, fontSize: 18, fontWeight: 700, color: '#1e3a5f' },
  desc: { color: '#666', marginBottom: 12, fontSize: 13, lineHeight: 1.5 },
  formRow: { marginBottom: 14 },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' },
  input: { width: '100%', maxWidth: 400, padding: '12px 16px', borderRadius: 10, border: '2px solid #e8ecef', fontSize: 14, transition: 'border-color 0.2s, box-shadow 0.2s' },
  btn: { background: 'linear-gradient(180deg, #0d7377 0%, #0a5c5f 100%)', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 12, fontWeight: 600, fontSize: 14, boxShadow: '0 4px 14px rgba(13,115,119,0.35)', transition: 'transform 0.15s, box-shadow 0.15s' },
  btnSecondary: { background: 'linear-gradient(180deg, #14a3a8 0%, #0d7377 100%)' },
  btnGroup: { display: 'flex', flexDirection: 'column', gap: 12 },
  encryptRow: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  dateRow: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 },
  dateSep: { color: '#999', fontWeight: 600, fontSize: 14 },
  message: { marginTop: 12, fontSize: 13, color: '#0d7377' },
};
