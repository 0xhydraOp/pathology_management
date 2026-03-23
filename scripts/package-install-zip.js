/**
 * After electron-builder (NSIS only): copy install notes, then create a ZIP that
 * contains the Setup .exe + README — NOT a portable app folder.
 *
 * Users extract the ZIP and run **MONDAL DIAGNOSTIC CENTRE Setup x.x.x.exe** to install.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const releaseDir = path.join(root, 'release');
const srcReadme = path.join(root, 'WINDOWS_INSTALL.txt');
const readmeName = 'READ_ME_FIRST_Windows_Install.txt';
const readmeInRelease = path.join(releaseDir, readmeName);

if (!fs.existsSync(releaseDir)) {
  console.warn('[package-install-zip] release/ missing, skip.');
  process.exit(0);
}

if (fs.existsSync(srcReadme)) {
  fs.copyFileSync(srcReadme, readmeInRelease);
  console.log('[package-install-zip] Copied WINDOWS_INSTALL.txt → release/' + readmeName);
} else {
  console.warn('[package-install-zip] WINDOWS_INSTALL.txt missing.');
}

const files = fs.readdirSync(releaseDir);
const setup = files.find(
  (f) => f.endsWith('.exe') && /setup/i.test(f) && !f.toLowerCase().includes('uninstall') && !f.startsWith('__')
);

if (!setup) {
  console.error('[package-install-zip] NSIS Setup .exe not found in release/. Build NSIS first.');
  process.exit(1);
}

// Remove legacy portable zip from older builds (extract-and-run folder archive)
files
  .filter((f) => f.endsWith('.zip') && /-win\.zip$/i.test(f))
  .forEach((f) => {
    try {
      fs.unlinkSync(path.join(releaseDir, f));
      console.log('[package-install-zip] Removed old portable archive:', f);
    } catch (e) {
      console.warn('[package-install-zip] Could not remove', f, e.message);
    }
  });

const zipBase = `MONDAL DIAGNOSTIC CENTRE-${version}-Windows-Install-Package.zip`;
const destZip = path.join(releaseDir, zipBase);

// Remove previous install-package zip if re-running
try {
  if (fs.existsSync(destZip)) fs.unlinkSync(destZip);
} catch (_) {}

const setupPath = path.join(releaseDir, setup);
const pathsToZip = fs.existsSync(readmeInRelease) ? [setupPath, readmeInRelease] : [setupPath];

if (process.platform !== 'win32') {
  console.warn('[package-install-zip] Non-Windows: cannot run Compress-Archive. Copy Setup.exe manually or build on Windows.');
  console.warn('[package-install-zip] Setup at:', setupPath);
  process.exit(0);
}

const lit = pathsToZip.map((p) => JSON.stringify(p)).join(',');
const destJson = JSON.stringify(destZip);
const cmd = `Compress-Archive -LiteralPath @(${lit}) -DestinationPath ${destJson} -Force`;
try {
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], {
    stdio: 'inherit',
    cwd: releaseDir,
  });
  console.log('[package-install-zip] Created:', destZip);
} catch (e) {
  console.error('[package-install-zip] Failed:', e.message);
  process.exit(1);
}
