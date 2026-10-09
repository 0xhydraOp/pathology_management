import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { authenticateOwner } from '../src/index.js';

const env = {
  OWNER_ORIGIN: 'https://admin.molladigital.com',
  API_ORIGIN: 'https://license.molladigital.com',
  OWNER_AUTH_MODE: 'workos', OWNER_AUTH_READY: 'false',
  CUSTOMER_PORTAL_ENABLED: 'false',
  SIGNING_PRIVATE_KEY: 'synthetic-unused', SIGNING_KID: 'synthetic',
  RATE_LIMIT_SALT: 'synthetic-only-rate-salt-long-enough',
  RATE_LIMIT_MAX: '30', RATE_LIMIT_WINDOW: '60',
};
const post = (origin, path) => new Request(origin + path, { method: 'POST', headers: {
  origin, 'content-type': 'application/json', 'x-patholy-owner-action': '1',
  authorization: 'Bearer synthetic-old-admin-token',
  'cf-access-jwt-assertion': 'synthetic-old-access-token',
}, body: '{}' });

test('WorkOS routing exposes only authentication shells before readiness; every owner operation fails closed', async () => {
  const noSigning = { ...env, SIGNING_PRIVATE_KEY: undefined };
  for (const path of ['/owner/login', '/owner/setup', '/owner/security', '/owner/recover', '/owner/reconcile', '/owner/auth.js', '/owner/auth.css']) {
    const r = await worker.fetch(new Request(env.OWNER_ORIGIN + path), noSigning);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store');
  }
  for (const path of ['/', '/owner', '/owner/']) {
    const r = await worker.fetch(new Request(env.OWNER_ORIGIN + path), env);
    assert.equal(r.status, 302); assert.equal(r.headers.get('location'), '/owner/login');
  }
  // An unauthenticated security shell cannot read state or perform maintenance.
  for (const route of ['status', 'backup-enroll', 'backup-verify', 'backup-cleanup', 'recover', 'recovery-enroll', 'recovery-verify', 'reconcile', 'reconcile-info']) assert.equal((await worker.fetch(post(env.OWNER_ORIGIN, '/v1/owner-auth/' + route), env)).status, 503);
  for (const path of ['/v1/owner/customers/list', '/v1/owner/customers/create', '/v1/owner/licenses/create', '/v1/owner/devices/list', '/v1/owner/audit/list', '/v1/admin/create']) {
    assert.equal((await worker.fetch(post(env.OWNER_ORIGIN, path), env)).status, 403);
  }
  assert.equal((await worker.fetch(post(env.OWNER_ORIGIN, '/v1/owner-auth/bootstrap'), env)).status, 503);
  await assert.rejects(authenticateOwner(post(env.OWNER_ORIGIN, '/v1/owner/customers/list'), { ...env, OWNER_AUTH_MODE: undefined }));
});

test('owner authentication and setup cannot be reached through the licence, public, preview or HTTP host', async () => {
  for (const origin of [env.API_ORIGIN, 'https://molladigital.com', 'https://patholy.workers.dev', 'http://admin.molladigital.com']) {
    for (const path of ['/owner/login', '/owner/setup', '/owner/security', '/owner/recover', '/owner/reconcile']) assert.equal((await worker.fetch(new Request(origin + path), env)).status, 404);
    for (const path of ['/v1/owner-auth/bootstrap', '/v1/owner-auth/login', '/v1/owner-auth/password', '/v1/owner-auth/recover', '/v1/owner-auth/reconcile']) assert.equal((await worker.fetch(post(origin, path), env)).status, 404);
  }
  for (const path of ['/v1/owner-auth/signup', '/v1/owner-auth/reset', '/v1/owner-auth/change-email']) assert.equal((await worker.fetch(post(env.OWNER_ORIGIN, path), env)).status, 404);
});
