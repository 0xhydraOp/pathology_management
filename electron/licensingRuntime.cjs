const fs = require('fs');
const path = require('path');
const { LicenseManager } = require('./licensing.cjs');
async function createAppLicensing(app, safeStorage, isolatedDataDir) {
  const config = require('./licensing-config.json');
  // Test keys/endpoints are baked into a separately labelled QA package, never
  // supplied by a renderer, environment variable or external licence file.
  if (config.syntheticFixture) {
    const metadata = JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8'));
    if (!metadata.patholySyntheticLicensingFixture || !isolatedDataDir) throw new Error('Synthetic licensing build requires the explicit isolated QA data directory.');
  }
  const licensing = new LicenseManager({
    directory: isolatedDataDir ? path.join(isolatedDataDir, 'activation-material') : path.join(app.getPath('appData'), 'PatholyManagementSystem', 'licensing'),
    config, appVersion: app.getVersion(),
    protect: bytes => {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('OS-protected activation storage is unavailable.');
      if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend?.() === 'basic_text') throw new Error('Unencrypted activation storage is not supported.');
      return safeStorage.encryptString(bytes.toString('utf8'));
    },
    unprotect: bytes => Buffer.from(safeStorage.decryptString(bytes))
  });
  try { await licensing.init(); } catch { licensing.error = 'Activation storage is unavailable. Existing records, issued reprints, backups and recovery remain available.'; }
  const metadata = JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8'));
  const status = licensing.status.bind(licensing);
  licensing.status = () => ({...status(), ...(config.syntheticFixture ? {syntheticFixture:true} : {}),
    activationPendingPrerelease: Boolean(metadata.patholyActivationPendingPrerelease)});
  return licensing;
}
module.exports = { createAppLicensing };
