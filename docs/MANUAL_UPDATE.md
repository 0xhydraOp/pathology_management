# Manual offline updates

Pathology Management System operates fully offline. No activation, remote account or automatic updater is required. Downloads can be obtained on another computer and transferred using media protected against malware. Windows binaries are unsigned; do not treat an executable's filename or a checksum alone as proof that it came from the publisher.

## Before updating

1. Record the current application version and installation/data locations. Keep the installer for the current version and its trusted checksum.
2. In the application, create an administrator-authorized encrypted portable backup using a passphrase kept separately. Verify the file and rehearse restoration using an isolated synthetic/controlled copy, never by overwriting the working lab as a test. Keep a second protected copy on separate storage.
3. Finish pending work, then close every application window and recovery tool. Confirm no second process is using the data directory. Never remove a live or ambiguous ownership lock to force an upgrade.
4. Obtain the approved installer and SHA256SUMS.txt from the project's release. Check the published limitations and required Windows version. Verify the SHA-256 against a trusted independently obtained checksum:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath "C:\Downloads\Pathology Management System Offline Setup <version>.exe"
```

5. Do not proceed with mismatched bytes or an unexplained publisher/version. An unsigned build may trigger Windows warnings; apply the organization's security policy rather than disabling protection.

## Update and verify

Use the approved installer, retaining the existing application identity and data location. The Inno installer defaults to a per-user installation without elevation. Never select the lab database directory as the installation target. For Inno-to-Inno updates, install in place. For the historical NSIS transition, follow INNO_INSTALLATION.md: make a verified backup and uninstall the old program without removing lab data before installing the new Inno package. Installation/upgrade must be validated in an isolated Windows environment before broad lab rollout.

The application makes verified pre-migration recovery copies before supported database changes. These local unencrypted copies do not replace an external encrypted backup. Preserve patients, users, snapshots and billing; never accept a newly empty database as a successful upgrade. If startup reports corruption or migration failure, stop and preserve the original files and recovery copies.

After updating, sign in with the existing local account. Check patient identification, a historical issued report, a billed order, approvals, print settings and backup status. Print a synthetic calibration/report before using a changed driver or pad. A newly offered first-run setup on a database that had users is unexpected: stop before creating an account.

## Rollback is a restore operation

Keep the previous executable/installer and its matching pre-upgrade database backup. **Do not launch an older binary against a newer schema.** Newer report-version or ledger records may not be readable by an older application. Never delete new tables or rewrite the schema version to force compatibility.

If rollback is necessary, close all processes, preserve the failed/new database separately and restore the verified pre-upgrade backup through an approved compatible offline recovery procedure. The backup and binary must be schema-compatible. A pre-upgrade restore loses all changes made after that backup; review and reconcile those changes explicitly. Do not silently merge databases or discard issued versions/payment events.

A portable encrypted backup requires its passphrase. Losing the passphrase cannot be repaired by the developer. Administrator recovery changes a local existing administrator's password using OS access and the packaged tool; it is not a database rollback, schema converter or encryption bypass. See RECOVERY.md.

## Uninstall and known limits

The installer configuration preserves application data on uninstall. Actual elevated uninstall/data-survival testing is pending; back up before any uninstall and verify the data directory afterward. Removing the program is not consent to remove patients or recovery copies.

See WINDOWS_READINESS_MATRIX.md for current evidence. Physical printing, Windows 10/second-machine coverage, elevated installation/upgrade and actual power-loss tests remain NOT TESTED where unavailable. Migration snapshots and atomic file replacement reduce failure risk but do not guarantee survival of disk failure or power loss; keep verified backups on separate protected storage.
