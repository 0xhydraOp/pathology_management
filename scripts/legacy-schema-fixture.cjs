// Synthetic test databases only: construct the actual pre-readiness layout.
// Merely lowering user_version leaves new tables behind and is not a migration fixture.
module.exports = function legacyLayout(db, version = 1) {
  db.db.run('PRAGMA foreign_keys=OFF');
  try {
    for (const table of ['registration_requests','report_amendment_requests','report_amendment_drafts','report_versions','billing_events','billing_accounts','backup_health','professional_migrations']) db.db.run(`DROP TABLE ${table}`);
    for (const column of ['calculation_review','calculation_snapshot']) db.db.run(`ALTER TABLE order_results DROP COLUMN ${column}`);
    db.db.run('ALTER TABLE report_print_log DROP COLUMN report_version');
    db.db.run(`PRAGMA user_version=${version}`);
  } finally { db.db.run('PRAGMA foreign_keys=ON'); }
  db.save();
};
