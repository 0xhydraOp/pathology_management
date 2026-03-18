import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function NewRegistration() {
  const navigate = useNavigate();
  const [parameters, setParameters] = useState([]);
  const [referrerSuggestions, setReferrerSuggestions] = useState([]);
  const [formVisible, setFormVisible] = useState(false);
  const [form, setForm] = useState({
    name: '',
    age: '',
    sex: 'male',
    phone: '',
    address: '',
    referred_by: '',
    tests: [],
  });
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState('');
  const STORAGE_KEY = 'mondal_new_registration_draft';

  useEffect(() => {
    if (window.db) {
      window.db.all('SELECT id, code, name, section, display_order, type FROM parameters ORDER BY section, display_order')
        .then((rows) => setParameters(rows || []))
        .catch(console.error);
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
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.tests)) {
          const validIds = new Set(parameters.map((p) => p.id));
          const validTests = (parsed.tests || []).filter((id) => validIds.has(id));
          setForm((prev) => ({ ...prev, ...parsed, tests: validTests }));
        }
      }
    } catch (_) {}
  }, [formVisible, parameters]);

  useEffect(() => {
    if (!formVisible || (!form.name && !(form.referred_by ?? '').trim() && form.tests.length === 0)) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
    } catch (_) {}
  }, [form, formVisible]);

  const referredByRef = useRef(null);
  useEffect(() => {
    if ((form.referred_by?.length ?? 0) < 2 || !window.db) {
      setReferrerSuggestions([]);
      referredByRef.current = null;
      return;
    }
    const q = form.referred_by;
    referredByRef.current = q;
    const id = setTimeout(() => {
      window.db.all(
        `SELECT DISTINCT referred_by FROM patients WHERE referred_by LIKE ? AND referred_by != '' LIMIT 10`,
        [`%${q}%`]
      ).then((rows) => {
        if (referredByRef.current === q) setReferrerSuggestions((rows || []).map((r) => r.referred_by));
      }).catch(() => {
        if (referredByRef.current === q) setReferrerSuggestions([]);
      });
    }, 300);
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
      alert('Please select at least one test.');
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

      const orderDate = toLocalDateStr(new Date());
      const orderRes = await window.db.run(
        `INSERT INTO orders (patient_id, referring_doctor, order_date, status) VALUES (?, ?, ?, 'pending')`,
        [pid, form.referred_by || null, orderDate]
      );
      const orderId = orderRes?.lastInsertRowid ?? (await window.db.get('SELECT id FROM orders WHERE patient_id = ? ORDER BY id DESC LIMIT 1', [pid]))?.id;

      for (let i = 0; i < form.tests.length; i++) {
        await window.db.run(`INSERT INTO order_tests (order_id, parameter_id, display_order) VALUES (?, ?, ?)`, [
          orderId,
          form.tests[i],
          i + 1,
        ]);
      }

      setForm({ name: '', age: '', sex: 'male', phone: '', address: '', referred_by: '', tests: [] });
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
      alert('Error saving. Please try again.');
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

  const sectionOrder = ['Hematology', 'Biochemistry', 'LFT', 'KFT', 'Lipid', 'Serology', 'Immunology/Serology', 'Blood Group Tests', 'Surgery', 'C-Section', 'Other'];
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
        <button style={styles.addPatientBtn} onClick={() => setFormVisible(true)}>+ Add patient</button>
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
            <input
              tabIndex={6}
              value={form.referred_by ?? ''}
              onChange={(e) => setForm({ ...form, referred_by: e.target.value })}
              style={styles.input}
              list="referrers"
              placeholder="Doctor / Clinic name (type to see suggestions)"
            />
            <datalist id="referrers">
              {referrerSuggestions.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </div>
        </div>

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Tests to be done</h3>
          <p style={styles.testHint}>Tick each test required. Includes Surgery tests (hysterectomy, fissurectomy, appendix, normal delivery, gallbladder, hernia) for Indian rural labs.</p>
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
          <button tabIndex={7} type="submit" style={styles.btnPrimary} disabled={saving}>
            {saving ? 'Saving...' : 'Save & Go to Result Entry'}
          </button>
          <button type="button" onClick={() => setFormVisible(false)} style={styles.btnSecondary}>
            Close form
          </button>
          <button type="button" onClick={() => navigate('/')} style={styles.btnSecondary}>
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
  testHint: { fontSize: 13, color: '#666', marginBottom: 16 },
  testGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20 },
  testGroup: { background: '#f8f9fa', padding: 16, borderRadius: 8, border: '1px solid #eee' },
  testGroupTitle: { fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#0d7377' },
  testList: { display: 'flex', flexDirection: 'column', gap: 8 },
  checkLabel: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 },
  actions: { display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 24 },
  btnPrimary: { background: '#0d7377', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 8, fontWeight: 600, fontSize: 15 },
  btnSecondary: { background: '#eee', border: 'none', padding: '12px 24px', borderRadius: 8, fontSize: 15 },
};
