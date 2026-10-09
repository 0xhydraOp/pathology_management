const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {atomic, audit} = require('./applicationOperations.cjs');
const recovery = require('./recovery.cjs');

function actor(db, user, admin = false) {
  const stored = Number.isSafeInteger(user?.id) && db.get('SELECT id,username,role FROM users WHERE id=?', [user.id]);
  if (!stored || !['admin', 'staff'].includes(stored.role) || (admin && stored.role !== 'admin')) throw new Error('Permission denied: administrator authorization is required for backup settings.');
  return stored;
}
function getHealth(db, user, now = Date.now()) {
  const authenticated = actor(db, user);
  const row = db.get('SELECT * FROM backup_health WHERE id=1');
  if (!row) throw new Error('Backup status is unavailable. Restart and check database migration.');
  const at = Date.parse(row.last_external_at);
  const clockUncertain = Number.isFinite(at) && at > now;
  const ageDays = Number.isFinite(at) && !clockUncertain ? Math.floor((now - at) / 86400000) : null;
  const due = !!row.reminder_enabled && (ageDays == null || ageDays >= row.reminder_days);
  return {enabled: !!row.reminder_enabled, days: row.reminder_days, lastExternalAt: row.last_external_at,
    kind: row.last_external_kind, name: row.last_external_name, size: row.last_external_size,
    ageDays, clockUncertain, due, canConfigure: authenticated.role === 'admin',
    localRecoveryAt: db.getLastBackupDate()?.toISOString?.() || null};
}
function configureReminder(db, user, input) {
  const authenticated = actor(db, user, true);
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !['enabled','days'].includes(k)) || typeof input.enabled !== 'boolean' || !Number.isSafeInteger(input.days) || input.days < 1 || input.days > 365) throw new Error('Choose a backup reminder interval from 1 to 365 days.');
  return atomic(db, () => {
    db.db.run('UPDATE backup_health SET reminder_enabled=?,reminder_days=? WHERE id=1', [input.enabled ? 1 : 0, input.days]);
    audit(db, authenticated, 'configure-backup-reminder', null, {enabled:input.enabled, days:input.days});
    return getHealth(db, authenticated);
  });
}

// Internal main-process hook only. Both buffers come from the successful backup writer,
// never from an IPC request. The encrypted writer authenticates its own envelope first.
function recordVerifiedBackup(db, user, filename, kind, {databaseBytes, expectedFileBytes} = {}) {
  const authenticated = actor(db, user, true);
  if (!['raw','encrypted'].includes(kind) || !Buffer.isBuffer(databaseBytes) || !Buffer.isBuffer(expectedFileBytes)) throw new Error('Backup verification material is missing.');
  const plain = Buffer.from(databaseBytes), expected = Buffer.from(expectedFileBytes);
  recovery.inspect(db.SQL, plain, {current:true, expected:db.db});
  if (kind === 'raw' && !plain.equals(expected)) throw new Error('Raw backup differs from the verified database.');
  if (kind === 'encrypted' && (expected.length < 53 || !expected.subarray(0,8).equals(Buffer.from('LABBAK02')))) throw new Error('Encrypted backup format is unsupported.');
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== expected.length) throw new Error('Backup verification failed: output file changed.');
  const actual = fs.readFileSync(filename);
  if (!actual.equals(expected)) throw new Error('Backup verification failed: output bytes changed.');
  const canonical = fs.realpathSync(filename), root = fs.realpathSync(db.dataRoot);
  const relative = path.relative(root, canonical);
  if (relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) return {recorded:false, reason:'local-recovery'};
  const digest = crypto.createHash('sha256').update(actual).digest('hex');
  return atomic(db, () => {
    db.db.run('UPDATE backup_health SET last_external_at=?,last_external_kind=?,last_external_name=?,last_external_size=?,last_external_digest=? WHERE id=1', [new Date().toISOString(),kind,path.basename(canonical),stat.size,digest]);
    audit(db, authenticated, 'verified-user-selected-backup', null, {kind,size:stat.size,digest});
    return {recorded:true};
  });
}
module.exports = {getHealth, configureReminder, recordVerifiedBackup};
