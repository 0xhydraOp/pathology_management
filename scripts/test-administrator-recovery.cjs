const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const Database = require('../electron/database');
const { openRecovery } = require('../electron/administratorRecovery.cjs');
const password = 'synthetic-original-password', next = 'synthetic-recovered-password';
async function fixture(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'patholy-offline-recovery-'));
  let db = new Database(dir, { migrateLegacy: false });
  try { await db.init(); db.setupAdmin('synthetic-admin', password); db.close(); await fn(dir); }
  finally { db.db?.close(); db.releaseLock(); fs.rmSync(dir, { recursive: true, force: true }); }
}
test('selection/cancellation reads current schema without rewriting or migrating it', () => fixture(async dir => {
  const before = fs.readFileSync(path.join(dir, 'lab.db')), recovery = await openRecovery(dir);
  assert.deepEqual(recovery.admins.map(u => u.username), ['synthetic-admin']);
  recovery.close(); assert.deepEqual(fs.readFileSync(path.join(dir, 'lab.db')), before);
}));
test('closed-app recovery preserves all tables except chosen hash and authenticated audit; survives restart', () => fixture(async dir => {
  const recovery = await openRecovery(dir);
  assert.throws(() => recovery.reset('synthetic-admin', next, 'YES'), /confirmation/);
  assert.throws(() => recovery.reset('hidden-account', next, 'RESET ADMINISTRATOR'), /existing/);
  const original = fs.readFileSync(path.join(dir, 'lab.db'));
  const result = recovery.reset('synthetic-admin', next, 'RESET ADMINISTRATOR');
  assert.deepEqual(fs.readFileSync(result.backup), original);
  assert.throws(() => recovery.reset('synthetic-admin', next, 'RESET ADMINISTRATOR'), /complete/);
  recovery.close();
  const db = new Database(dir, { migrateLegacy: false });
  try {
    await db.init(); assert.ok(db.verifyUser('synthetic-admin', next)); assert.equal(db.verifyUser('synthetic-admin', password), null);
    const old = new db.SQL.Database(original);
    try {
      const names = db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").map(r => r.name);
      for (const name of names.filter(n => !['users', 'audit_log'].includes(n))) assert.deepEqual(db.db.exec(`SELECT * FROM "${name}"`), old.exec(`SELECT * FROM "${name}"`));
      assert.equal(db.all('SELECT * FROM users').length, 1);
      assert.equal(db.get("SELECT changed_by FROM audit_log WHERE action='offline-administrator-recovery'").changed_by, 'offline-os-administrator:' + os.userInfo().username);
      assert.match(db.get('SELECT password_hash FROM users').password_hash, /^scrypt\$/);
    } finally { old.close(); }
  } finally { db.close(); }
}));
test('active ownership, unsupported schema and replacement failure fail closed', () => fixture(async dir => {
  const filename = path.join(dir, 'lab.db');
  const db = new Database(dir, { migrateLegacy: false }); await db.init();
  try { await assert.rejects(openRecovery(dir), /in use/); } finally { db.close(); }
  const original = fs.readFileSync(filename);
  const recovery = await openRecovery(dir), rename = fs.renameSync;
  fs.renameSync = () => { throw new Error('Synthetic replacement failure'); };
  try { assert.throws(() => recovery.reset('synthetic-admin', next, 'RESET ADMINISTRATOR'), /replacement failure/); }
  finally { fs.renameSync = rename; recovery.close(); }
  assert.deepEqual(fs.readFileSync(filename), original);
  const SQL = await require('sql.js')(), future = new SQL.Database(original);
  future.run('PRAGMA user_version=99'); const bytes = Buffer.from(future.export()); future.close(); fs.writeFileSync(filename, bytes);
  await assert.rejects(openRecovery(dir), /newer/); assert.deepEqual(fs.readFileSync(filename), bytes);
  assert.equal(fs.existsSync(filename + '.lock'), false);
}));
test('invalid paths, missing databases and failed OS access never create accounts', () => fixture(async dir => {
  await assert.rejects(openRecovery('relative'), /absolute/);
  const original = fs.readFileSync(path.join(dir, 'lab.db')), access = fs.accessSync;
  fs.accessSync = () => { throw new Error('Synthetic OS access denied'); };
  try { await assert.rejects(openRecovery(dir), /access denied/); } finally { fs.accessSync = access; }
  assert.deepEqual(fs.readFileSync(path.join(dir, 'lab.db')), original);
  const empty = path.join(dir, 'empty'); fs.mkdirSync(empty);
  await assert.rejects(openRecovery(empty), /ENOENT/); assert.equal(fs.existsSync(path.join(empty, 'lab.db')), false);
}));
test('recovery IPC rejects other senders and closing during validation releases ownership before quit', async () => {
  const { EventEmitter } = require('events'), handlers = new Map(), service = require('../electron/administratorRecovery.cjs');
  let win, resolve, closed = 0, quits = 0;
  const original = service.openRecovery;
  service.openRecovery = () => new Promise(r => { resolve = r; });
  const app = Object.assign(new EventEmitter(), { setPath() {}, whenReady: () => Promise.resolve(), getVersion: () => 'synthetic', quit() { quits++; this.emit('will-quit'); this.emit('quit'); } });
  class Window extends EventEmitter {
    constructor() { super(); win = this; this.destroyed = false; this.webContents = Object.assign(new EventEmitter(), { mainFrame: {}, setWindowOpenHandler() {} }); }
    isDestroyed() { return this.destroyed; }
    loadURL(url) { this.webContents.mainFrame.url = url; }
  }
  try {
    require('../electron/recoveryEntry.cjs').start({ app, BrowserWindow: Window, ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, dialog: { showOpenDialog: async () => ({ filePaths: [os.tmpdir()] }) } });
    await new Promise(r => setImmediate(r));
    await assert.rejects(handlers.get('recovery:select')({ sender: {}, senderFrame: {} }), /Permission denied/);
    const event = { sender: win.webContents, senderFrame: win.webContents.mainFrame };
    const pending = handlers.get('recovery:select')(event);
    await new Promise(r => setImmediate(r)); win.destroyed = true; win.emit('closed'); app.emit('window-all-closed');
    assert.equal(quits, 0);
    resolve({ close: () => { closed++; }, admins: [] });
    await assert.rejects(pending, /closed/); assert.equal(closed, 1); assert.equal(quits, 1);
  } finally { service.openRecovery = original; }
});
