# Pathology Management System

A fully offline Electron + React workspace for pathology laboratories. Setup and daily operation require no internet, activation key, trial, remote account or licence server.

Prepared final version: **1.1.0**. Windows binaries are **unsigned**. The reviewed code includes the professional-readiness changes; wider Windows installation and laboratory validation remain pending; it is not clinical certification. Published 1.1.0-rc.1 and older notes describe historical builds, not current requirements.

## Windows installation and first run

Download the matching Windows x64 installer and SHA256SUMS.txt from GitHub Releases. Verify the SHA-256 before running. Windows 10 and 11 x64 are the supported Electron targets; Windows 11 is tested. Windows 7/8/8.1 and 32-bit systems are unsupported. Unsigned executables may trigger Windows reputation warnings; signing and reputation are not provided.

The Windows installer is built with Inno Setup. Install into a chosen local folder. For older NSIS installations, read [Inno installation and migration](docs/INNO_INSTALLATION.md): make a verified backup and remove the old program without removing its data before installing this version. First launch: **create your own local administrator username/password → login → use the app**. No default account is supplied. Closing before administrator creation safely resumes setup; completing creation then closing resumes at login. Existing users and records remain local. Legacy default credentials must be replaced through the existing protected flow.

See the [local setup and login guide](docs/SETUP_LOGIN.md) for password requirements, keyboard controls, retry cooldown and recovery guidance. The internal application ID and data-directory identity are retained for upgrades. Do not delete the data folder or open simultaneous older/newer versions against it. Uninstalling must not delete lab data.

## Features

Patient registration and search; compact numeric/qualitative result entry; ordered-test completion; exact-money payment ledger, refunds and daily reconciliation; editable and approved reference intervals; explicit preview/finalization; immutable issued-report versions and controlled administrator amendments; full-report and preprinted-pad printing; calibration and pagination; local lab settings and staff roles; encrypted portable backup/restore with configurable non-blocking backup reminders; packaged administrator recovery.

See [report amendments](docs/REPORT_AMENDMENTS.md), [billing ledger](docs/BILLING_LEDGER.md), [restore rehearsal](docs/RESTORE_REHEARSAL.md) and the [Windows evidence matrix](docs/WINDOWS_READINESS_MATRIX.md). The additive professional schema upgrade creates a verified pre-migration copy; older supported schema-1 encrypted backups normalize offline before replacement. Original issued JSON and historical billed prices remain preserved.

Reference intervals, clinical formulae and critical thresholds require laboratory validation. The [clinical review pack](docs/CLINICAL_REVIEW_PACK.md) inventories existing rules and synthetic examples for qualified laboratory approval. Missing or uncertain intervals and incompatible calculation units require manual review; the software does not invent clinical values.

## Data, backups and recovery

Keep verified backups on a separate protected device. Admin-only portable backups use a user-chosen passphrase and authenticated encryption. Lost passphrases cannot recover those backups. Local automatic recovery copies are not encrypted portable backups: protect their directory with OS permissions/disk encryption.

Offline conversion creates and verifies a database recovery copy before archiving/removing recognized obsolete activation files. Patients, results, bills, users, approvals, issued snapshots, print settings and clinical audit history are retained. Formerly expired/unactivated installations use ordinary local authorization. Unknown sibling files remain untouched. See [offline migration](docs/OFFLINE_RELEASE.md) and [recovery instructions](docs/RECOVERY.md).

With the app closed, use the installed **Recover Administrator.cmd** launcher; it uses bundled Electron, not a separately installed Node runtime. Recovery requires OS access to the selected database directory, preserves audits and has no hidden account. A database containing history but no valid user enters recovery rather than exposing fresh unauthenticated setup.

## Printing

See [PRINTING.md](docs/PRINTING.md). Draft printing stays labelled DRAFT and never issues a report. Finalization is explicit and atomic; issued reprints use the archived clinical snapshot. Current physical alignment offsets can adjust paper positioning. Keep browser headers/footers off and scale at 100%; test the synthetic 100 mm calibration line. Physical printer alignment and printer-driver compatibility are not established by compositor PDFs.

## Security and limitations

Salted password hashing, main-process roles/permissions, stale-session rejection, authenticated audits, restricted IPC, immutable reports, database ownership locks and recoverable file replacement remain enforced. No licensing bypass flag or remote authentication exists. Anyone controlling the OS/files/application can tamper with local software or obtain its data; use separate OS accounts, disk encryption and protected backups. Filesystem/power-loss durability is not absolute. No test suite or dependency audit proves complete security.

Physical printing, elevated installation/upgrade and actual power-loss checks remain NOT TESTED unless explicitly listed in candidate verification. No remote patient access, telemetry, online payments or automatic updater is required by this app.

## Development and verification

Use Node >=22.12.0: `npm ci`, `npm test`, `npm run build`. `npm run electron:dev` uses a local development server; packaged builds load local assets. `npm run electron:build` packages Electron local assets, invokes the installed Inno Setup compiler and creates the exact-version unsigned installer/archive. Set INNO_COMPILER to ISCC.exe if it is not installed in a standard location. Browser/PDF/packaged checks use Playwright and documented Python dependencies, synthetic patients and isolated temporary databases only. Do not point tests at lab data.

Website files are intentionally unchanged; their activation/licence wording is outdated and requires a separate website task. No domain or Cloudflare resource is changed by this conversion.

## MIT licence

[MIT](LICENSE), copyright 2026 **Robiul Islam Molla**. Recipients may reuse, modify and redistribute this project's code under MIT. MIT does not relicense dependencies; [third-party notices](THIRD_PARTY_NOTICES.md) accompany the distribution.
