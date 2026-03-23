import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { formatOrderDateMediumIN } from '../utils/dateDisplay';
import { showToast } from '../utils/toastBus';
import { keyboardActivateHandler } from '../utils/keyboardClick';

function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDateRangeForFilter(period) {
  const now = new Date();
  const today = toLocalDateStr(now);
  if (period === 'today') return [today, today];
  if (period === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    return [toLocalDateStr(d), today];
  }
  if (period === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return [toLocalDateStr(start), toLocalDateStr(end)];
  }
  return [null, null]; // all
}

function BatchEntryMode({ onClose, loadPendingOrders }) {
  const [params, setParams] = useState([]);
  const [paramsLoaded, setParamsLoaded] = useState(false);
  const [rangesByParam, setRangesByParam] = useState({});
  const [allOrders, setAllOrders] = useState([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [ordersWithParam, setOrdersWithParam] = useState([]);
  const [selectedParam, setSelectedParam] = useState(null);
  const [values, setValues] = useState({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!window.db) return;
    window.db.all(`SELECT id, code, name, unit, decimal_places, min_allowed_value, max_allowed_value FROM parameters WHERE type='numeric' ORDER BY section, display_order`)
      .then((rows) => { setParams(rows || []); setParamsLoaded(true); });
    window.db.all(`SELECT parameter_id, sex, min_age, max_age, low_value, high_value, critical_low, critical_high FROM parameter_ranges`)
      .then((rows) => {
        const map = {};
        (rows || []).forEach((row) => {
          if (!map[row.parameter_id]) map[row.parameter_id] = [];
          map[row.parameter_id].push(row);
        });
        setRangesByParam(map);
      });
    window.db.all(
      `SELECT o.id, o.order_date, p.patient_id, p.name as patient_name, p.age, p.sex
       FROM orders o JOIN patients p ON o.patient_id = p.id
       WHERE o.status IN ('pending','partial')
       ORDER BY o.order_date DESC, o.id DESC`
    ).then((rows) => { setAllOrders(rows || []); setOrdersLoaded(true); });
  }, []);

  useEffect(() => {
    if (params.length > 0 && !selectedParam) setSelectedParam(params[0]);
  }, [params]);

  useEffect(() => {
    if (!window.db || !selectedParam) {
      setOrdersWithParam(allOrders);
      return;
    }
    if (allOrders.length === 0) {
      setOrdersWithParam([]);
      return;
    }
    window.db.all(
      `SELECT o.id FROM order_tests ot JOIN orders o ON ot.order_id = o.id
       WHERE ot.parameter_id = ? AND o.status IN ('pending','partial')`,
      [selectedParam.id]
    ).then((rows) => {
      const ids = new Set((rows || []).map((r) => r.id));
      setOrdersWithParam(allOrders.filter((o) => ids.has(o.id)));
    });
  }, [selectedParam?.id, allOrders]);

  const orders = ordersWithParam;
  const currentOrder = orders[currentIdx];

  const getOrderRange = useCallback((order, parameterId) => {
    const age = order?.age ?? 30;
    const sex = order?.sex || 'any';
    const ranges = rangesByParam[parameterId] || [];
    let best = null;
    ranges.forEach((r) => {
      const match = (r.sex === 'any' || r.sex === sex) && age >= (r.min_age ?? 0) && age <= (r.max_age ?? 150);
      if (match && (!best || (r.sex !== 'any' && best.sex === 'any'))) best = r;
    });
    return best
      ? { low: best.low_value, high: best.high_value, criticalLow: best.critical_low, criticalHigh: best.critical_high }
      : null;
  }, [rangesByParam]);

  useEffect(() => {
    setCurrentIdx(0);
  }, [selectedParam?.id]);

  const saveCurrentAndNext = async () => {
    if (!window.db || !selectedParam || !currentOrder) return;
    const val = values[currentOrder.id];
    if (val === undefined || val === '' || val == null) {
      setCurrentIdx((i) => Math.min(i + 1, orders.length - 1));
      return;
    }
    const numVal = parseFloat(val);
    if (isNaN(numVal)) return;
    if (selectedParam.min_allowed_value != null && numVal < selectedParam.min_allowed_value) {
      showToast(`${selectedParam.name}: Value must be >= ${selectedParam.min_allowed_value}`, 'warning');
      return;
    }
    if (selectedParam.max_allowed_value != null && numVal > selectedParam.max_allowed_value) {
      showToast(`${selectedParam.name}: Value must be <= ${selectedParam.max_allowed_value}`, 'warning');
      return;
    }
    setSaving(true);
    try {
      const flag = computeFlag(numVal, getOrderRange(currentOrder, selectedParam.id));
      await window.db.run(
        `INSERT INTO order_results (order_id, parameter_id, result_value, result_text, flag) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(order_id, parameter_id) DO UPDATE SET result_value=excluded.result_value, result_text=excluded.result_text, flag=excluded.flag`,
        [currentOrder.id, selectedParam.id, numVal, null, flag]
      );
      const counts = await window.db.get(
        `SELECT
           (SELECT COUNT(*) FROM order_tests WHERE order_id = ?) AS total_tests,
           (SELECT COUNT(*) FROM order_results WHERE order_id = ? AND (
             result_value IS NOT NULL OR (result_text IS NOT NULL AND TRIM(result_text) != '')
           )) AS filled_tests`,
        [currentOrder.id, currentOrder.id]
      );
      const total = Number(counts?.total_tests) || 0;
      const filled = Number(counts?.filled_tests) || 0;
      const status = filled >= total && total > 0 ? 'complete' : filled > 0 ? 'partial' : 'pending';
      await window.db.run('UPDATE orders SET status = ? WHERE id = ?', [status, currentOrder.id]);
      setValues((v) => ({ ...v, [currentOrder.id]: val }));
      if (currentIdx < orders.length - 1) {
        setCurrentIdx((i) => i + 1);
        setTimeout(() => inputRef.current?.focus(), 50);
      } else {
        loadPendingOrders?.();
        onClose();
      }
    } catch (e) {
      console.error(e);
      showToast('Error saving.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (ordersLoaded && allOrders.length === 0) {
    return (
      <div style={styles.container} className="result-entry-page">
        <h1 style={styles.title}>Batch Entry</h1>
        <p style={styles.subtitle}>No pending orders. Register patients and add tests first.</p>
        <button type="button" style={styles.btnSecondary} onClick={onClose}>Back</button>
      </div>
    );
  }
  if (paramsLoaded && params.length === 0) {
    return (
      <div style={styles.container} className="result-entry-page">
        <h1 style={styles.title}>Batch Entry</h1>
        <p style={styles.subtitle}>No numeric test parameters found. Add parameters in Settings first.</p>
        <button type="button" style={styles.btnSecondary} onClick={onClose}>Back</button>
      </div>
    );
  }
  if (!selectedParam) return <div style={styles.loading}>Loading...</div>;
  if (orders.length === 0) {
    return (
      <div style={styles.container} className="result-entry-page">
        <h1 style={styles.title}>Batch Entry</h1>
        <p style={styles.subtitle}>No pending orders have the selected test. Try another test or add orders first.</p>
        <button type="button" style={styles.btnSecondary} onClick={onClose}>Back</button>
      </div>
    );
  }

  return (
    <div style={styles.container} className="result-entry-page">
      <h1 style={styles.title}>Batch Entry â€” {selectedParam.name}</h1>
      <p style={styles.subtitle}>Enter {selectedParam.name} for each patient. Press Enter to save and move to next.</p>
      <div style={styles.batchToolbar}>
        <label>Test: </label>
        <select value={selectedParam.id} onChange={(e) => setSelectedParam(params.find((p) => p.id === parseInt(e.target.value)))} style={styles.filterSelect}>
          {params.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <span style={{ marginLeft: 16, color: '#666' }}>{currentIdx + 1} / {orders.length}</span>
      </div>
      {currentOrder && (
        <div style={styles.card}>
          <div style={styles.patientBar}>
            <strong>{currentOrder.patient_name}</strong> ({currentOrder.patient_id}) â€” Order #{currentOrder.id}
          </div>
          <div style={styles.batchInputRow}>
            <label>{selectedParam.name} ({selectedParam.unit || 'â€”'}):</label>
            <input
              ref={inputRef}
              type="number"
              value={values[currentOrder.id] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [currentOrder.id]: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && saveCurrentAndNext()}
              style={styles.input}
              autoFocus
            />
            <button type="button" style={styles.btnPrimary} onClick={saveCurrentAndNext} disabled={saving}>
              {saving ? 'Saving...' : 'Save & Next'}
            </button>
          </div>
        </div>
      )}
      <button type="button" style={styles.btnSecondary} onClick={onClose}>Cancel / Done</button>
    </div>
  );
}

function getRange(patient, ranges) {
  if (!ranges?.length) return null;
  const age = patient?.age ?? 30;
  const sex = patient?.sex || 'any';
  for (const r of ranges) {
    if ((r.sex === 'any' || r.sex === sex) && age >= (r.min_age ?? 0) && age <= (r.max_age ?? 150)) {
      return { low: r.low_value, high: r.high_value, criticalLow: r.critical_low, criticalHigh: r.critical_high };
    }
  }
  return null;
}

function computeFlag(val, range) {
  if (val == null || val === '' || !range) return 'N';
  const v = parseFloat(val);
  if (range.criticalLow != null && v < range.criticalLow) return 'C';
  if (range.criticalHigh != null && v > range.criticalHigh) return 'C';
  if (range.low != null && v < range.low) return 'L';
  if (range.high != null && v > range.high) return 'H';
  return 'N';
}

function evalFormula(formula, valuesByCode) {
  try {
    let expr = formula;
    for (const [code, val] of Object.entries(valuesByCode)) {
      const n = parseFloat(val);
      if (isNaN(n)) return null;
      expr = expr.replace(new RegExp(`\\b${code}\\b`, 'g'), String(n));
    }
    return Function(`"use strict"; return (${expr})`)();
  } catch {
    return null;
  }
}

export default function ResultEntrySimple() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const orderIdParam = searchParams.get('order');

  const [step, setStep] = useState(orderIdParam ? 'entry' : 'select');
  const [search, setSearch] = useState('');
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [order, setOrder] = useState(null);
  const [patient, setPatient] = useState(null);
  const [tests, setTests] = useState([]);
  const [results, setResults] = useState({});
  const [ranges, setRanges] = useState({});
  const [formulas, setFormulas] = useState({});
  const [criticalPending, setCriticalPending] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [pendingDateFilter, setPendingDateFilter] = useState('all');
  const [pendingSearch, setPendingSearch] = useState('');
  const [pendingRefreshLoading, setPendingRefreshLoading] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [sectionCollapsed, setSectionCollapsed] = useState({});
  const [showValidationSummary, setShowValidationSummary] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [testSearch, setTestSearch] = useState('');

  const loadPendingOrders = useCallback(async (forceRefresh = false) => {
    if (!window.db) return;
    if (!forceRefresh && step !== 'select') return;
    setPendingRefreshLoading(true);
    try {
      const [dateFrom, dateTo] = getDateRangeForFilter(pendingDateFilter);
      let sql = `SELECT o.id, o.order_date, o.status, p.patient_id, p.name as patient_name, p.referred_by
         FROM orders o JOIN patients p ON o.patient_id = p.id
         WHERE o.status IN ('pending','partial')`;
      const args = [];
      if (dateFrom && dateTo) {
        sql += ` AND date(o.order_date) >= ? AND date(o.order_date) <= ?`;
        args.push(dateFrom, dateTo);
      }
      sql += ` ORDER BY o.order_date DESC, o.id DESC`;
      const rows = await window.db.all(sql, args);
      setPendingOrders(rows || []);
    } catch (e) {
      console.error(e);
      setPendingOrders([]);
    } finally {
      setPendingRefreshLoading(false);
    }
  }, [step, pendingDateFilter]);

  useEffect(() => {
    loadPendingOrders();
  }, [loadPendingOrders]);

  // Search patients (debounced 300ms)
  const searchRef = useRef(null);
  useEffect(() => {
    if (!window.db || search.length < 2) {
      setPatients([]);
      searchRef.current = null;
      return;
    }
    const q = search;
    searchRef.current = q;
    const id = setTimeout(() => {
      const query = `%${q}%`;
      window.db.all(
        `SELECT id, patient_id, name, age, sex, referred_by FROM patients 
         WHERE name LIKE ? OR patient_id LIKE ? OR phone LIKE ? 
         ORDER BY created_at DESC LIMIT 30`,
        [query, query, query]
      ).then((rows) => {
        if (searchRef.current === q) setPatients(rows || []);
      }).catch(() => {
        if (searchRef.current === q) setPatients([]);
      });
    }, 300);
    return () => {
      clearTimeout(id);
      searchRef.current = null;
    };
  }, [search]);

  // Load orders when patient selected
  const selectedPatientIdRef = useRef(null);
  useEffect(() => {
    if (!window.db || !selectedPatient) {
      setOrders([]);
      selectedPatientIdRef.current = null;
      return;
    }
    const pid = selectedPatient.id;
    selectedPatientIdRef.current = pid;
    window.db.all(
      `SELECT o.id, o.order_date, o.status, o.created_at 
       FROM orders o WHERE o.patient_id = ? 
       ORDER BY o.created_at DESC LIMIT 20`,
      [pid]
    ).then((rows) => {
      if (selectedPatientIdRef.current === pid) setOrders(rows || []);
    }).catch(() => {
      if (selectedPatientIdRef.current === pid) setOrders([]);
    });
  }, [selectedPatient]);

  const loadingOrderIdRef = useRef(null);
  // Load order details when order selected or orderIdParam
  const loadOrderDetails = useCallback(async (orderId) => {
    if (!window.db || !orderId) return;
    loadingOrderIdRef.current = orderId;
    try {
      const ord = await window.db.get(
        `SELECT o.*, p.patient_id as pt_id, p.name as patient_name, p.age, p.sex, p.referred_by 
         FROM orders o JOIN patients p ON o.patient_id = p.id WHERE o.id = ?`,
        [orderId]
      );
      if (!ord || loadingOrderIdRef.current !== orderId) return;
      setOrder(ord);
      setPatient(ord);

      const testRows = await window.db.all(
        `SELECT pr.id, pr.code, pr.name, pr.unit, pr.decimal_places, pr.type, pr.section, pr.min_allowed_value, pr.max_allowed_value, ot.display_order
         FROM order_tests ot JOIN parameters pr ON ot.parameter_id = pr.id
         WHERE ot.order_id = ? ORDER BY pr.section, pr.display_order, ot.display_order`,
        [orderId]
      );
      if (loadingOrderIdRef.current !== orderId) return;
      setTests(testRows || []);

      const existing = await window.db.all(
        'SELECT parameter_id, result_value, result_text, flag FROM order_results WHERE order_id = ?',
        [orderId]
      );
      const resMap = {};
      (existing || []).forEach((r) => {
        resMap[r.parameter_id] = { value: r.result_value, text: r.result_text, flag: r.flag };
      });
      if (loadingOrderIdRef.current !== orderId) return;
      setResults(resMap);

      const rangeRows = await window.db.all(
        `SELECT pr.id as parameter_id, prr.sex, prr.min_age, prr.max_age, prr.low_value, prr.high_value, prr.critical_low, prr.critical_high
         FROM parameters pr JOIN parameter_ranges prr ON pr.id = prr.parameter_id`
      );
      const rangeMap = {};
      (rangeRows || []).forEach((r) => {
        if (!rangeMap[r.parameter_id]) rangeMap[r.parameter_id] = [];
        rangeMap[r.parameter_id].push(r);
      });
      if (loadingOrderIdRef.current !== orderId) return;
      setRanges(rangeMap);

      const formulaRows = await window.db.all('SELECT parameter_id, formula_expression, dependencies FROM formulas');
      const formulaMap = {};
      (formulaRows || []).forEach((f) => {
        formulaMap[f.parameter_id] = {
          expr: f.formula_expression,
          deps: (f.dependencies || '').split(',').map((s) => s.trim()).filter(Boolean),
        };
      });
      if (loadingOrderIdRef.current !== orderId) return;
      setFormulas(formulaMap);
      setHasUnsavedChanges(false);
      setStep('entry');
    } catch (e) {
      if (loadingOrderIdRef.current === orderId) console.error(e);
    }
  }, []);

  useEffect(() => {
    if (orderIdParam) {
      const id = parseInt(orderIdParam, 10);
      if (!isNaN(id)) loadOrderDetails(id);
    }
  }, [orderIdParam, loadOrderDetails]);

  useEffect(() => {
    const handler = (e) => {
      if (hasUnsavedChanges && step === 'entry') {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges, step]);

  useEffect(() => {
    if (selectedOrder) {
      loadOrderDetails(selectedOrder.id);
    }
  }, [selectedOrder?.id, loadOrderDetails]);

  const getResultDisplay = (test) => {
    const r = results[test.id];
    if (test.type === 'derived') {
      const f = formulas[test.id];
      if (!f) return { display: 'â€”', flag: 'N' };
      const codeToId = {};
      tests.forEach((t) => (codeToId[t.code] = t.id));
      const vals = {};
      for (const code of f.deps) {
        const depTest = tests.find((t) => t.code === code);
        if (!depTest) return { display: 'â€”', flag: 'N' };
        let v;
        if (depTest.type === 'derived') {
          const d = getResultDisplay(depTest);
          if (d.display === 'â€”' || (d.display && d.display.startsWith('Not calculable'))) return { display: 'â€”', flag: 'N' };
          v = parseFloat(d.display);
          if (isNaN(v)) return { display: 'â€”', flag: 'N' };
        } else {
          const pid = codeToId[code];
          if (!pid) return { display: 'â€”', flag: 'N' };
          v = results[pid]?.value ?? results[pid]?.text;
        }
        if (v == null || v === '') return { display: 'â€”', flag: 'N' };
        vals[code] = v;
      }
      if (test.code === 'LDL' && parseFloat(vals.TG) > 400) return { display: 'Not calculable (TG > 400)', flag: 'N' };
      if (test.code === 'AGRATIO' && parseFloat(vals.GLOB) === 0) return { display: 'â€”', flag: 'N' };
      const computed = evalFormula(f.expr, vals);
      if (computed == null || isNaN(computed)) return { display: 'â€”', flag: 'N' };
      const dec = test.decimal_places ?? 0;
      const display = Number(computed).toFixed(dec);
      const range = getRange(patient, ranges[test.id]);
      const flag = computeFlag(computed, range);
      return { display, flag };
    }
    const val = r?.value ?? r?.text ?? '';
    const range = getRange(patient, ranges[test.id]);
    const flag = r?.flag ?? computeFlag(val, range);
    return { display: val, flag };
  };

  const handleChange = (paramId, value, test) => {
    if (test.type === 'numeric' && value !== '') {
      const numVal = parseFloat(value);
      if (!isNaN(numVal)) {
        if (test.min_allowed_value != null && numVal < test.min_allowed_value) {
          showToast(`${test.name}: Value must be â‰¥ ${test.min_allowed_value}`, 'warning');
          return;
        }
        if (test.max_allowed_value != null && numVal > test.max_allowed_value) {
          showToast(`${test.name}: Value must be â‰¤ ${test.max_allowed_value}`, 'warning');
          return;
        }
      }
    }
    const range = getRange(patient, ranges[paramId]);
    const flag = computeFlag(value, range);
    setResults((prev) => ({
      ...prev,
      [paramId]: {
        value: test.type === 'numeric' ? (parseFloat(value) ?? value) : null,
        text: test.type === 'text' ? value : null,
        flag,
      },
    }));
    setHasUnsavedChanges(true);
  };

  const handleBlur = (paramId, test) => {
    const r = results[paramId];
    const value = r?.value ?? r?.text ?? '';
    if (value === '' || value == null) return;
    const range = getRange(patient, ranges[paramId]);
    const flag = computeFlag(value, range);
    const isCritical = flag === 'C';
    if (isCritical && (range?.criticalLow != null || range?.criticalHigh != null)) {
      setCriticalPending({ paramId, value, test, range });
    }
  };

  const confirmCritical = () => {
    if (!criticalPending) return;
    const { paramId, value, test } = criticalPending;
    const numVal = value === '' ? null : parseFloat(value);
    setResults((prev) => ({
      ...prev,
      [paramId]: {
        value: test.type === 'numeric' ? numVal : null,
        text: test.type === 'text' ? value : null,
        flag: 'C',
      },
    }));
    setCriticalPending(null);
    setHasUnsavedChanges(true);
  };

  const getValidationSummary = useCallback(() => {
    const items = [];
    tests.forEach((t) => {
      if (t.type === 'derived') return;
      const r = results[t.id];
      const val = r?.value ?? r?.text ?? '';
      if (val === '' || val == null) return;
      const range = getRange(patient, ranges[t.id]);
      const flag = r?.flag ?? computeFlag(val, range);
      if (flag === 'C') items.push({ test: t.name, val, flag: 'Critical' });
      else if (flag === 'L' || flag === 'H') items.push({ test: t.name, val, flag: flag === 'L' ? 'Low' : 'High' });
    });
    return items;
  }, [tests, results, patient, ranges]);

  const performSave = async (doPrint = true, stayOnCurrent = false) => {
    if (!window.db || !order?.id) return;
    setSaving(true);
    try {
      for (const test of tests) {
        const r = results[test.id];
        const derived = getResultDisplay(test);
        const val = test.type === 'derived' ? derived.display : (r?.value ?? r?.text);
        const flag = test.type === 'derived' ? derived.flag : (r?.flag ?? 'N');
        const numVal = parseFloat(val);
        const isNum = (test.type === 'numeric' && val !== '' && !isNaN(numVal)) ||
          (test.type === 'derived' && val !== 'â€”' && val !== '' && !isNaN(numVal) && !String(val).startsWith('Not calculable'));
        await window.db.run(
          `INSERT INTO order_results (order_id, parameter_id, result_value, result_text, flag) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(order_id, parameter_id) DO UPDATE SET result_value=excluded.result_value, result_text=excluded.result_text, flag=excluded.flag`,
          [order.id, test.id, isNum ? numVal : null, isNum ? null : (val || null), flag]
        );
      }
      const filled = tests.filter((t) => {
        const r = results[t.id];
        const d = getResultDisplay(t);
        if (t.type === 'derived') return d.display !== 'â€”';
        if (t.type === 'numeric') return r?.value != null && r.value !== '';
        if (t.type === 'text') return r?.text != null && String(r.text).trim() !== '';
        return (r?.value != null && r.value !== '') || (r?.text != null && String(r.text).trim() !== '');
      }).length;
      const status = filled >= tests.length ? 'complete' : filled > 0 ? 'partial' : 'pending';
      await window.db.run('UPDATE orders SET status = ? WHERE id = ?', [status, order.id]);
      /* report_print_log: recorded in Reports.jsx (manual Print + ?print=1 auto-print) so each print action logs once. */
      setHasUnsavedChanges(false);
      if (doPrint) {
        navigate(`/reports?order=${order.id}&print=1`);
      } else if (!stayOnCurrent) {
        const nextPending = await window.db.get(
          `SELECT o.id FROM orders o WHERE o.status IN ('pending','partial') AND o.id != ?
           ORDER BY o.order_date DESC, o.id DESC LIMIT 1`,
          [order.id]
        );
        if (nextPending) {
          loadOrderDetails(nextPending.id);
        } else {
          setStep('select');
          setOrder(null);
          setPatient(null);
          setTests([]);
          setResults({});
          loadPendingOrders(true);
        }
      }
    } catch (e) {
      console.error(e);
      showToast('Error saving. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const pendingSaveAction = useRef(null); // 'print' | 'saveOnly'

  const handleSaveClick = () => {
    const validationItems = getValidationSummary();
    if (validationItems.length > 0) {
      pendingSaveAction.current = 'print';
      setShowValidationSummary(true);
      return;
    }
    performSave(true);
  };

  const handleSaveOnlyClick = (moveToNext = false) => {
    const validationItems = getValidationSummary();
    if (validationItems.length > 0) {
      pendingSaveAction.current = moveToNext ? 'saveAndNext' : 'saveOnly';
      setShowValidationSummary(true);
      return;
    }
    performSave(false, !moveToNext);
  };

  const confirmValidationProceed = () => {
    const action = pendingSaveAction.current;
    setShowValidationSummary(false);
    pendingSaveAction.current = null;
    if (action === 'print') performSave(true);
    else if (action === 'saveOnly') performSave(false, true);
    else if (action === 'saveAndNext') performSave(false, false);
  };

  const formatRange = (range) => {
    if (!range) return '';
    if (range.low != null && range.high != null) return `${range.low} - ${range.high}`;
    return '';
  };

  const goBack = () => {
    if (step === 'entry') {
      if (hasUnsavedChanges && !window.confirm('You have unsaved changes. Leave without saving?')) return;
      setStep('select');
      setOrder(null);
      setPatient(null);
      setTests([]);
      setResults({});
      setSelectedOrder(null);
      setSelectedPatient(null);
    }
  };

  const filteredPending = pendingSearch.trim()
    ? pendingOrders.filter((o) => {
        const q = pendingSearch.toLowerCase();
        return (o.patient_name || '').toLowerCase().includes(q) ||
          (o.patient_id || '').toLowerCase().includes(q) ||
          (o.referred_by || '').toLowerCase().includes(q);
      })
    : pendingOrders;

  const handleSaveClickRef = useRef(handleSaveClick);
  handleSaveClickRef.current = handleSaveClick;
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (!criticalPending) handleSaveClickRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [criticalPending]);

  // Step 1: Select patient
  if (step === 'select' && !order) {
    return (
      <div style={styles.container} className="result-entry-page">
        <h1 style={styles.title}>Enter Results & Print</h1>
        <p style={styles.subtitle}>Select a patient whose results need to be entered, or search for a patient below.</p>

        <div style={styles.card}>
          <div style={styles.pendingHeaderRow}>
            <h3 style={styles.cardTitle}>Patients awaiting results ({filteredPending.length})</h3>
            <div style={styles.pendingToolbar}>
              <select
                value={pendingDateFilter}
                onChange={(e) => setPendingDateFilter(e.target.value)}
                style={styles.filterSelect}
              >
                <option value="all">All time</option>
                <option value="today">Today</option>
                <option value="week">This week</option>
                <option value="month">This month</option>
              </select>
              <input
                type="text"
                placeholder="Filter by name, ID, referrer..."
                value={pendingSearch}
                onChange={(e) => setPendingSearch(e.target.value)}
                style={styles.pendingSearchInput}
              />
              <button
                type="button"
                style={styles.refreshBtn}
                onClick={loadPendingOrders}
                disabled={pendingRefreshLoading}
                title="Refresh list"
              >
                {pendingRefreshLoading ? 'â€¦' : 'â†»'}
              </button>
            </div>
          </div>
          <p style={styles.pendingHint}>Registration and test selection done â€” click to enter results.</p>
          {filteredPending.length === 0 ? (
            <div style={styles.emptyActionWrap}>
              <div style={styles.empty}>
                {pendingOrders.length === 0
                  ? 'No pending results. Use search below to find a patient.'
                  : 'No matches for your filter. Try a different search.'}
              </div>
              {pendingOrders.length === 0 ? (
                <button type="button" style={styles.emptyActionBtn} onClick={() => navigate('/new-registration')}>Register patient</button>
              ) : (
                <button type="button" style={styles.emptyActionBtn} onClick={() => setPendingSearch('')}>Clear filter</button>
              )}
            </div>
          ) : (
            <div style={styles.pendingList}>
              {filteredPending.map((o) => (
                <div
                  key={o.id}
                  role="button"
                  tabIndex={0}
                  className="result-entry-pending-item"
                  style={styles.pendingItem}
                  onClick={() => loadOrderDetails(o.id)}
                  onKeyDown={keyboardActivateHandler(() => loadOrderDetails(o.id))}
                  title="Click to enter results"
                >
                  <span style={styles.pendingId}>#{o.id}</span>
                  <span style={styles.pendingName}>{o.patient_name || 'â€”'}</span>
                  <span style={styles.pendingPtId}>{o.patient_id || 'â€”'}</span>
                  <span style={styles.pendingRef}>{o.referred_by || 'â€”'}</span>
                  <span style={styles.pendingDate}>
                    {formatOrderDateMediumIN(o.order_date)}
                  </span>
                  <span style={styles.pendingStatus}>{o.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={styles.card}>
          <h3 style={styles.cardTitle}>1. Search & Select Patient</h3>
          <input
            tabIndex={1}
            type="text"
            placeholder="Type patient name, ID, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={styles.searchInput}
          />
          <div style={styles.patientList}>
            {patients.map((p) => (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                style={{
                  ...styles.patientItem,
                  ...(selectedPatient?.id === p.id ? styles.patientItemSelected : {}),
                }}
                onClick={() => setSelectedPatient(p)}
                onKeyDown={keyboardActivateHandler(() => setSelectedPatient(p))}
              >
                <strong>{p.patient_id}</strong> â€” {p.name} {p.age ? `(${p.age} Y)` : ''} | {p.referred_by || 'â€”'}
              </div>
            ))}
            {search.length >= 2 && patients.length === 0 && <div style={styles.empty}>No patients found</div>}
          </div>
        </div>

        {selectedPatient && (
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>2. Select Order</h3>
            <div style={styles.orderList}>
              {orders.map((o) => (
                <div
                  key={o.id}
                  role="button"
                  tabIndex={0}
                  style={{
                    ...styles.orderItem,
                    ...(selectedOrder?.id === o.id ? styles.orderItemSelected : {}),
                  }}
                  onClick={() => setSelectedOrder(o)}
                  onKeyDown={keyboardActivateHandler(() => setSelectedOrder(o))}
                >
                  Order #{o.id} â€” {formatOrderDateMediumIN(o.order_date)} ({o.status})
                </div>
              ))}
              {orders.length === 0 && <div style={styles.empty}>No orders for this patient</div>}
            </div>
          </div>
        )}

        {selectedPatient && !selectedOrder && orders.length > 0 && (
          <p style={styles.hint}>Select an order above to enter results.</p>
        )}

        <div style={styles.batchModeRow}>
          <button type="button" style={styles.batchModeBtn} onClick={() => setBatchMode(true)}>
            âš¡ Batch entry â€” enter one test for multiple patients
          </button>
        </div>
      </div>
    );
  }

  // Batch entry mode
  if (batchMode) {
    return (
      <BatchEntryMode
        onClose={() => {
          setBatchMode(false);
          loadPendingOrders(true);
        }}
        loadPendingOrders={loadPendingOrders}
      />
    );
  }

  const filledCount = tests.filter((t) => {
    const r = results[t.id];
    const d = getResultDisplay(t);
    return t.type === 'derived' ? d.display !== 'â€”' : (r?.value != null || r?.text != null);
  }).length;

  const testsBySection = tests.reduce((acc, t) => {
    const sec = t.section || 'Other';
    if (!acc[sec]) acc[sec] = [];
    acc[sec].push(t);
    return acc;
  }, {});

  const filteredTestsBySection = testSearch.trim()
    ? Object.fromEntries(
        Object.entries(testsBySection)
          .map(([sec, list]) => [
            sec,
            list.filter((t) =>
              (t.name || '').toLowerCase().includes(testSearch.trim().toLowerCase()) ||
              (t.code || '').toLowerCase().includes(testSearch.trim().toLowerCase())
            ),
          ])
          .filter(([, list]) => list.length > 0)
      )
    : testsBySection;

  // Step 2: Enter results
  if (!order) return <div style={styles.loading} className="result-entry-page">Loading...</div>;

  return (
    <div style={styles.container} className="result-entry-page">
      <h1 style={styles.title}>Enter Results â€” {patient?.patient_name}</h1>
      <div style={styles.progressBar}>
        <span style={styles.progressText}>{filledCount} / {tests.length} tests entered</span>
        <div style={styles.progressTrack}>
          <div style={{ ...styles.progressFill, width: `${tests.length ? Math.round((filledCount / tests.length) * 100) : 0}%` }} />
        </div>
      </div>
      <div style={styles.patientBar}>
        <strong>{patient?.patient_name}</strong> ({patient?.pt_id}) | Age: {patient?.age ?? 'â€”'} Y | Sex: {patient?.sex === 'male' ? 'M' : patient?.sex === 'female' ? 'F' : 'â€”'} | Referred by: {patient?.referred_by || 'â€”'}
      </div>

      {criticalPending && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h3 style={{ color: '#c00', marginBottom: 12 }}>CRITICAL VALUE DETECTED</h3>
            <p>{criticalPending.test?.name}: {criticalPending.value}</p>
            <p style={{ fontSize: 12, color: '#666' }}>Please confirm this result is correct.</p>
            <div style={styles.modalActions}>
              <button type="button" style={styles.btnConfirm} onClick={confirmCritical}>Confirm result</button>
              <button type="button" style={styles.btnCancel} onClick={() => setCriticalPending(null)}>Edit</button>
            </div>
          </div>
        </div>
      )}

      {showValidationSummary && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h3 style={{ marginBottom: 12 }}>Out-of-range values</h3>
            <p style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>The following results are outside reference range. Review before saving.</p>
            <ul style={{ marginBottom: 16, paddingLeft: 20 }}>
              {getValidationSummary().map((item, i) => (
                <li key={i} style={{ marginBottom: 4 }}>
                  <strong>{item.test}</strong>: {item.val} <span style={{ color: item.flag === 'Critical' ? '#c00' : '#c45c26' }}>({item.flag})</span>
                </li>
              ))}
            </ul>
            <div style={styles.modalActions}>
              <button type="button" style={styles.btnPrimary} onClick={confirmValidationProceed}>Save anyway</button>
              <button type="button" style={styles.btnCancel} onClick={() => setShowValidationSummary(false)}>Edit</button>
            </div>
          </div>
        </div>
      )}

      {tests.length > 6 && (
        <div style={{ marginBottom: 12 }}>
          <input
            type="text"
            placeholder="Search tests by name or code..."
            value={testSearch}
            onChange={(e) => setTestSearch(e.target.value)}
            style={{ ...styles.searchInput, maxWidth: 320, marginBottom: 0 }}
          />
        </div>
      )}
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th>Test</th>
              <th>Result</th>
              <th>Unit</th>
              <th>Reference</th>
              <th>Flag</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(filteredTestsBySection).map(([sectionName, sectionTests]) => {
              const isCollapsed = sectionCollapsed[sectionName];
              return (
                <React.Fragment key={sectionName}>
                  <tr
                    role="button"
                    tabIndex={0}
                    style={styles.sectionHeader}
                    onClick={() => setSectionCollapsed((s) => ({ ...s, [sectionName]: !s[sectionName] }))}
                    onKeyDown={keyboardActivateHandler(() =>
                      setSectionCollapsed((s) => ({ ...s, [sectionName]: !s[sectionName] }))
                    )}
                  >
                    <td colSpan={5} style={{ cursor: 'pointer', fontWeight: 600 }}>
                      {isCollapsed ? 'â–¶' : 'â–¼'} {sectionName}
                    </td>
                  </tr>
                  {!isCollapsed && sectionTests.map((test) => {
                    const derived = test.type === 'derived';
                    const disp = getResultDisplay(test);
                    const range = getRange(patient, ranges[test.id]);
                    return (
                      <tr key={test.id}>
                        <td>{test.name}</td>
                        <td>
                          {derived ? (
                            <span style={styles.derived}>{disp.display}</span>
                          ) : (
                            <input
                              tabIndex={10 + tests.indexOf(test)}
                              type={test.type === 'numeric' ? 'number' : 'text'}
                              step={test.decimal_places ? Math.pow(10, -test.decimal_places) : 1}
                              value={results[test.id]?.value ?? results[test.id]?.text ?? ''}
                              onChange={(e) => handleChange(test.id, e.target.value, test)}
                              onBlur={() => handleBlur(test.id, test)}
                              style={styles.input}
                            />
                          )}
                        </td>
                        <td>{test.unit || 'â€”'}</td>
                        <td style={styles.ref}>{formatRange(range)}</td>
                        <td style={disp.flag === 'C' || disp.flag === 'L' || disp.flag === 'H' ? { color: 'red', fontWeight: 600 } : {}}>
                          {disp.flag}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={styles.actions}>
        <button type="button" tabIndex={100} style={styles.btnPrimary} onClick={handleSaveClick} disabled={saving}>
          {saving ? 'Saving...' : 'Save & Print Report'}
        </button>
        <button type="button" style={styles.btnSaveOnly} onClick={() => handleSaveOnlyClick(false)} disabled={saving} title="Save without printing, stay on current order">
          Save only
        </button>
        <button type="button" style={styles.btnNext} onClick={() => handleSaveOnlyClick(true)} disabled={saving} title="Save and open next pending order">
          Next pending â†’
        </button>
        <button type="button" style={styles.btnSecondary} onClick={goBack}>
          Back to Select Patient
        </button>
      </div>
      <p style={styles.keyboardHint}>Ctrl+S to save Â· Tab to move between fields</p>
    </div>
  );
}

const styles = {
  container: { maxWidth: 900 },
  title: { fontSize: 18, fontWeight: 600, marginBottom: 8, color: '#1e3a5f' },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 24 },
  card: { background: '#fff', padding: 20, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: 20 },
  cardTitle: { fontSize: 15, fontWeight: 600, marginBottom: 12, color: '#333' },
  pendingHint: { fontSize: 13, color: '#666', marginBottom: 12 },
  pendingList: { maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 },
  pendingItem: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#f8fafb', borderRadius: 8, cursor: 'pointer', fontSize: 14, border: '1px solid #e8ecef' },
  pendingHeaderRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 8 },
  pendingToolbar: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  filterSelect: { padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13 },
  pendingSearchInput: { width: 140, padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13 },
  refreshBtn: { padding: '6px 12px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 14 },
  pendingId: { fontWeight: 700, color: '#0d7377', minWidth: 40 },
  pendingName: { flex: 1, fontWeight: 600, color: '#1e3a5f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  pendingPtId: { fontSize: 12, color: '#666', minWidth: 80 },
  pendingRef: { fontSize: 12, color: '#666', minWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  pendingDate: { fontSize: 12, color: '#888', minWidth: 70 },
  pendingStatus: { fontSize: 11, padding: '2px 8px', borderRadius: 6, background: '#e8f4f4', color: '#0d7377', fontWeight: 600 },
  batchModeRow: { marginTop: 16 },
  batchModeBtn: { padding: '10px 16px', background: '#f0f0f0', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontSize: 13 },
  batchToolbar: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 },
  batchInputRow: { display: 'flex', alignItems: 'center', gap: 12 },
  progressBar: { marginBottom: 16 },
  progressText: { fontSize: 13, color: '#666', display: 'block', marginBottom: 4 },
  progressTrack: { height: 6, background: '#e8ecef', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', background: 'linear-gradient(90deg, #0d7377 0%, #14a3a8 100%)', borderRadius: 4, transition: 'width 0.3s' },
  sectionHeader: { background: '#f0f4f8', cursor: 'pointer', borderBottom: '1px solid #ddd', fontWeight: 700, textTransform: 'uppercase' },
  keyboardHint: { fontSize: 12, color: '#999', marginTop: 8 },
  btnSaveOnly: { background: '#5a9aa0', color: '#fff', border: 'none', padding: '12px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' },
  btnNext: { background: '#14a3a8', color: '#fff', border: 'none', padding: '12px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' },
  searchInput: { width: '100%', padding: '12px 16px', borderRadius: 8, border: '1px solid #ddd', fontSize: 15, marginBottom: 12 },
  patientList: { maxHeight: 200, overflowY: 'auto' },
  patientItem: { padding: '12px 16px', borderBottom: '1px solid #eee', cursor: 'pointer', fontSize: 14 },
  patientItemSelected: { background: '#e8f4f4', borderLeft: '4px solid #0d7377' },
  orderList: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  orderItem: { padding: '12px 20px', background: '#f5f5f5', borderRadius: 8, cursor: 'pointer', fontSize: 14 },
  orderItemSelected: { background: '#0d7377', color: '#fff' },
  empty: { padding: 16, color: '#999', fontSize: 14, marginBottom: 12 },
  emptyActionWrap: { padding: 16, textAlign: 'center' },
  emptyActionBtn: { padding: '10px 20px', borderRadius: 8, border: '1px solid #0d7377', background: '#fff', color: '#0d7377', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  hint: { fontSize: 14, color: '#666', marginTop: 8 },
  loading: { padding: 24 },
  patientBar: { background: '#f5f5f5', padding: 12, borderRadius: 8, marginBottom: 24, fontSize: 14 },
  tableWrap: { background: '#fff', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'auto', marginBottom: 24 },
  table: { width: '100%', borderCollapse: 'collapse' },
  input: { width: 120, padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14 },
  derived: { fontWeight: 600 },
  ref: { fontSize: 12, color: '#666' },
  actions: { display: 'flex', gap: 12 },
  btnPrimary: { background: '#0d7377', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 8, fontWeight: 600 },
  btnSecondary: { background: '#eee', border: 'none', padding: '12px 24px', borderRadius: 8 },
  modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modalContent: { background: '#fff', padding: 24, borderRadius: 8, maxWidth: 400 },
  modalActions: { display: 'flex', gap: 12, marginTop: 16 },
  btnConfirm: { background: '#c00', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 600 },
  btnCancel: { background: '#eee', border: 'none', padding: '10px 20px', borderRadius: 8 },
};


