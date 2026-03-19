import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { showToast } from '../utils/toastBus';

function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function NewRegistration() {
  const navigate = useNavigate();
  const [parameters, setParameters] = useState([]);
  const [parametersLoading, setParametersLoading] = useState(true);
  const [referrerSuggestions, setReferrerSuggestions] = useState([]);
  const [formVisible, setFormVisible] = useState(false);
  const [form, setForm] = useState({
    name: '',
    age: '',
    sex: 'male',
    phone: '',
    address: '',
    referred_by: 'Self',
    tests: [],
  });
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState('');
  const STORAGE_KEY = 'mondal_new_registration_draft';

  const emptyRegistrationForm = () => ({
    name: '',
    age: '',
    sex: 'male',
    phone: '',
    address: '',
    referred_by: 'Self',
    tests: [],
  });

  useEffect(() => {
    if (window.db) {
      window.db
        .all('SELECT id, code, name, section, display_order, type FROM parameters ORDER BY section, display_order')
        .then((rows) => setParameters(rows || []))
        .catch(console.error)
        .finally(() => setParametersLoading(false));
    } else {
      setParametersLoading(false);
    }
  }, []);

  const hasRestoredDraftRef = useRef(false);
  useEffect(() => {
    if (!formVisible) {
      hasRestoredDraftRef.current = false;
      return;
    }
    if (hasRestoredDraftRef.current || parameters.length === 0) return;
    hasRestoredDraftRef.current = true;
    /** Always open with no tests ticked; draft only restores patient/referrer fields (not test selection). */
    const base = emptyRegistrationForm();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          const ref = parsed.referred_by != null ? String(parsed.referred_by).trim() : '';
          setForm({
            ...base,
            name: typeof parsed.name === 'string' ? parsed.name : '',
            age: parsed.age != null && parsed.age !== '' ? String(parsed.age) : '',
            sex: parsed.sex === 'female' ? 'female' : 'male',
            phone: typeof parsed.phone === 'string' ? parsed.phone : '',
            address: typeof parsed.address === 'string' ? parsed.address : '',
            referred_by: ref !== '' ? parsed.referred_by : 'Self',
            tests: [],
          });
          return;
        }
      }
      setForm(base);
    } catch (_) {
      setForm(base);
    }
  }, [formVisible, parameters]);

  useEffect(() => {
    if (!formVisible) return;
    const ref = (form.referred_by ?? '').trim();
    const meaningfulRef = ref && ref.toLowerCase() !== 'self';
    if (!form.name && !meaningfulRef && !form.phone && !form.address && form.tests.length === 0) return;
    try {
      const draft = {
        name: form.name,
        age: form.age,
        sex: form.sex,
        phone: form.phone,
        address: form.address,
        referred_by: form.referred_by,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch (_) {}
  }, [form, formVisible]);

  const referredByRef = useRef(null);
  useEffect(() => {
    const q = (form.referred_by ?? '').trim();
    if (q.length < 1 || !window.db) {
      setReferrerSuggestions([]);
      referredByRef.current = null;
      return;
    }
    referredByRef.current = q;
    const id = setTimeout(() => {
      window.db.all(
        `SELECT name FROM (
          SELECT DISTINCT referred_by as name FROM patients WHERE referred_by LIKE ? AND referred_by != ''
          UNION
          SELECT referrer_name as name FROM referrer_commission_pct WHERE referrer_name LIKE ?
        ) ORDER BY name LIMIT 15`,
        [`%${q}%`, `%${q}%`]
      ).then((rows) => {
        if (referredByRef.current === q) setReferrerSuggestions((rows || []).map((r) => r.name));
      }).catch(() => {
        if (referredByRef.current === q) setReferrerSuggestions([]);
      });
    }, 200);
    return () => {
      clearTimeout(id);
      referredByRef.current = null;
    };
  }, [form.referred_by]);

  const toggleTest = (paramId) => {
    setForm((prev) => {
      const has = prev.tests.includes(paramId);
      if (has) return { ...prev, tests: prev.tests.filter((t) => t !== paramId) };
      return { ...prev, tests: [...prev.tests, paramId] };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !window.db) return;
    if (form.tests.length === 0) {
      showToast('Please select at least one test.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const patientId = await window.db.nextPatientId();
      const patientRes = await window.db.run(
        `INSERT INTO patients (patient_id, name, age, sex, phone, address, referred_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          patientId,
          form.name.trim(),
          form.age ? parseInt(form.age) : null,
          form.sex,
          form.phone || null,
          form.address || null,
          form.referred_by || null,
        ]
      );
      const pid = patientRes?.lastInsertRowid ?? (await window.db.get('SELECT id FROM patients WHERE patient_id = ?', [patientId]))?.id;
      if (!pid) {
        showToast('Could not save patient record. Please try again.', 'error');
        return;
      }

      const orderDate = toLocalDateStr(new Date());
      const orderRes = await window.db.run(
        `INSERT INTO orders (patient_id, referring_doctor, order_date, status) VALUES (?, ?, ?, 'pending')`,
        [pid, form.referred_by || null, orderDate]
      );
      const orderId = orderRes?.lastInsertRowid ?? (await window.db.get('SELECT id FROM orders WHERE patient_id = ? ORDER BY id DESC LIMIT 1', [pid]))?.id;
      if (!orderId) {
        showToast('Could not create bill for this patient. Please try again.', 'error');
        return;
      }

      for (let i = 0; i < form.tests.length; i++) {
        await window.db.run(`INSERT INTO order_tests (order_id, parameter_id, display_order) VALUES (?, ?, ?)`, [
          orderId,
          form.tests[i],
          i + 1,
        ]);
      }

      await window.db.computeOrderBillAndCommission(orderId);

      setForm(emptyRegistrationForm());
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
      setSaveFeedback('Saved');
      const validOrderId = orderId && !isNaN(parseInt(orderId, 10));
      setTimeout(() => {
        setSaveFeedback('');
        if (validOrderId) navigate(`/result-entry?order=${orderId}`);
        else navigate('/result-entry');
      }, 600);
    } catch (err) {
      console.error(err);
      showToast('Error saving. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const testsBySection = parameters.reduce((acc, p) => {
    const sec = p.section || 'Other';
    if (!acc[sec]) acc[sec] = [];
    acc[sec].push(p);
    return acc;
  }, {});

  const sectionOrder = ['DEPARTMENT OF HEMATOLOGY', 'DEPARTMENT OF BIOCHEMISTRY', 'DEPARTMENT OF LIVER FUNCTION TEST', 'DEPARTMENT OF KIDNEY FUNCTION TEST', 'DEPARTMENT OF LIPID PROFILE', 'DEPARTMENT OF SEROLOGY', 'DEPARTMENT OF IMMUNOLOGY', 'DEPARTMENT OF BLOOD GROUP TESTS', 'DEPARTMENT OF COAGULATION', 'DEPARTMENT OF CLINICAL PATHOLOGY', 'Other'];
  const orderedSections = Object.keys(testsBySection).sort((a, b) => {
    const ia = sectionOrder.indexOf(a);
    const ib = sectionOrder.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.localeCompare(b);
  });

  if (!formVisible) {
    return (
      <div style={styles.container}>
        <h1 style={styles.title}>New Registration</h1>
        <p style={styles.subtitle}>Double-click below to open the registration form.</p>
        <div
          className="new-register-card"
          style={styles.registerCard}
          onDoubleClick={() => setFormVisible(true)}
          onClick={() => setFormVisible(true)}
          title="Click to register new patient"
        >
          <span style={styles.registerIcon}>⊕</span>
          <span style={styles.registerText}>Register new patient</span>
          <span style={styles.registerHint}>Click or double-click to open form</span>
        </div>
        <button type="button" style={styles.addPatientBtn} onClick={() => setFormVisible(true)}>+ Add patient</button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>New Registration</h1>
      <p style={styles.subtitle}>Fill patient details, referrer, and tick tests required.</p>

      <form style={styles.form} onSubmit={handleSubmit}>
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Patient Details</h3>
          <div style={styles.grid}>
            <div style={styles.field}>
              <label>Name *</label>
              <input
                tabIndex={1}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                style={styles.input}
                placeholder="Patient full name"
              />
            </div>
            <div style={styles.field}>
              <label>Age (years)</label>
              <input
                tabIndex={2}
                type="number"
                value={form.age}
                onChange={(e) => setForm({ ...form, age: e.target.value })}
                style={styles.input}
                min="0"
                placeholder="e.g. 45"
              />
            </div>
            <div style={styles.field}>
              <label>Sex</label>
              <select tabIndex={3} value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })} style={styles.input}>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <div style={styles.field}>
              <label>Phone</label>
              <input
                tabIndex={4}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                style={styles.input}
                placeholder="Phone number"
              />
            </div>
          </div>
          <div style={styles.field}>
            <label>Address</label>
            <textarea
              tabIndex={5}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              style={styles.input}
              rows={2}
              placeholder="Full address"
            />
          </div>
          <div style={styles.field}>
            <label>Referred by</label>
            <div style={styles.referredByWrap}>
              <input
                tabIndex={6}
                value={form.referred_by ?? ''}
                onChange={(e) => setForm({ ...form, referred_by: e.target.value })}
                style={{ ...styles.input, ...styles.referredByInput }}
                list="referrers"
                placeholder="Type 1–2 letters to search, or click Self for walk-in"
              />
              <button
                type="button"
                tabIndex={7}
                onClick={() => setForm((prev) => ({ ...prev, referred_by: prev.referred_by === 'Self' ? '' : 'Self' }))}
                style={{ ...styles.selfBtn, ...(form.referred_by === 'Self' ? styles.selfBtnActive : {}) }}
                title="Walk-in patient (toggle to clear)"
              >
                Self
              </button>
              <button
                type="button"
                tabIndex={8}
                onClick={() => setForm({ ...form, referred_by: '' })}
                style={styles.clearBtn}
                title="Clear referrer"
              >
                Clear
              </button>
            </div>
            <datalist id="referrers">
              <option value="Self" />
              {referrerSuggestions.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </div>
        </div>

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Tests to be done</h3>
          <p style={styles.testHint}>Tick each test required. Tests are grouped by department (same sections as in Test Prices / reports).</p>
          {!parametersLoading && parameters.length === 0 && (
            <div style={styles.catalogueWarning}>
              <strong>No tests in the catalogue.</strong> This usually happens if the app was installed from a build that did not bundle catalogue JSON, or the catalogue was never loaded.
              <div style={{ marginTop: 10 }}>
                Go to <button type="button" style={styles.catalogueLinkBtn} onClick={() => navigate('/settings')}>Settings</button>
                {' '}and click <strong>Reload Catalogue</strong>. If that does not help, update the app or reinstall from a build that includes <code style={styles.codeTiny}>pathology_parameters.json</code>.
              </div>
            </div>
          )}
          {parametersLoading && <p style={styles.testHint}>Loading test list…</p>}
          <div style={styles.testGrid}>
            {orderedSections.map((sectionName) => {
              const sectionParams = testsBySection[sectionName];
              return (
              <div key={sectionName} style={styles.testGroup}>
                <div style={styles.testGroupTitle}>{sectionName}</div>
                <div style={styles.testList}>
                  {sectionParams.map((p) => (
                    <label key={p.id} style={styles.checkLabel}>
                      <input
                        type="checkbox"
                        checked={form.tests.includes(p.id)}
                        onChange={() => toggleTest(p.id)}
                      />
                      {p.name}
                    </label>
                  ))}
                </div>
              </div>
            );
            })}
          </div>
        </div>

        {saveFeedback && <p style={{ color: '#0d7377', marginBottom: 12, fontSize: 14 }}>{saveFeedback}</p>}
        <div style={styles.actions}>
          <button tabIndex={9} type="submit" style={styles.btnPrimary} disabled={saving}>
            {saving ? 'Saving...' : 'Save & Go to Result Entry'}
          </button>
          <button type="button" tabIndex={10} onClick={() => setFormVisible(false)} style={styles.btnSecondary}>
            Close form
          </button>
          <button type="button" tabIndex={11} onClick={() => navigate('/')} style={styles.btnSecondary}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

const styles = {
  container: { maxWidth: 800 },
  title: { fontSize: 20, fontWeight: 600, marginBottom: 8, color: '#1e3a5f' },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 24 },
  registerCard: {
    background: 'linear-gradient(135deg, #0d7377 0%, #14a3a8 100%)',
    color: '#fff',
    padding: 48,
    borderRadius: 12,
    textAlign: 'center',
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(13,115,119,0.3)',
    border: '2px dashed rgba(255,255,255,0.4)',
  },
  registerIcon: { fontSize: 48, display: 'block', marginBottom: 12 },
  registerText: { fontSize: 22, fontWeight: 700, display: 'block', marginBottom: 8 },
  registerHint: { fontSize: 13, opacity: 0.9 },
  addPatientBtn: { marginTop: 20, padding: '12px 24px', borderRadius: 8, border: '2px solid #0d7377', background: '#fff', color: '#0d7377', fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  form: { background: '#fff', padding: 24, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 15, fontWeight: 600, marginBottom: 12, color: '#333' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 },
  field: { marginBottom: 16 },
  input: { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14 },
  referredByWrap: { display: 'flex', gap: 6, alignItems: 'center' },
  referredByInput: { flex: 1, minWidth: 0 },
  selfBtn: { padding: '10px 16px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  selfBtnActive: { background: '#0d7377', color: '#fff', borderColor: '#0d7377' },
  clearBtn: { padding: '10px 14px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', color: '#64748b' },
  testHint: { fontSize: 13, color: '#666', marginBottom: 16 },
  testGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20 },
  testGroup: { background: '#f8f9fa', padding: 16, borderRadius: 8, border: '1px solid #eee' },
  testGroupTitle: { fontSize: 14, fontWeight: 700, marginBottom: 12, color: '#0d7377', textTransform: 'uppercase' },
  testList: { display: 'flex', flexDirection: 'column', gap: 8 },
  checkLabel: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 },
  actions: { display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 24 },
  btnPrimary: { background: '#0d7377', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 8, fontWeight: 600, fontSize: 15 },
  btnSecondary: { background: '#eee', border: 'none', padding: '12px 24px', borderRadius: 8, fontSize: 15 },
  catalogueWarning: {
    background: '#fff7ed',
    border: '1px solid #fdba74',
    color: '#9a3412',
    padding: 14,
    borderRadius: 8,
    marginBottom: 16,
    fontSize: 14,
    lineHeight: 1.5,
  },
  catalogueLinkBtn: {
    background: '#0d7377',
    color: '#fff',
    border: 'none',
    padding: '6px 14px',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  codeTiny: { fontSize: 12, background: '#fee2e2', padding: '2px 6px', borderRadius: 4 },
};
