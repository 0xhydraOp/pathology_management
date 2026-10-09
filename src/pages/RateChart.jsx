import { useState, useEffect, useCallback, useRef } from 'react';

export default function RateChart() {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [rates, setRates] = useState({});
  const saveBusy = useRef(false);

  const loadTests = useCallback(async () => {
    if (!window.db) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await window.db.read('catalogue.rates', []);
      setTests(rows || []);
      const ratesMap = {};
      (rows || []).forEach((r) => { ratesMap[r.id] = String(r.rate ?? 0); });
      setRates(ratesMap);
    } catch (e) {
      console.error(e);
      setTests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTests();
  }, [loadTests]);

  const handleRateChange = (paramId, value) => {
    setRates((prev) => ({ ...prev, [paramId]: value }));
  };

  const handleSave = async () => {
    if (!window.db || saveBusy.current) return;
    saveBusy.current = true;
    setSaving(true);
    setMessage('');
    try {
      const changes=Object.entries(rates).map(([parameterId,raw])=>{
        if(!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(String(raw)) || !Number.isFinite(Number(raw)))throw new Error('Enter a non-negative price with at most two decimal places. Blank or malformed prices are not saved.');
        return {parameterId:Number(parameterId),rate:Number(raw)};
      });
      await window.db.setRates(changes);
      setMessage('Saved');
      setTimeout(() => setMessage(''), 2500);
    } catch (e) {
      setMessage('Error: ' + (e.message || e));
    } finally {
      saveBusy.current = false;
      setSaving(false);
    }
  };

  const handleReset = () => {
    const ratesMap = {};
    tests.forEach((r) => { ratesMap[r.id] = String(r.rate ?? 0); });
    setRates(ratesMap);
    setMessage('Reset to saved values');
    setTimeout(() => setMessage(''), 2000);
  };

  const filteredTests = search.trim()
    ? tests.filter(
        (t) =>
          (t.name || '').toLowerCase().includes(search.trim().toLowerCase()) ||
          (t.code || '').toLowerCase().includes(search.trim().toLowerCase())
      )
    : tests;

  const sections = [...new Set(filteredTests.map((t) => t.section || 'Other'))].sort();
  const groupedBySection = sections.map((s) => ({
    section: s,
    items: filteredTests.filter((t) => (t.section || 'Other') === s),
  }));

  return (
    <div data-ui="container" style={styles.container} className="ui-page ui-ratechart ">
      <div data-ui="header" style={styles.header}>
        <h1 data-ui="title" style={styles.title}>Test Prices</h1>
        <p data-ui="subtitle" style={styles.subtitle}>Edit test rates to increase or decrease prices. Changes apply to new orders.</p>
      </div>

      <div data-ui="toolbar" style={styles.toolbar}>
        <input data-ui="searchInput"
          type="text"
          placeholder="Search test name or code..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={styles.searchInput}
        />
        <button data-ui="saveBtn" type="button" style={styles.saveBtn} onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save All'}
        </button>
        <button data-ui="resetBtn" type="button" style={styles.resetBtn} onClick={handleReset} disabled={saving}>
          Reset
        </button>
        {message && <span data-message-type={message.startsWith('Error')?'error':'status'} role={message.startsWith('Error')?'alert':'status'} data-ui="message" style={styles.message}>{message}</span>}
      </div>

      {loading ? (
        <div data-ui="loading" style={styles.loading}>Loading...</div>
      ) : (
        <div data-ui="tableWrap" style={styles.tableWrap}>
          <div data-ui="tableHeader" style={styles.tableHeader}>
            <span>Test</span>
            <span>Code</span>
            <span style={{ textAlign: 'right' }}>Rate (₹)</span>
          </div>
          {groupedBySection.map(({ section, items }) => (
            <div key={section}>
              <div data-ui="sectionHeader" style={styles.sectionHeader}>{section}</div>
              {items.map((t) => (
                <div data-ui="tableRow" key={t.id} style={styles.tableRow}>
                  <span data-ui="nameCell" style={styles.nameCell}>{t.name}</span>
                  <span data-ui="codeCell" style={styles.codeCell}>{t.code}</span>
                  <span data-ui="inpWrap" style={styles.inpWrap}>
                    <input data-ui="rateInput"
                      aria-label={`${t.name} rate`}
                      type="text"
                      inputMode="decimal"
                      maxLength={32}
                      disabled={saving}
                      value={rates[t.id] ?? 0}
                      onChange={(e) => handleRateChange(t.id, e.target.value)}
                      style={styles.rateInput}
                    />
                  </span>
                </div>
              ))}
            </div>
          ))}
          {filteredTests.length === 0 && (
            <div data-ui="empty" style={styles.empty}>No tests found</div>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { maxWidth: 900, paddingBottom: 40 },
  header: { marginBottom: 20 },
  title: { fontSize: 22, fontWeight: 700, color: '#1e3a5f', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#666', margin: 0 },
  toolbar: { display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 16 },
  searchInput: { flex: 1, minWidth: 200, padding: '10px 14px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14 },
  saveBtn: { padding: '10px 20px', borderRadius: 8, border: 'none', background: '#0d7377', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  resetBtn: { padding: '10px 18px', borderRadius: 8, border: '1px solid #0d7377', background: '#fff', color: '#0d7377', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  message: { color: '#0d7377', fontWeight: 600, fontSize: 14 },
  loading: { padding: 32, textAlign: 'center', color: '#666' },
  tableWrap: { background: '#fff', borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid #eee', overflow: 'hidden' },
  tableHeader: {
    display: 'grid',
    gridTemplateColumns: '1fr 120px 100px',
    gap: 12,
    padding: '12px 16px',
    background: '#f8fafb',
    fontWeight: 600,
    fontSize: 12,
    color: '#64748b',
    borderBottom: '2px solid #e2e8f0',
  },
  sectionHeader: {
    padding: '8px 16px',
    background: '#e8f4f4',
    fontSize: 13,
    fontWeight: 600,
    color: '#0d7377',
    borderBottom: '1px solid #d0e8e8',
    wordBreak: 'break-word',
  },
  tableRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 120px 100px',
    gap: 12,
    padding: '10px 16px',
    borderBottom: '1px solid #f0f0f0',
    fontSize: 14,
    alignItems: 'center',
  },
  nameCell: { fontWeight: 500, minWidth: 0, wordBreak: 'break-word' },
  codeCell: { fontFamily: 'monospace', fontSize: 12, color: '#64748b' },
  inpWrap: { display: 'flex', justifyContent: 'flex-end' },
  rateInput: { width: 90, padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14, textAlign: 'right' },
  empty: { padding: 32, textAlign: 'center', color: '#666' },
};
