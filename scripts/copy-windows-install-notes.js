/**
 * After electron-builder, copy WINDOWS_INSTALL.txt into release/ so the
 * folder always explains Setup .exe vs .zip (Setup is never inside the zip).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'WINDOWS_INSTALL.txt');
const releaseDir = path.join(root, 'release');
const dest = path.join(releaseDir, 'WINDOWS_INSTALL.txt');

if (!fs.existsSync(src)) {
  console.warn('[copy-windows-install-notes] WINDOWS_INSTALL.txt missing, skip.');
  process.exit(0);
}
if (!fs.existsSync(releaseDir)) {
  console.warn('[copy-windows-install-notes] release/ missing, skip.');
  process.exit(0);
}
fs.copyFileSync(src, dest);
console.log('[copy-windows-install-notes] Copied WINDOWS_INSTALL.txt → release/');
