import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { buildBootstrapSql } from '../scripts/owner-bootstrap.mjs';
import { startSyntheticWorker } from './fixture.mjs';

test('operator bootstrap registration replaces only pending tokens and rolls back against an active owner', { timeout: 60000 }, async () => {
  const f = await startSyntheticWorker();
  const metadata = marker => {
    const createdAt = Math.floor(Date.now() / 1000);
    return { id: randomUUID(), tokenHash: createHash('sha256').update('synthetic-' + marker).digest('base64url'), createdAt, expiresAt: createdAt + 900 };
  };
  try {
    const first = metadata('first'), second = metadata('second');
    await f.db.exec(buildBootstrapSql(first).replaceAll('\n', ' '));
    await f.db.exec(buildBootstrapSql(second).replaceAll('\n', ' '));
    assert.equal((await f.db.prepare('SELECT consumed_at FROM owner_auth_bootstrap WHERE id=?').bind(first.id).first()).consumed_at, second.createdAt);
    assert.equal((await f.db.prepare('SELECT consumed_at FROM owner_auth_bootstrap WHERE id=?').bind(second.id).first()).consumed_at, null);
    await f.db.prepare("UPDATE owner_auth_identity SET state='active',user_id='user_synthetic' WHERE id=1").run();
    const rejected = metadata('rejected');
    await assert.rejects(f.db.exec(buildBootstrapSql(rejected).replaceAll('\n', ' ')));
    assert.equal((await f.db.prepare('SELECT consumed_at FROM owner_auth_bootstrap WHERE id=?').bind(second.id).first()).consumed_at, null);
    assert.equal((await f.db.prepare('SELECT count(*) n FROM owner_auth_bootstrap').first()).n, 2);
    assert.equal((await f.db.prepare("SELECT count(*) n FROM owner_audit WHERE action='owner.bootstrap.register'").first()).n, 2);
    assert.throws(() => buildBootstrapSql({ ...first, expiresAt: first.createdAt + 901 }));
    assert.throws(() => buildBootstrapSql({ ...first, tokenHash: 'malformed' }));
  } finally { await f.close(); }
});
