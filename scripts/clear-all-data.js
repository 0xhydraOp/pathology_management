/**
 * Wipe all transactional lab data (patients, orders, results, etc.).
 * Does not remove users or the investigation catalogue. For admin / support only.
 * Run: node scripts/clear-all-data.js
 */
const path = require('path');
const Database = require(path.join(__dirname, '../electron/database.js'));

async function main() {
  const db = new Database();
  await db.init();
  db.clearAllPatients();
  console.log('All patients, orders, and results deleted.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
