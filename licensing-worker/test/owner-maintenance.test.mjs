import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { buildMaintenanceSql } from '../scripts/owner-maintenance.mjs';
import { startSyntheticWorker } from './fixture.mjs';

function metadata(purpose, overrides = {}) {
  const id = randomUUID(), createdAt = Math.floor(Date.now() / 1000);
  return { id, tokenHash: createHash('sha256').update('synthetic-' + id).digest('base64url'), purpose, ownerUserId: 'user_synthetic', operationId: null, ownerEpoch: 3, createdAt, expiresAt: createdAt + 900, ...overrides };
}
const execute = (db, value) => db.exec(buildMaintenanceSql(value).replaceAll('\n', ' '));

test('operator recovery capability requires exact verified UID/epoch/backup and failed registrations roll back', { timeout: 60000 }, async () => {
  const f = await startSyntheticWorker();
  try {
    await f.db.prepare("INSERT INTO owner_auth_identity(id,email,user_id,state,epoch,backup_factor_id,backup_verified_at) VALUES(1,'iamrobiul94@gmail.com','user_synthetic','active',3,'factor_synthetic_backup',1)").run();
    const first = metadata('primary-recovery'); await execute(f.db, first);
    for (const invalid of [metadata('primary-recovery', { ownerUserId: 'user_other' }), metadata('primary-recovery', { ownerEpoch: 2 })]) await assert.rejects(execute(f.db, invalid));
    await f.db.prepare('UPDATE owner_auth_identity SET backup_verified_at=NULL WHERE id=1').run();
    await assert.rejects(execute(f.db, metadata('primary-recovery')));
    assert.equal((await f.db.prepare('SELECT consumed_at FROM owner_auth_operator_tickets WHERE id=?').bind(first.id).first()).consumed_at, null);
    await f.db.prepare("UPDATE owner_auth_identity SET backup_verified_at=1,state='credential-changing' WHERE id=1").run();
    const next = metadata('primary-recovery'); await execute(f.db, next);
    assert.equal((await f.db.prepare('SELECT consumed_at FROM owner_auth_operator_tickets WHERE id=?').bind(first.id).first()).consumed_at, next.createdAt);
    assert.equal((await f.db.prepare('SELECT count(*) n FROM owner_auth_operator_tickets').first()).n, 2);
    assert.equal((await f.db.prepare("SELECT count(*) n FROM owner_audit WHERE action='owner.maintenance.register'").first()).n, 2);
  } finally { await f.close(); }
});

test('provisioning capability binds the durable operation and cannot reset a verified owner or rebind IDs', { timeout: 60000 }, async () => {
  const f = await startSyntheticWorker();
  try {
    const operationId = randomUUID(), externalId = 'patholy-owner-' + operationId;
    await f.db.prepare("INSERT INTO owner_auth_identity(id,email,user_id,state,epoch,external_id,provision_operation_id) VALUES(1,'iamrobiul94@gmail.com',NULL,'provisioning',3,?,?)").bind(externalId, operationId).run();
    await f.db.prepare("INSERT INTO owner_auth_operations(id,kind,external_id,stage,epoch,created_at) VALUES(?,'provision',?,'creating',3,1)").bind(operationId, externalId).run();
    const unbound = metadata('provision-reconcile', { ownerUserId: null, operationId }); await execute(f.db, unbound);
    await assert.rejects(execute(f.db, metadata('provision-reconcile', { ownerUserId: null, operationId: randomUUID() })));
    await f.db.prepare("UPDATE owner_auth_identity SET user_id='user_synthetic',state='active' WHERE id=1").run();
    await execute(f.db, metadata('provision-reconcile', { operationId }));
    await f.db.prepare('UPDATE owner_auth_identity SET factor_verified_at=1 WHERE id=1').run();
    await assert.rejects(execute(f.db, metadata('provision-reconcile', { operationId })));
    await assert.rejects(f.db.prepare("UPDATE owner_auth_identity SET user_id='user_other' WHERE id=1").run());
    await assert.rejects(f.db.prepare("UPDATE owner_auth_identity SET external_id='other' WHERE id=1").run());
    assert.equal((await f.db.prepare('SELECT user_id FROM owner_auth_identity').first()).user_id, 'user_synthetic');
    assert.throws(() => buildMaintenanceSql(metadata('primary-recovery', { ownerUserId: "user_bad' SQL" })));
    assert.throws(() => buildMaintenanceSql(metadata('primary-recovery', { purpose: 'claim-admin' })));
  } finally { await f.close(); }
});
