/**
 * Wipe all transactional lab data (patients, orders, results, etc.).
 * Does not remove users or the investigation catalogue. For admin / support only.
 * Run: node scripts/clear-all-data.js
 *
 * Uses the same database folder as the Electron app when possible:
 *   %APPDATA%\mondal-diagnostic-centre\lab.db  (package "name")
 * Falls back to legacy: %APPDATA%\MondalDiagnosticCentre\lab.db
 * Override: set ELECTRON_USER_DATA to the full userData directory path.
 */
const fs = require('fs');
const path = require('path');
const Database = require(path.join(__dirname, '../electron/database.js'));

function resolveUserDataRoot() {
  if (process.env.ELECTRON_USER_DATA) {
    return path.normalize(process.env.ELECTRON_USER_DATA.trim());
  }
  const roaming = process.env.APPDATA
    || path.join(process.env.USERPROFILE || process.env.HOME || '', 'AppData', 'Roaming');
  const pkgName = 'mondal-diagnostic-centre';
  const nextRoot = path.join(roaming, pkgName);
  const legacyRoot = Database.legacyAppDataDir();
  const nextDb = path.join(nextRoot, 'lab.db');
  const legacyDb = path.join(legacyRoot, 'lab.db');
  if (fs.existsSync(nextDb)) return nextRoot;
  if (fs.existsSync(legacyDb)) return legacyRoot;
  return nextRoot;
}

async function main() {
  const root = resolveUserDataRoot();
  console.log('Using data folder:', root);
  const db = new Database(root);
  await db.init();
  db.clearAllPatients();
  console.log('All patients, orders, results, print logs, and patient ID sequence cleared.');
  console.log('Users, lab settings, and investigation catalogue were not changed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
