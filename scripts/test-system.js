/**
 * System verification script - tests build and basic DB operations.
 * Run: node scripts/test-system.js
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const root = path.join(__dirname, '..');
let passed = 0;
let failed = 0;

function run(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
    return true;
  } catch (e) {
    console.error(`✗ ${name}: ${e.message || e}`);
    failed++;
    return false;
  }
}

async function runAsync(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
    return true;
  } catch (e) {
    console.error(`✗ ${name}: ${e.message || e}`);
    failed++;
    return false;
  }
}

async function main() {
  console.log('\n=== Pathology Lab Management System - Verification ===\n');

  run('Build (vite build)', () => {
    execSync('npm run build', { cwd: root, stdio: 'pipe' });
  });

  run('Database module loads', () => {
    const DatabaseManager = require(path.join(root, 'electron/database.js'));
    if (typeof DatabaseManager !== 'function') throw new Error('DatabaseManager not a constructor');
  });

  await runAsync('Database init & basic queries', async () => {
    const DatabaseManager = require(path.join(root, 'electron/database.js'));
    const db = new DatabaseManager();
    await db.init();
    const lab = db.get('SELECT name FROM lab WHERE id = 1');
    if (!lab) throw new Error('Lab config missing');
    const paramCount = db.get('SELECT COUNT(*) as c FROM parameters');
    if (!paramCount || paramCount.c < 1) throw new Error('Parameters catalogue not loaded');
    const userCount = db.get('SELECT COUNT(*) as c FROM users');
    if (!userCount || userCount.c < 1) throw new Error('No users in DB');
  });

  run('Electron packager includes catalogue JSON files', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const files = pkg.build?.files || [];
    ['pathology_parameters.json', 'rate_chart.json', 'test_profiles.json'].forEach((f) => {
      if (!files.includes(f)) throw new Error(`package.json build.files must include ${f} (required for catalogue in installed builds)`);
    });
  });

  run('Pathology parameters JSON exists', () => {
    const p = path.join(root, 'pathology_parameters.json');
    if (!fs.existsSync(p)) throw new Error('pathology_parameters.json missing');
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!data.parameters || !Array.isArray(data.parameters)) throw new Error('Invalid parameters structure');
  });

  run('Rate chart JSON exists', () => {
    const p = path.join(root, 'rate_chart.json');
    if (!fs.existsSync(p)) throw new Error('rate_chart.json missing');
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!data.rates || typeof data.rates !== 'object') throw new Error('Invalid rate_chart structure');
  });

  run('computeOrderBillAndCommission exists', () => {
    const DatabaseManager = require(path.join(root, 'electron/database.js'));
    const db = new DatabaseManager();
    if (typeof db.computeOrderBillAndCommission !== 'function') {
      throw new Error('computeOrderBillAndCommission missing');
    }
  });

  run('All routes defined in App', () => {
    const appPath = path.join(root, 'src/App.jsx');
    const content = fs.readFileSync(appPath, 'utf8');
    const routes = ['new-registration', 'result-entry', 'reports', 'billing', 'referrals', 'referrer-commission', 'rate-chart', 'settings'];
    routes.forEach((r) => {
      if (!content.includes(`path="${r}"`) && !content.includes(`path='${r}'`)) {
        throw new Error(`Route ${r} not found in App.jsx`);
      }
    });
  });

  run('dateDisplay util (order dates)', () => {
    const p = path.join(root, 'src/utils/dateDisplay.js');
    if (!fs.existsSync(p)) throw new Error('src/utils/dateDisplay.js missing');
    const content = fs.readFileSync(p, 'utf8');
    if (!content.includes('T12:00:00')) throw new Error('dateDisplay must use local noon for YYYY-MM-DD');
    if (!content.includes('formatOrderDateDisplay')) throw new Error('formatOrderDateDisplay export missing');
  });

  run('Single-instance lock in electron main', () => {
    const mainPath = path.join(root, 'electron/main.js');
    const content = fs.readFileSync(mainPath, 'utf8');
    if (!content.includes('requestSingleInstanceLock')) {
      throw new Error('main.js should call app.requestSingleInstanceLock() for DB safety');
    }
    if (!content.includes('second-instance')) {
      throw new Error('main.js should handle second-instance to focus main window');
    }
  });

  run('Layout uses hash path for print trigger (HashRouter)', () => {
    const layoutPath = path.join(root, 'src/components/Layout.jsx');
    const content = fs.readFileSync(layoutPath, 'utf8');
    if (content.includes('window.location.pathname === \'/reports\'')) {
      throw new Error('Layout must not use window.location.pathname for /reports with HashRouter');
    }
    if (!content.includes('getHashRoutePath') || !content.includes("getHashRoutePath() === '/reports'")) {
      throw new Error('Layout should use getHashRoutePath() for Electron print trigger');
    }
  });

  run('labRules.cjs (referrer normalization)', () => {
    const { normalizeReferrerName, SQL_EXCLUDE_WALK_IN_REFERRALS } = require(path.join(root, 'electron/labRules.cjs'));
    if (normalizeReferrerName('  walk  in  ') !== 'Self') throw new Error('walk-in should normalize to Self');
    if (normalizeReferrerName('') !== null) throw new Error('empty should be null');
    if (normalizeReferrerName('  Dr. A  ') !== 'Dr. A') throw new Error('trim/collapse spaces for names');
    if (!SQL_EXCLUDE_WALK_IN_REFERRALS.includes('NOT IN')) throw new Error('SQL fragment should use NOT IN');
  });

  run('src/utils/labRules.js present', () => {
    const p = path.join(root, 'src/utils/labRules.js');
    if (!fs.existsSync(p)) throw new Error('src/utils/labRules.js missing');
    const c = fs.readFileSync(p, 'utf8');
    if (!c.includes('normalizeReferrerName')) throw new Error('labRules.js should export normalizeReferrerName');
  });

  run('uiFontScale util present', () => {
    const p = path.join(root, 'src/utils/uiFontScale.js');
    if (!fs.existsSync(p)) throw new Error('src/utils/uiFontScale.js missing');
    const c = fs.readFileSync(p, 'utf8');
    if (!c.includes('lab_ui_font_scale')) throw new Error('uiFontScale should use lab_ui_font_scale key');
  });

  await runAsync('Temp DB: patient + order_tests + computeOrderBillAndCommission', async () => {
    const DatabaseManager = require(path.join(root, 'electron/database.js'));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-smoke-'));
    const dbm = new DatabaseManager(tmp);
    try {
      await dbm.init();
      const extId = DatabaseManager.getNextPatientId(dbm);
      dbm.run(
        'INSERT INTO patients (patient_id, name, age, sex, phone, address, referred_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [extId, 'Smoke Patient', null, 'male', null, null, 'Self']
      );
      const prow = dbm.get('SELECT id FROM patients WHERE patient_id = ?', [extId]);
      if (!prow?.id) throw new Error('patient row missing');
      const d = new Date();
      const orderDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const ores = dbm.run(
        'INSERT INTO orders (patient_id, referring_doctor, order_date, status) VALUES (?, ?, ?, ?)',
        [prow.id, 'Self', orderDate, 'pending']
      );
      const oid = ores.lastInsertRowid;
      const par = dbm.get('SELECT id FROM parameters LIMIT 1');
      if (!par?.id) throw new Error('no parameters in catalogue');
      dbm.run('INSERT INTO order_tests (order_id, parameter_id, display_order) VALUES (?, ?, ?)', [oid, par.id, 1]);
      dbm.computeOrderBillAndCommission(oid);
      const ord = dbm.get('SELECT total_amount, access_code FROM orders WHERE id = ?', [oid]);
      if (ord == null || ord.total_amount == null) throw new Error('order total_amount not set after compute');
      if (ord.access_code == null || String(ord.access_code).trim() === '') throw new Error('access_code not set after compute');
    } finally {
      try {
        dbm.close();
      } catch (_) { /* ignore */ }
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  console.log(`\n--- Result: ${passed} passed, ${failed} failed ---\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
