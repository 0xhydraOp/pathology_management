// Offline recovery uses OS filesystem authority, not a renderer-supplied identity.
const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('./database');
const credentials = require('./credentials.cjs');
const recovery = require('./recovery.cjs');

async function openRecovery(directory) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) throw new Error('Select an absolute existing lab data directory.');
  directory = fs.realpathSync(directory);
  const filename = path.join(directory, 'lab.db');
  if (!fs.lstatSync(filename).isFile()) throw new Error('An existing regular lab.db file is required.');
  fs.accessSync(directory, fs.constants.R_OK | fs.constants.W_OK);
  fs.accessSync(filename, fs.constants.R_OK | fs.constants.W_OK);
  const db = new Database(directory, { migrateLegacy: false });
  try {
    db.acquireLock();
    db.SQL = await require('sql.js')();
    const original = fs.readFileSync(filename);
    recovery.inspect(db.SQL, original, { current: true });
    db.db = new db.SQL.Database(Buffer.from(original));
    const admins = db.all("SELECT id,username FROM users WHERE role='admin' ORDER BY username");
    if (!admins.length) throw new Error('No existing administrator found. This tool cannot create an account.');
    let completed = false;
    return {
      directory, admins,
      reset(username, password, confirmation) {
        if (completed) throw new Error('Recovery is already complete. Close this window and log in.');
        if (confirmation !== 'RESET ADMINISTRATOR') throw new Error('Explicit recovery confirmation required.');
        credentials.validate(password);
        const user = admins.find(user => user.username === username);
        if (!user) throw new Error('Select an existing administrator.');
        // External edits are not silently overwritten even if they ignore our ownership lock.
        if (!fs.readFileSync(filename).equals(original)) throw new Error('Database changed during recovery. Close and start again.');
        const backup = db._backupReferenceUpgrade(original, 'before-administrator-recovery');
        db._referenceAtomic(() => {
          db.db.run('UPDATE users SET password_hash=? WHERE id=? AND role=\'admin\'', [credentials.hash(password), user.id]);
          require('./applicationOperations.cjs').audit(db, { username: 'offline-os-administrator:' + os.userInfo().username }, 'offline-administrator-recovery', user.id);
        });
        completed = true;
        return { ok: true, backup };
      },
      close() { db.db?.close(); db.db = null; db.releaseLock(); }
    };
  } catch (error) { db.db?.close(); db.releaseLock(); throw error; }
}
module.exports = { openRecovery };
