/**
 * Create GitHub release with zip asset.
 * Prerequisites:
 *   1. Run: gh auth login   (one-time setup)
 *   2. Build: npm run electron:build
 * Run: node scripts/create-release.js
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const zipPath = path.join(root, 'dist', 'MONDAL DIAGNOSTIC CENTRE-1.0.0-win.zip');
const notesPath = path.join(root, 'dist', 'release-notes.md');

if (!fs.existsSync(zipPath)) {
  console.error('ZIP not found. Run: npm run electron:build');
  process.exit(1);
}

const notes = `## Pathology Lab Management System v1.0.0

**Download the ZIP** below to run the app without installing (portable). Extract and run \`MONDAL DIAGNOSTIC CENTRE.exe\`.

### What's new
- **Billing**: Card view, Today/Unpaid/Paid filters, View & Print invoice buttons
- **Bill Invoice**: Half A4 size, auto-calculated total, patient + test details
- **Bug fixes**: Reports/DB null guards, Windows path handling, JSON error handling
- **Lab name** from Settings in header and Dashboard
- **Referrals**: Today period, All Time date fix
- **Cleanup**: Removed unused files, clear dummy data

### Requirements
- Windows 10/11 (64-bit)
- No installation needed for ZIP - just extract and run the .exe

### Login
- Username: **admin**
- Password: **admin123**`;

fs.writeFileSync(notesPath, notes, 'utf8');
try {
  execSync(`gh release create v1.0.0 --title "v1.0.0 - MONDAL DIAGNOSTIC CENTRE" --notes-file "${notesPath}" "${zipPath}"`, {
    cwd: root,
    stdio: 'inherit',
  });
  console.log('Release created. Check: https://github.com/0xhydraOp/pathology_management/releases');
} finally {
  try { fs.unlinkSync(notesPath); } catch (_) {}
}
