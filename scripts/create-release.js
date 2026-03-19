/**
 * Create or update GitHub release with Windows installer (NSIS) + ZIP.
 *
 * Prerequisites:
 *   1. gh auth login
 *   2. npm run electron:build
 *
 * Run: node scripts/create-release.js
 *
 * Artifacts are read from ./release/ (see package.json build.directories.output).
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const tag = `v${version}`;
const product = pkg.build?.productName || pkg.name;
const releaseDir = path.join(root, 'release');

if (!fs.existsSync(releaseDir)) {
  console.error('Release folder missing. Run: npm run electron:build');
  process.exit(1);
}

const files = fs.readdirSync(releaseDir);
const zip = files.find((f) => f.endsWith('.zip'));
const setup =
  files.find((f) => f.endsWith('.exe') && /setup/i.test(f)) ||
  files.find(
    (f) => f.endsWith('.exe') && !f.includes('blockmap') && !f.toLowerCase().includes('elevate')
  );

const assets = [];
if (zip) assets.push(path.join(releaseDir, zip));
if (setup) assets.push(path.join(releaseDir, setup));

if (assets.length === 0) {
  console.error('No .zip or .exe found in release/. Run: npm run electron:build');
  console.error('Found:', files.join(', ') || '(empty)');
  process.exit(1);
}

const notesPath = path.join(releaseDir, 'release-notes.md');
const notes = `## ${product} v${version}

### Recommended install (Windows)
Download **${setup || 'the Setup .exe'}** and run it — NSIS installer with shortcuts, Start Menu entry, and uninstaller.

### ZIP (optional)
**${zip || 'the .zip'}** is an archive of the packaged app (extract anywhere and run the .exe). Use the **Setup** for a proper installation.

### First run
The database is empty until first use. No demo patient data is included.

### Login (initial)
- Username: **admin**
- Password: **admin123**

Change password from Settings when available, or update users in the database per your policy.

### Requirements
- Windows 10/11 (64-bit)`;

fs.writeFileSync(notesPath, notes, 'utf8');

const assetArgs = assets.map((p) => `"${p}"`).join(' ');
try {
  // If release exists, upload assets only; otherwise create release.
  try {
    execSync(`gh release view ${tag}`, { cwd: root, stdio: 'pipe' });
    console.log(`Release ${tag} exists — uploading assets...`);
    execSync(`gh release upload ${tag} ${assetArgs} --clobber`, { cwd: root, stdio: 'inherit' });
  } catch (_) {
    execSync(
      `gh release create ${tag} --title "${tag} - ${product}" --notes-file "${notesPath}" ${assetArgs}`,
      { cwd: root, stdio: 'inherit' }
    );
  }
  const repo = (() => {
    try {
      const u = execSync('git remote get-url origin', { cwd: root, encoding: 'utf8' }).trim();
      const m = u.match(/github\.com[:/]([^/]+\/[^/.]+)/);
      return m ? m[1].replace(/\.git$/, '') : '0xhydraOp/pathology_management';
    } catch (_) {
      return '0xhydraOp/pathology_management';
    }
  })();
  console.log(`\nDone. Releases: https://github.com/${repo}/releases`);
} finally {
  try {
    fs.unlinkSync(notesPath);
  } catch (_) {}
}
