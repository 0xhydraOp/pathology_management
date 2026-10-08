# Credentials, backups and recovery

## First use and password changes

A fresh installation contains no account. The trusted application window must create its administrator before operational IPC calls are available. Setup is an atomic backend operation available only with zero accounts; existing patient data without accounts cannot be taken over through setup. An existing database with accounts never recreates a bootstrap administrator.

New passwords require 12–1024 characters, with no compulsory character categories. Password hashes use independent 16-byte random salts and scrypt (N=32768, r=8, p=3, 64-byte output; 64 MiB memory cap). The `scrypt$<salt>$<hash>` format fixes these parameters for this version. This parameter combination follows the [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

Legacy fixed-salt PBKDF2-SHA512 hashes remain verifiable. A successful legitimate login upgrades its hash atomically and records the authenticated username, without storing or logging the supplied password. The known old default password is detected from its hash regardless of account name or role. That account receives a restricted session: session inspection, logout and current-password replacement are available; patient/results/configuration/printing operations are denied in the common backend authorization gate. Users can switch to another legitimate account. Existing non-default accounts continue working, including older passwords shorter than the new creation policy.

Password replacement requires the current password. Admin account creation/reset uses the same backend password policy. Credential changes revoke all sessions for the affected account. There is no hidden account, universal reset password, email dependency or online service.

## Portable encrypted backups

Settings provides administrator-only encrypted backups in the app folder or a selected location. Supply a unique passphrase of at least 12 characters and keep it separately from the backup. **A lost passphrase cannot recover an encrypted backup.** The application embeds no decryption secret.

Version 2 envelope: `LABBAK02` magic, 16-byte random salt, 12-byte random nonce, AES-256-GCM ciphertext and 16-byte authentication tag. The entire header is authenticated additional data. Keys use the fixed scrypt parameters above; unsupported envelopes cannot request arbitrary KDF work. Wrong passphrase, changed metadata, changed ciphertext/tag and truncation fail authentication before database inspection. Backup selection is capped at 256 MiB.

Legacy backups are retained unchanged. Old `.db.enc` files used unauthenticated AES-CBC, a fixed salt and sometimes the embedded fallback secret. The new restore workflow refuses that format. Do not describe those files as authenticated or silently convert them. Preserve originals; authorized offline recovery requires their original passphrase/legacy implementation, isolated decryption, full SQLite/schema/relationship review and migration in a temporary copy before producing a new authenticated backup. No automated legacy converter is supplied.

Quick local backups, migration copies and pre-restore recovery copies remain **unencrypted SQLite files**. They contain patient information and account hashes; protect the folder with OS permissions, encrypted storage and appropriate retention. Raw “Save to PC” remains available for existing authorized workflows; use encrypted backups for portable storage. None of these copies is automatically deleted or converted by this change.

## Validated restore in the application

1. Sign in as administrator. Open Settings → Credentials & validated recovery.
2. Enter the backup passphrase, select the file, and wait for validation. Selection cancellation changes nothing.
3. Review counts of patients, orders, issued reports and users. The complete database will replace current data, including accounts, configuration, approvals and audit history. This does not merge databases.
4. Type `RESTORE` and choose Restore database and sign out, or cancel.

The main process checks GCM authentication, SQLite header/integrity, schema version, every current table/column, supported migration stamps, supported account roles/hashes and a usable administrator. It checks foreign keys plus explicit order/test/result, interval/critical-rule and issued-report associations, JSON snapshots and issued status consistency. Unsupported newer schemas, extra tables, executable schema objects and incomplete schemas are rejected. Historical stored values are not recalculated or reflagged.

The renderer receives an opaque five-minute candidate token and counts, never a filesystem restore capability. The candidate bytes remain in the main process. Administrator authorization is revalidated after the file dialog and immediately before replacement. Logout, role/credential changes, a different login, expiration, another window or intervening database writes invalidate confirmation.

Before replacement, an exclusive `backups/before-restore-<timestamp>-<uuid>.db` copy of the original is flushed, byte-compared, opened and integrity-checked. Failure stops restoration. Replacement is synchronous in the main process; writes are blocked while it runs. Candidate audit insertion and validation happen separately from the active database. A flushed, byte-verified sibling temporary file is renamed over `lab.db`; the original is never deleted first. Failures leave the original active database usable. Success preserves the restored history, adds an authenticated restore audit, clears sessions and requires login using the restored accounts.

## Forgotten administrator password

Prefer another authorized administrator resetting the account through existing user management. If no administrator can sign in, recovery requires local OS intervention with the application stopped. File access is a separate trust boundary; anyone who can edit the database already has access to its data. Recovery creates no account and grants no role.

On an installed Windows computer:

1. Close every lab application window and other writer using this data directory.
2. Open **Recover Administrator.cmd** in the installation folder, or run the command below. The installed Electron runtime is used; no Node.js installation or developer checkout is needed.
3. Select the existing data directory containing `lab.db`. OS read/write access and an exclusive ownership lock are required. Current schema validation does not migrate the selected file; older/incomplete/corrupt/newer schemas require controlled database recovery first.
4. Choose an existing administrator, enter/repeat a new password of at least 12 characters, and type **RESET ADMINISTRATOR**. Cancelling or closing before reset does not change database bytes.
5. Keep the verified pre-reset snapshot protected. Close recovery, reopen the normal app and log in. Only the selected credential and OS-authenticated audit entry change; clinical records and previous audits remain intact.

```powershell
& "C:\Program Files\Patholy Management System\Patholy Management System.exe" --recover-administrator
```

The regular shortcuts still open normal operation. Recovery exposes dedicated sender-checked operations in a sandboxed local window, without generic SQL, actor input or a remote endpoint. The ownership lock is held until the recovery window closes; do not remove a live/ambiguous lock to force recovery. Password fields hide input; credentials are not placed on command lines or logged.

For maintainers, the compatible repository command remains available:

```powershell
node scripts/recover-administrator.cjs "<lab-data-directory>" "<existing-admin-username>" CONFIRM-OFFLINE-RECOVERY
```

The maintainer command requires an interactive terminal and uses the same current-schema validation, ownership lock, verified recovery copy and atomic reset/audit service as the installed entry point. Both record `offline-os-administrator:<OS username>` and the affected account ID. Neither creates an account, migrates a selected file, or bypasses corrupt startup validation or filesystem permissions. For unsupported data restore a verified compatible backup or obtain controlled specialist recovery of a preserved copy.

## Corrupt startup or ownership errors

Startup does not substitute an empty database for an empty, corrupt, incompatible or unreadable file. A separate sandboxed recovery window gives the error and data-folder location; no operational IPC is registered. Failed legacy copying also stops startup rather than treating the installation as fresh.

Close the application and preserve the complete folder before intervention. For a verified local `.db` recovery snapshot, inspect a **copy** with the compatible application/runtime in an isolated temporary directory first. Verify patients, accounts, issued reports and audits. Preserve the damaged `lab.db` under a separate name, then install the verified snapshot as `lab.db` with the application closed. This is explicit OS-level recovery, not an authenticated renderer restore. A corrupt original can be preserved as evidence but cannot be claimed usable. For portable encrypted files, decrypt and validate in an isolated copy with authorized tooling before this offline step; the normal UI workflow requires a working database and administrator session.

Electron's application instance lock is retained. A per-database exclusive `lab.db.lock` additionally prevents different app identities or direct database consumers sharing the same file. A confirmed nonexistent owner PID allows stale-lock removal. Malformed locks, denied process inspection and reused/live PIDs fail closed. Only after confirming that **all** writers are stopped may an OS administrator preserve and remove a stale lock manually. Do not remove a lock to bypass a running process. Interrupted sibling `.tmp` files are not automatically promoted or deleted; inspect them only as possible recovery artifacts.

## Persistence and remaining limitations

Full-snapshot saves and reference transactions now use verified sibling temporary-file replacement with file flushes. Numeric result saves retain their existing flushed transaction replacement. Ordinary save failure restores the last persisted in-memory state; atomic operations restore their pre-operation state. Initialization failure cannot flush partial migration data during close. Unversioned installations receive a verified pre-upgrade copy before schema marker `PRAGMA user_version=1` is committed. Parameter IDs, medical values, billing rules, approval and report payloads are retained.

This is still SQL.js full-snapshot persistence, not a storage-engine replacement. File flush and same-filesystem rename improve recovery but do not guarantee durability through every power-loss, disk/firmware failure, network share or OneDrive synchronization conflict. Directory metadata is not portably flushed on Windows. A file-replacement error can arise from antivirus or another reader; keep verified backups outside the synchronized active directory. Locks do not protect against deliberate OS-level modification, copying the folder to another writer, or synchronization between machines. Local files and raw recovery copies are not encrypted by this task.

Packaged Electron/OS dialog testing, physical printer alignment, real-device power-loss testing and a supported automated offline legacy-backup converter remain outstanding release work. Browser and synthetic fault tests do not establish these properties. The application is not claimed fully secured.
