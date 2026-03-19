const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const SALT = 'mondal-lab-2026';
function hashPassword(pw) {
  return crypto.pbkdf2Sync(pw, SALT, 100000, 64, 'sha512').toString('hex');
}

class DatabaseManager {
  /**
   * @param {string|null} electronUserDataPath - From Electron: `app.getPath('userData')`. One folder for DB,
   *   backups, exports — matches Windows installer uninstall ("remove app data"). If null (CLI/tests), uses legacy path.
   */
  constructor(electronUserDataPath = null) {
    if (electronUserDataPath) {
      this.dataRoot = path.normalize(electronUserDataPath);
    } else {
      const roaming = process.env.APPDATA || path.join(process.env.USERPROFILE || process.env.HOME || os.homedir(), '.config');
      this.dataRoot = path.join(roaming, 'MondalDiagnosticCentre');
    }
    if (!fs.existsSync(this.dataRoot)) fs.mkdirSync(this.dataRoot, { recursive: true });
    this.dbPath = path.join(this.dataRoot, 'lab.db');
    this.db = null;
    this.SQL = null;
  }

  /** Pre-v1.0.2 location: %APPDATA%\\MondalDiagnosticCentre */
  static legacyAppDataDir() {
    const roaming = process.env.APPDATA || path.join(process.env.USERPROFILE || process.env.HOME || os.homedir(), '.config');
    return path.join(roaming, 'MondalDiagnosticCentre');
  }

  _backupDir() {
    return path.join(this.dataRoot, 'backups');
  }

  _exportDir() {
    return path.join(this.dataRoot, 'exports');
  }

  /** Copy lab.db from old folder if this install uses Electron userData and DB file not present yet. */
  migrateFromLegacyIfNeeded() {
    if (fs.existsSync(this.dbPath)) return;
    const legacyDb = path.join(DatabaseManager.legacyAppDataDir(), 'lab.db');
    if (!fs.existsSync(legacyDb)) return;
    try {
      fs.copyFileSync(legacyDb, this.dbPath);
      console.log('[DB] Migrated lab.db from legacy folder into app userData.');
    } catch (e) {
      console.error('[DB] Legacy migration failed:', e.message);
    }
  }

  async init() {
    this.migrateFromLegacyIfNeeded();
    this.SQL = await initSqlJs();
    if (fs.existsSync(this.dbPath)) {
      const buf = fs.readFileSync(this.dbPath);
      this.db = new this.SQL.Database(buf);
    } else {
      this.db = new this.SQL.Database();
    }
    try { this.db.run('PRAGMA journal_mode = WAL'); } catch (_) { /* sql.js may not support WAL */ }
    this.createTables();
    this.migrate();
    const count = this.get('SELECT COUNT(*) as c FROM parameters');
    if (count && count.c === 0) this.loadCatalogueFromJson();
    this.save();
  }

  save() {
    if (this.db) {
      const data = this.db.export();
      fs.writeFileSync(this.dbPath, Buffer.from(data));
    }
  }

  migrate() {
    const alters = [
      'ALTER TABLE lab ADD COLUMN pathologist_name TEXT',
      'ALTER TABLE lab ADD COLUMN default_printed_by TEXT',
      'ALTER TABLE lab ADD COLUMN staff_list TEXT',
      'ALTER TABLE parameters ADD COLUMN min_allowed_value REAL',
      'ALTER TABLE parameters ADD COLUMN max_allowed_value REAL',
      'ALTER TABLE order_tests ADD COLUMN rate REAL',
      'ALTER TABLE lab ADD COLUMN commission_default_percent REAL',
    ];
    alters.forEach((sql) => { try { this.db.run(sql); } catch (_) {} });
    try { this.run('UPDATE lab SET commission_default_percent = 45 WHERE id = 1 AND commission_default_percent IS NULL'); } catch (_) {}
    try {
      this.db.run(`CREATE TABLE IF NOT EXISTS referrer_commission_pct (
        referrer_name TEXT PRIMARY KEY,
        commission_percent REAL NOT NULL DEFAULT 45,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
    } catch (_) {}
    try {
      this.db.run('ALTER TABLE orders ADD COLUMN access_code TEXT');
    } catch (_) {}
    try {
      this.db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_access_code ON orders(access_code)');
    } catch (_) {}
    this.backfillOrderAccessCodes();
    this.migrateParameterNames();
  }

  /** Unique barcode / scan value per order (bill). Uppercase A–Z and 2–9 only — scanner-friendly. */
  generateUniqueOrderAccessCode() {
    const C = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 100; attempt++) {
      let code = '';
      for (let i = 0; i < 10; i++) code += C[crypto.randomInt(0, C.length)];
      const clash = this.get('SELECT 1 AS x FROM orders WHERE access_code = ?', [code]);
      if (!clash) return code;
    }
    throw new Error('Could not generate unique access_code');
  }

  ensureOrderAccessCode(orderId) {
    const row = this.get('SELECT id, access_code FROM orders WHERE id = ?', [orderId]);
    if (!row) return;
    const cur = row.access_code != null ? String(row.access_code).trim() : '';
    if (cur.length > 0) return;
    try {
      const code = this.generateUniqueOrderAccessCode();
      this.run('UPDATE orders SET access_code = ? WHERE id = ?', [code, orderId]);
    } catch (e) {
      console.error('ensureOrderAccessCode failed:', orderId, e.message);
    }
  }

  backfillOrderAccessCodes() {
    try {
      const need = this.get(
        `SELECT 1 AS x FROM orders WHERE access_code IS NULL OR TRIM(COALESCE(access_code, '')) = '' LIMIT 1`
      );
      if (!need) return;
      const rows = this.all(
        'SELECT id FROM orders WHERE access_code IS NULL OR TRIM(COALESCE(access_code, \'\')) = \'\''
      );
      (rows || []).forEach((r) => this.ensureOrderAccessCode(r.id));
      this.save();
    } catch (_) {}
  }

  migrateParameterNames() {
    const projectRoot = path.join(__dirname, '..');
    const paramsPath = path.join(projectRoot, 'pathology_parameters.json');
    if (!fs.existsSync(paramsPath)) return;
    try {
      const paramsData = JSON.parse(fs.readFileSync(paramsPath, 'utf8'));
      const parameters = paramsData.parameters || [];
      const codeToName = {};
      parameters.forEach((p) => { codeToName[p.code] = p.name; });
      const rows = this.all('SELECT id, code FROM parameters');
      (rows || []).forEach((r) => {
        const name = codeToName[r.code];
        if (name) {
          try { this.run('UPDATE parameters SET name = ? WHERE id = ?', [name, r.id], true); } catch (_) {}
        }
      });
      this.save();
    } catch (_) {}
  }

  createTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lab (
        id INTEGER PRIMARY KEY DEFAULT 1,
        name TEXT DEFAULT 'MONDAL DIAGNOSTIC CENTRE',
        address TEXT,
        phone TEXT,
        email TEXT,
        registration_no TEXT,
        logo_path TEXT,
        margin_top INTEGER DEFAULT 51,
        margin_left INTEGER DEFAULT 20,
        margin_right INTEGER DEFAULT 20,
        margin_bottom INTEGER DEFAULT 20,
        clinical_correlation_text TEXT DEFAULT 'Please correlate clinically',
        report_watermark_text TEXT DEFAULT 'DRAFT REPORT',
        printer_name TEXT,
        pathologist_name TEXT DEFAULT 'Pathologist',
        default_printed_by TEXT DEFAULT 'Admin',
        staff_list TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'staff',
        display_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS patients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id TEXT UNIQUE,
        name TEXT NOT NULL,
        age INTEGER,
        sex TEXT,
        phone TEXT,
        address TEXT,
        referred_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_patient_name ON patients(name);
      CREATE INDEX IF NOT EXISTS idx_patient_phone ON patients(phone);

      CREATE TABLE IF NOT EXISTS parameters (
        id INTEGER PRIMARY KEY,
        code TEXT UNIQUE,
        name TEXT,
        section TEXT,
        display_order INTEGER,
        unit TEXT,
        decimal_places INTEGER,
        type TEXT,
        min_allowed_value REAL,
        max_allowed_value REAL
      );

      CREATE TABLE IF NOT EXISTS parameter_ranges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parameter_id INTEGER,
        sex TEXT,
        min_age INTEGER,
        max_age INTEGER,
        low_value REAL,
        high_value REAL,
        critical_low REAL,
        critical_high REAL,
        FOREIGN KEY(parameter_id) REFERENCES parameters(id)
      );

      CREATE TABLE IF NOT EXISTS test_profiles (
        id INTEGER PRIMARY KEY,
        name TEXT,
        section TEXT,
        display_order INTEGER
      );

      CREATE TABLE IF NOT EXISTS profile_parameters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id INTEGER,
        parameter_id INTEGER,
        display_order INTEGER,
        FOREIGN KEY(profile_id) REFERENCES test_profiles(id),
        FOREIGN KEY(parameter_id) REFERENCES parameters(id)
      );

      CREATE TABLE IF NOT EXISTS formulas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parameter_id INTEGER,
        formula_expression TEXT,
        dependencies TEXT,
        FOREIGN KEY(parameter_id) REFERENCES parameters(id)
      );

      CREATE TABLE IF NOT EXISTS patient_sequence (
        month INTEGER,
        year INTEGER,
        last_number INTEGER,
        PRIMARY KEY(month, year)
      );

      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id INTEGER NOT NULL,
        referring_doctor TEXT,
        order_date DATE,
        report_date DATE,
        status TEXT DEFAULT 'pending',
        total_amount REAL,
        payment_status TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(patient_id) REFERENCES patients(id)
      );
      CREATE INDEX IF NOT EXISTS idx_order_patient ON orders(patient_id);
      CREATE INDEX IF NOT EXISTS idx_order_date ON orders(order_date);

      CREATE TABLE IF NOT EXISTS order_tests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        parameter_id INTEGER NOT NULL,
        display_order INTEGER,
        FOREIGN KEY(order_id) REFERENCES orders(id),
        FOREIGN KEY(parameter_id) REFERENCES parameters(id)
      );
      CREATE INDEX IF NOT EXISTS idx_order_tests_order ON order_tests(order_id);

      CREATE TABLE IF NOT EXISTS order_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        parameter_id INTEGER NOT NULL,
        result_value REAL,
        result_text TEXT,
        flag TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(order_id) REFERENCES orders(id),
        FOREIGN KEY(parameter_id) REFERENCES parameters(id),
        UNIQUE(order_id, parameter_id)
      );
      CREATE INDEX IF NOT EXISTS idx_order_results_order ON order_results(order_id);

      CREATE TABLE IF NOT EXISTS report_print_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER,
        printed_by TEXT,
        printed_at DATETIME,
        copy_number INTEGER,
        FOREIGN KEY(order_id) REFERENCES orders(id)
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT,
        record_id INTEGER,
        action TEXT,
        old_value TEXT,
        new_value TEXT,
        changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        changed_by TEXT
      );

      CREATE TABLE IF NOT EXISTS test_rates (
        parameter_id INTEGER PRIMARY KEY,
        rate REAL NOT NULL DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(parameter_id) REFERENCES parameters(id)
      );

      CREATE TABLE IF NOT EXISTS referrer_commission (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        referrer_name TEXT NOT NULL,
        parameter_id INTEGER,
        commission_percent REAL NOT NULL DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(parameter_id) REFERENCES parameters(id),
        UNIQUE(referrer_name, parameter_id)
      );

      CREATE TABLE IF NOT EXISTS order_commission_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        referrer_name TEXT,
        order_amount REAL,
        commission_amount REAL,
        commission_percent REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(order_id) REFERENCES orders(id)
      );

      INSERT OR IGNORE INTO lab (id) VALUES (1);

      INSERT OR IGNORE INTO users (id, username, password_hash, role, display_name) VALUES
        (1, 'admin', '${hashPassword('admin123')}', 'admin', 'Admin');
    `);
    this.ensureUsersExist();
  }

  ensureUsersExist() {
    const count = this.get('SELECT COUNT(*) as c FROM users');
    if (count && count.c === 0) {
      this.run('INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)', ['admin', hashPassword('admin123'), 'admin', 'Admin']);
    }
  }

  verifyUser(username, password) {
    const user = this.get('SELECT id, username, password_hash, role, display_name FROM users WHERE username = ?', [username]);
    if (!user) return null;
    const hash = hashPassword(password);
    return hash === user.password_hash ? { id: user.id, username: user.username, role: user.role, displayName: user.display_name || user.username } : null;
  }

  /** Load investigation catalogue / rates / profiles from bundled JSON (not patient or order data). */
  loadCatalogueFromJson() {
    const projectRoot = path.join(__dirname, '..');
    const paramsPath = path.join(projectRoot, 'pathology_parameters.json');
    const profilesPath = path.join(projectRoot, 'test_profiles.json');

    if (!fs.existsSync(paramsPath)) return;

    let paramsData;
    try {
      paramsData = JSON.parse(fs.readFileSync(paramsPath, 'utf8'));
    } catch (e) {
      console.error('Failed to load pathology_parameters.json:', e.message);
      return;
    }
    const parameters = paramsData.parameters || [];
    const batch = true;

    this.run('DELETE FROM test_rates', [], batch);
    this.run('DELETE FROM parameter_ranges', [], batch);
    this.run('DELETE FROM formulas', [], batch);
    this.run('DELETE FROM parameters', [], batch);

    let paramId = 1;
    for (const p of parameters) {
      this.run(
        `INSERT INTO parameters (id, code, name, section, display_order, unit, decimal_places, type, min_allowed_value, max_allowed_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [paramId, p.code, p.name, p.section, p.display_order || 0, p.unit || '', p.decimal ?? 0, p.type || 'numeric', p.min_allowed_value ?? null, p.max_allowed_value ?? null],
        batch
      );

      if (p.ranges && Array.isArray(p.ranges)) {
        for (const r of p.ranges) {
          this.run(
            `INSERT INTO parameter_ranges (parameter_id, sex, min_age, max_age, low_value, high_value, critical_low, critical_high) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [paramId, r.sex || 'any', r.min_age ?? 0, r.max_age ?? 150, r.low, r.high, p.critical?.low ?? null, p.critical?.high ?? null],
            batch
          );
        }
      } else if (p.critical) {
        this.run(
          `INSERT INTO parameter_ranges (parameter_id, sex, min_age, max_age, low_value, high_value, critical_low, critical_high) VALUES (?, 'any', 0, 150, NULL, NULL, ?, ?)`,
          [paramId, p.critical.low ?? null, p.critical.high ?? null],
          batch
        );
      }

      if (p.type === 'derived' && p.formula && p.depends_on) {
        this.run(
          `INSERT INTO formulas (parameter_id, formula_expression, dependencies) VALUES (?, ?, ?)`,
          [paramId, p.formula, Array.isArray(p.depends_on) ? p.depends_on.join(',') : p.depends_on],
          batch
        );
      }

      paramId++;
    }

    const rateChartPath = path.join(projectRoot, 'rate_chart.json');
    if (fs.existsSync(rateChartPath)) {
      let rateData;
      try {
        rateData = JSON.parse(fs.readFileSync(rateChartPath, 'utf8'));
      } catch (e) {
        console.error('Failed to load rate_chart.json:', e.message);
      }
      if (!rateData) rateData = {};
      const rates = rateData.rates || {};
      const codeToParamId = {};
      const allParams = this.all('SELECT id, code FROM parameters');
      (allParams || []).forEach((x) => { codeToParamId[x.code] = x.id; });
      for (const [code, rate] of Object.entries(rates)) {
        const pid = codeToParamId[code];
        const r = parseFloat(rate) || 0;
        if (pid && r > 0) {
          try {
            this.run('INSERT OR REPLACE INTO test_rates (parameter_id, rate, updated_at) VALUES (?, ?, datetime("now"))', [pid, r], batch);
          } catch (_) {}
        }
      }
    }

    /** Profiles must match current parameter ids; never leave old rows after a catalogue reload. */
    const clearTestProfiles = () => {
      this.run('DELETE FROM profile_parameters', [], batch);
      this.run('DELETE FROM test_profiles', [], batch);
    };

    if (fs.existsSync(profilesPath)) {
      let profilesData = null;
      try {
        profilesData = JSON.parse(fs.readFileSync(profilesPath, 'utf8'));
      } catch (e) {
        console.error('Failed to load test_profiles.json:', e.message);
      }
      const profiles = profilesData && Array.isArray(profilesData.profiles) ? profilesData.profiles : null;
      clearTestProfiles();
      if (profiles) {
        let profileId = 1;
        for (const pf of profiles) {
          this.run(
            `INSERT INTO test_profiles (id, name, section, display_order) VALUES (?, ?, ?, ?)`,
            [profileId, pf.name, pf.section || '', pf.display_order || profileId],
            batch
          );
          const tests = pf.tests || [];
          const codeToId = {};
          const allParams = this.all('SELECT id, code FROM parameters');
          (allParams || []).forEach((x) => (codeToId[x.code] = x.id));
          tests.forEach((code, idx) => {
            if (codeToId[code]) {
              this.run(
                `INSERT INTO profile_parameters (profile_id, parameter_id, display_order) VALUES (?, ?, ?)`,
                [profileId, codeToId[code], idx + 1],
                batch
              );
            }
          });
          profileId++;
        }
      }
    } else {
      clearTestProfiles();
    }
    this.save();
  }

  query(sql, params = []) {
    return this.run(sql, params);
  }

  run(sql, params = [], skipSave = false) {
    const stmt = this.db.prepare(sql);
    if (params && params.length > 0) stmt.bind(params);
    stmt.step();
    stmt.free();
    const res = this.db.exec('SELECT last_insert_rowid()');
    const lastInsertRowid = res[0]?.values?.[0]?.[0] ?? 0;
    if (!skipSave) this.save();
    return { lastInsertRowid, changes: 1 };
  }

  get(sql, params = []) {
    const stmt = this.db.prepare(sql);
    if (params && params.length > 0) stmt.bind(params);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row;
    }
    stmt.free();
    return null;
  }

  all(sql, params = []) {
    const stmt = this.db.prepare(sql);
    if (params && params.length > 0) stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  close() {
    if (this.db) {
      this.save();
      this.db.close();
      this.db = null;
    }
  }

  logPrint(orderId, printedBy) {
    this.run(
      'INSERT INTO report_print_log (order_id, printed_by, printed_at, copy_number) VALUES (?, ?, datetime("now"), 1)',
      [orderId, printedBy || 'Admin']
    );
  }

  backup() {
    const backupDir = this._backupDir();
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupPath = path.join(backupDir, `lab_backup_${timestamp}.db`);
    this.save();
    fs.copyFileSync(this.dbPath, backupPath);
    return backupPath;
  }

  /** Flush in-memory DB to disk, then copy to a user-chosen path (Desktop, USB, etc.). */
  backupToPath(destPath) {
    this.save();
    let dest = path.normalize(destPath.trim());
    if (!dest.toLowerCase().endsWith('.db')) dest += '.db';
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(this.dbPath, dest);
    return dest;
  }

  getDatabaseSize() {
    try {
      const stat = fs.statSync(this.dbPath);
      return stat.size;
    } catch {
      return 0;
    }
  }

  getLastBackupDate() {
    const backupDir = this._backupDir();
    if (!fs.existsSync(backupDir)) return null;
    const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.db'));
    if (files.length === 0) return null;
    let latest = null;
    let latestMtime = 0;
    files.forEach((f) => {
      const p = path.join(backupDir, f);
      const stat = fs.statSync(p);
      if (stat.mtimeMs > latestMtime) {
        latestMtime = stat.mtimeMs;
        latest = stat.mtime;
      }
    });
    return latest;
  }

  backupEncrypted(password) {
    const backupDir = this._backupDir();
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupPath = path.join(backupDir, `lab_backup_${timestamp}.db.enc`);
    this.save();
    const key = crypto.scryptSync(password || 'mondal-default', SALT, 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const data = fs.readFileSync(this.dbPath);
    const encrypted = Buffer.concat([iv, cipher.update(data), cipher.final()]);
    fs.writeFileSync(backupPath, encrypted);
    return backupPath;
  }

  /** Encrypted backup to a user-chosen path. */
  backupEncryptedToPath(destPath, password) {
    this.save();
    let dest = path.normalize(destPath.trim());
    const lower = dest.toLowerCase();
    if (!lower.endsWith('.enc')) {
      dest = lower.endsWith('.db') ? `${dest}.enc` : `${dest}.db.enc`;
    }
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const key = crypto.scryptSync(password || 'mondal-default', SALT, 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const data = fs.readFileSync(this.dbPath);
    const encrypted = Buffer.concat([iv, cipher.update(data), cipher.final()]);
    fs.writeFileSync(dest, encrypted);
    return dest;
  }

  exportOrdersExcel(params = {}) {
    const XLSX = require('xlsx');
    const exportDir = this._exportDir();
    if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outPath = path.join(exportDir, `orders_export_${timestamp}.xlsx`);

    let sql = `SELECT o.id, o.order_date, o.status, p.patient_id, p.name as patient_name, p.age, p.sex, p.referred_by
               FROM orders o JOIN patients p ON o.patient_id = p.id WHERE 1=1`;
    const args = [];
    if (params.dateFrom) { sql += ' AND date(o.order_date) >= ?'; args.push(params.dateFrom); }
    if (params.dateTo) { sql += ' AND date(o.order_date) <= ?'; args.push(params.dateTo); }
    sql += ' ORDER BY o.order_date DESC, o.id DESC LIMIT 5000';

    const rows = this.all(sql, args);
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Orders');
    XLSX.writeFile(wb, outPath);
    return outPath;
  }

  exportReferralsExcel(params = {}) {
    const XLSX = require('xlsx');
    const exportDir = this._exportDir();
    if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outPath = path.join(exportDir, `referrals_export_${timestamp}.xlsx`);

    let sql = `SELECT p.referred_by as Referrer, COUNT(DISTINCT p.id) as PatientCount
               FROM patients p JOIN orders o ON o.patient_id = p.id
               WHERE p.referred_by IS NOT NULL AND p.referred_by != ''
               AND LOWER(TRIM(p.referred_by)) != 'self'
               AND date(o.order_date) >= ? AND date(o.order_date) <= ?
               GROUP BY p.referred_by ORDER BY PatientCount DESC`;
    const args = [params.dateFrom || '1970-01-01', params.dateTo || '2099-12-31'];
    const rows = this.all(sql, args);
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Referrals');
    XLSX.writeFile(wb, outPath);
    return outPath;
  }

  computeOrderBill(orderId) {
    const DEFAULT_RATE = 50;
    const batch = true;
    const tests = this.all('SELECT id, parameter_id FROM order_tests WHERE order_id = ?', [orderId]);
    if (!tests || tests.length === 0) return 0;
    const rateMap = {};
    const rateRows = this.all('SELECT parameter_id, rate FROM test_rates');
    (rateRows || []).forEach((r) => { rateMap[r.parameter_id] = parseFloat(r.rate) || 0; });
    let total = 0;
    for (const t of tests) {
      const rate = rateMap[t.parameter_id] ?? DEFAULT_RATE;
      try { this.run('UPDATE order_tests SET rate = ? WHERE id = ?', [rate, t.id], batch); } catch (_) {}
      total += rate;
    }
    try { this.run('UPDATE orders SET total_amount = ? WHERE id = ?', [total, orderId], batch); } catch (_) {}
    this.save();
    return total;
  }

  updateOrderCommission(orderId) {
    const order = this.get('SELECT o.total_amount, p.referred_by FROM orders o JOIN patients p ON o.patient_id = p.id WHERE o.id = ?', [orderId]);
    if (!order || !order.referred_by || (order.referred_by || '').trim() === '') return;
    const refName = order.referred_by.trim();
    if (refName.toLowerCase() === 'self') return;
    const refPct = this.get('SELECT commission_percent FROM referrer_commission_pct WHERE referrer_name = ?', [refName]);
    const lab = this.get('SELECT commission_default_percent FROM lab WHERE id = 1');
    const pct = refPct != null ? parseFloat(refPct.commission_percent) : (parseFloat(lab?.commission_default_percent) ?? 45);
    const amount = parseFloat(order.total_amount) || 0;
    const commission = Math.round((amount * pct / 100) * 100) / 100;
    this.run('DELETE FROM order_commission_log WHERE order_id = ?', [orderId]);
    this.run(
      'INSERT INTO order_commission_log (order_id, referrer_name, order_amount, commission_amount, commission_percent) VALUES (?, ?, ?, ?, ?)',
      [orderId, order.referred_by.trim(), amount, commission, pct]
    );
  }

  computeOrderBillAndCommission(orderId) {
    const id = orderId != null && orderId !== '' ? Number(orderId) : NaN;
    if (!Number.isFinite(id) || id <= 0) return;
    this.computeOrderBill(id);
    this.updateOrderCommission(id);
    this.ensureOrderAccessCode(id);
  }

  clearAllPatients() {
    const batch = true;
    this.run('DELETE FROM order_commission_log', [], batch);
    this.run('DELETE FROM report_print_log', [], batch);
    this.run('DELETE FROM order_results', [], batch);
    this.run('DELETE FROM order_tests', [], batch);
    this.run('DELETE FROM orders', [], batch);
    this.run('DELETE FROM patients', [], batch);
    this.run('DELETE FROM patient_sequence', [], batch);
    this.save();
  }

  static getNextPatientId(db) {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const row = db.get('SELECT last_number FROM patient_sequence WHERE month = ? AND year = ?', [month, year]);
    let next = 1;
    if (row) {
      next = row.last_number + 1;
      db.run('UPDATE patient_sequence SET last_number = ? WHERE month = ? AND year = ?', [next, month, year]);
    } else {
      db.run('INSERT INTO patient_sequence (month, year, last_number) VALUES (?, ?, ?)', [month, year, 1]);
    }
    return `PT${String(next).padStart(2, '0')}-${MONTHS[month - 1]}-${year}`;
  }
}

module.exports = DatabaseManager;
