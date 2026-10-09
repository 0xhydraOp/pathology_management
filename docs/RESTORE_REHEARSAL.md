# Offline restore rehearsal

Rehearse on a spare computer or an isolated synthetic data directory, never over the operating lab database. A backup file existing is not evidence that restoration works. Backup readiness reminders distinguish verified user-selected files outside the app data folder from local recovery copies; neither proves offsite storage. The date is a recorded verification time, not a continuing check that the destination still exists.

## Routine

1. An administrator creates an encrypted portable backup with a passphrase kept separately. Copy it onto protected separate storage. Do not record passwords in this checklist.
2. Open a test installation with a separate data directory and synthetic accounts. Confirm the active directory before selecting restore. Keep the operational application untouched.
3. Select and validate the copied backup. A wrong passphrase or damaged file must produce an actionable error and preserve the test database. Cancel once to confirm nothing changes.
4. Review the replacement counts. Confirm only in the isolated installation. Verify the pre-restore recovery copy is present and usable; restoration replaces the complete database, not merges it.
5. Login with the restored local account. Check synthetic patient/order counts, interval approvals, clinical audits, billing history and an issued report. Check all amended versions if present. Compare saved snapshots and amounts rather than recalculating from current settings.
6. Close and reopen the test app. Recheck the same records, accounts and report versions. Test a second-instance attempt; it must not become a second writer.
7. Print a saved report in full and pad modes. Compare saved names, units, intervals, results and version labels. Physical printer alignment needs an actual printer test.
8. Record date, app version, test machine/Windows version, backup SHA-256, checks performed, outcome and reviewer. Exclude patient details and credentials from any shared verification summary. Retain the original portable backup and passphrase separately.

After restore, external backup status is cleared because metadata inside a copied database cannot establish a verified backup for the current installation. Create and verify a new portable backup. Reminder configuration is non-blocking; staff can view status, administrators configure it. Reminders do not restrict viewing, entry or emergency recovery.

## Manual acceptance matrix

| Scenario | Evidence required | Status without execution |
|---|---|---|
| Wrong passphrase/tampered/truncated backup | Authentication fails before active replacement | NOT TESTED |
| Destination full/read-only/disconnected | Original usable, clear error, no advanced backup date | NOT TESTED |
| Cancellation and session expiry | Original bytes and accounts unchanged | NOT TESTED |
| Restore/restart | Snapshot versions, approvals, billing and audit equality | NOT TESTED |
| Second Windows computer/Windows 10 | Independent installation and recovery rehearsal | NOT TESTED |
| Elevated installer upgrade | App data preserved, compatible migration backup | NOT TESTED |
| Physical printer and pad alignment | Measured paper/100 mm scale, unclipped rows | NOT TESTED |
| Forced process termination | Restart uses complete previous or committed snapshot | NOT TESTED |
| Actual power loss | Dedicated test hardware and filesystem evaluation | NOT TESTED |

Mark a row PASS only with actual evidence and scope (automated fixture, packaged app, or physical device). Terminating a synthetic process is not a power-loss test. Browser/compositor PDFs do not prove driver compatibility. Do not deliberately power off a working lab computer.

## Failure handling

Do not remove an active or ambiguous ownership lock. Do not replace corruption with an empty database. Preserve the original file and verified local recovery copies; stop the app and follow [RECOVERY.md](RECOVERY.md). Full-snapshot replacement uses a flushed sibling temporary file and rename, but disk/controller caches, directory durability, inherited Windows permissions and sudden power loss remain platform limitations. Disk encryption and separate protected backups are still required. There is no network recovery service or hidden administrator account.
