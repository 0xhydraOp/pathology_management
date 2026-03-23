/**
 * Remove intermediate / optional files from release/ after a Windows build.
 * KEEPS: NSIS Setup .exe, Windows-Install-Package.zip, READ_ME / WINDOWS install notes.
 * REMOVES: win-unpacked/, *.blockmap, NSIS temp uninstaller exe, builder-debug.yml, latest.yml, old *-win.zip
 *
 * Run: node scripts/clean-release.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const releaseDir = path.join(root, 'release');

if (!fs.existsSync(releaseDir)) {
  console.log('[clean-release] No release/ folder — nothing to do.');
  process.exit(0);
}

function rmRecursive(p) {
  if (!fs.existsSync(p)) return;
  fs.rmSync(p, { recursive: true, force: true });
}

const entries = fs.readdirSync(releaseDir, { withFileTypes: true });
let removed = 0;

for (const ent of entries) {
  const name = ent.name;
  const full = path.join(releaseDir, name);

  if (ent.isDirectory()) {
    if (name === 'win-unpacked') {
      rmRecursive(full);
      console.log('[clean-release] Removed folder:', name);
      removed++;
    }
    continue;
  }

  if (name.endsWith('.blockmap')) {
    fs.unlinkSync(full);
    console.log('[clean-release] Removed:', name);
    removed++;
    continue;
  }

  if (name === 'builder-debug.yml' || name === 'latest.yml') {
    fs.unlinkSync(full);
    console.log('[clean-release] Removed:', name);
    removed++;
    continue;
  }

  // NSIS leaves this helper in release/ on some builds
  if (name.startsWith('__uninstaller-nsis') && name.endsWith('.exe')) {
    fs.unlinkSync(full);
    console.log('[clean-release] Removed:', name);
    removed++;
    continue;
  }

  // Legacy portable zip (no longer produced)
  if (name.endsWith('-win.zip')) {
    fs.unlinkSync(full);
    console.log('[clean-release] Removed:', name);
    removed++;
    continue;
  }
}

console.log(
  removed
    ? `[clean-release] Done. Kept Setup .exe, *-Windows-Install-Package.zip, and text notes.`
    : '[clean-release] Nothing removed (folder already minimal or empty).'
);
