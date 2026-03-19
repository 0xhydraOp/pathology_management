/**
 * System verification script - tests build and basic DB operations.
 * Run: node scripts/test-system.js
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

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
    if (!paramCount || paramCount.c < 1) throw new Error('Parameters not seeded');
    const userCount = db.get('SELECT COUNT(*) as c FROM users');
    if (!userCount || userCount.c < 1) throw new Error('No users in DB');
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

  console.log(`\n--- Result: ${passed} passed, ${failed} failed ---\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
