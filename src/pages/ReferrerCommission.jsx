import { useState, useEffect, useCallback } from 'react';

const DEFAULT_COMMISSION = 45;

export default function ReferrerCommission() {
  const [referrers, setReferrers] = useState([]);
  const [defaultPct, setDefaultPct] = useState(DEFAULT_COMMISSION);
  const [commissions, setCommissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    if (!window.db) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [refRows, pctRows, labRow] = await Promise.all([
        window.db.read('referrals.names', []),
        window.db.read('configuration.commissions', []),
        window.db.read('configuration.defaultCommission', []),
      ]);
      const fromPatients = new Set((refRows || []).map((r) => r.name).filter(Boolean));
      const fromPct = (pctRows || []).map((r) => r.referrer_name);
      const names = [...new Set([...fromPatients, ...fromPct])].sort();
      const pctMap = {};
      (pctRows || []).forEach((r) => {
        pctMap[r.referrer_name] = parseFloat(r.commission_percent) ?? DEFAULT_COMMISSION;
      });
      const commissionsMap = {};
      names.forEach((n) => {
        commissionsMap[n] = pctMap[n] ?? (parseFloat(labRow?.commission_default_percent) ?? DEFAULT_COMMISSION);
      });
      setReferrers(names);
      setCommissions(commissionsMap);
      setDefaultPct(parseFloat(labRow?.commission_default_percent) ?? DEFAULT_COMMISSION);
    } catch (e) {
      console.error(e);
      setReferrers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCommissionChange = (name, value) => {
    const num = parseFloat(value.replace(/[^\d.]/g, '')) || 0;
    setCommissions((prev) => ({ ...prev, [name]: Math.min(100, Math.max(0, num)) }));
  };

  const handleDefaultChange = (value) => {
    const num = parseFloat(value.replace(/[^\d.]/g, '')) || 0;
    setDefaultPct(Math.min(100, Math.max(0, num)));
  };

  const handleSave = async () => {
    if (!window.db || saving) return;
    setSaving(true);
    setMessage('');
    try {
      await window.db.setCommissions({defaultPercent:defaultPct,entries:Object.entries(commissions).map(([name,percent])=>({name,percent}))});
      setMessage('Saved');
      setTimeout(() => setMessage(''), 2500);
    } catch (e) {
      setMessage('Error: ' + (e.message || e));
    } finally {
      setSaving(false);
    }
  };

  const handleAddReferrer = async () => {
    const name = prompt('Enter referrer name:');
    if (name && name.trim()) {
      const n = name.trim();
      if (referrers.some((r) => r.toLowerCase() === n.toLowerCase())) {
        setMessage('Referrer already exists');
        setTimeout(() => setMessage(''), 2000);
        return;
      }
      if (!window.db) return;
      try {
        await window.db.setCommissions({entries:[{name:n,percent:defaultPct}]});
        setReferrers((prev) => [...prev, n].sort());
        setCommissions((prev) => ({ ...prev, [n]: defaultPct }));
        setMessage('Added');
        setTimeout(() => setMessage(''), 2000);
      } catch (e) {
        setMessage('Error: ' + (e.message || e));
      }
    }
  };

  const filteredReferrers = search.trim()
    ? referrers.filter((n) => n.toLowerCase().includes(search.trim().toLowerCase()))
    : referrers;

  return (
    <div data-ui="container" style={styles.container} className="ui-page ui-referrercommission ">
      <div data-ui="header" style={styles.header}>
        <h1 data-ui="title" style={styles.title}>Referrer Commission</h1>
        <p data-ui="subtitle" style={styles.subtitle}>Adjust commission % for each referrer. Default is 45% of total bill value.</p>
      </div>

      <div data-ui="toolbar" style={styles.toolbar}>
        <input data-ui="searchInput"
          type="text"
          placeholder="Search referrer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={styles.searchInput}
        />
        <button data-ui="addBtn" type="button" style={styles.addBtn} onClick={handleAddReferrer}>
          + Add Referrer
        </button>
        <button data-ui="saveBtn" type="button" style={styles.saveBtn} onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save All'}
        </button>
        {message && <span data-message-type={message.startsWith('Error')?'error':'status'} role={message.startsWith('Error')?'alert':'status'} data-ui="message" style={styles.message}>{message}</span>}
      </div>

      <div data-ui="defaultSection" style={styles.defaultSection}>
        <label data-ui="defaultLabel" htmlFor="referrercommission-field-1" style={styles.defaultLabel}>Default commission (for new referrers):</label>
        <input data-ui="percentInput" id="referrercommission-field-1"
          type="number"
          min={0}
          max={100}
          step={0.5}
          value={defaultPct}
          onChange={(e) => handleDefaultChange(e.target.value)}
          style={styles.percentInput}
        />
        <span data-ui="percentSuffix" style={styles.percentSuffix}>%</span>
      </div>

      {loading ? (
        <div data-ui="loading" style={styles.loading}>Loading...</div>
      ) : (
        <div data-ui="tableWrap" style={styles.tableWrap}>
          <div data-ui="tableHeader" style={styles.tableHeader}>
            <span>Referrer</span>
            <span style={{ textAlign: 'right' }}>Commission %</span>
          </div>
          {filteredReferrers.map((name) => (
            <div data-ui="tableRow" key={name} style={styles.tableRow}>
              <span data-ui="nameCell" style={styles.nameCell}>{name}</span>
              <span data-ui="inpWrap" style={styles.inpWrap}>
                <input data-ui="percentInput"
                  aria-label={`${name} commission percentage`}
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={commissions[name] ?? defaultPct}
                  onChange={(e) => handleCommissionChange(name, e.target.value)}
                  style={styles.percentInput}
                />
                <span data-ui="percentSuffix" style={styles.percentSuffix}>%</span>
              </span>
            </div>
          ))}
          {filteredReferrers.length === 0 && (
            <div data-ui="empty" style={styles.empty}>
              No referrers yet. Add one above or they will appear when patients are registered with a referrer.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { maxWidth: 700, paddingBottom: 40 },
  header: { marginBottom: 20 },
  title: { fontSize: 22, fontWeight: 700, color: '#1e3a5f', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#666', margin: 0 },
  toolbar: { display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 16 },
  searchInput: { flex: 1, minWidth: 200, padding: '10px 14px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14 },
  addBtn: { padding: '10px 18px', borderRadius: 8, border: '1px solid #0d7377', background: '#fff', color: '#0d7377', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  saveBtn: { padding: '10px 20px', borderRadius: 8, border: 'none', background: '#0d7377', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  message: { color: '#0d7377', fontWeight: 600, fontSize: 14 },
  defaultSection: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, padding: 16, background: '#f8fafb', borderRadius: 8, border: '1px solid #e2e8f0' },
  defaultLabel: { fontSize: 14, fontWeight: 600, color: '#475569' },
  percentInput: { width: 80, padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14, textAlign: 'right' },
  percentSuffix: { fontSize: 14, color: '#64748b', marginLeft: 4 },
  loading: { padding: 32, textAlign: 'center', color: '#666' },
  tableWrap: { background: '#fff', borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid #eee', overflow: 'hidden' },
  tableHeader: {
    display: 'grid',
    gridTemplateColumns: '1fr 120px',
    gap: 16,
    padding: '12px 16px',
    background: '#f8fafb',
    fontWeight: 600,
    fontSize: 12,
    color: '#64748b',
    borderBottom: '2px solid #e2e8f0',
  },
  tableRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 120px',
    gap: 16,
    padding: '12px 16px',
    borderBottom: '1px solid #f0f0f0',
    fontSize: 14,
    alignItems: 'center',
  },
  nameCell: { fontWeight: 500 },
  inpWrap: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center' },
  empty: { padding: 32, textAlign: 'center', color: '#666', fontSize: 14 },
};
