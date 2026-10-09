// Test-only composition of the actual local backend, with authenticated sessions.
// Callers own synthetic temporary databases; there is no entitlement fixture.
async function registerApplicationFixture(ipc, db, services = {}) {
  return require('../electron/applicationIpc.cjs').registerApplicationIpc(ipc, db, services);
}
async function registerReferenceFixture(ipc, db, services = {}) {
  return require('../electron/referenceIpc.cjs').registerReferenceIpc(ipc, db, services);
}
module.exports = { registerApplicationFixture, registerReferenceFixture };
