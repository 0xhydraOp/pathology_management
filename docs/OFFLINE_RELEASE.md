# Offline conversion candidate — 1.1.0-rc.2

This unsigned Windows x64 prerelease removes the complete licensing and remote owner-authentication system. No activation, trial, expiry, seats, periodic check or online account is required. First run creates a user-chosen local administrator, followed by login. Existing accounts keep their credentials and authorization.

## Migration and compatibility

The internal application ID/package directory identity, database schema and clinical values remain unchanged. Startup holds the database ownership lock. If known old activation files exist, it creates a verified pre-conversion database recovery copy, archives/verifies the old encrypted activation bytes, then removes recognized files only. It does not decrypt or trust grants. Unknown sibling files remain. Repeating startup is idempotent. Failed backup/archive validation stops safely with recovery guidance; original clinical data remains usable. If removal is interrupted, already verified archives remain and the next startup retries remaining files.

No local tables are dropped. Patients, results, invoices/payments, staff accounts, approved intervals, immutable issued snapshots, print settings and clinical audit history remain. Existing activated/unactivated/expired installations all use local permissions. A historical database with no users requires packaged recovery; it is not exposed through new-admin setup. Portable encrypted backup format is unchanged. Local recovery copies and old activation archives require OS protection; they are not portable encrypted backups.

## Release status and limitations

Binaries are unsigned. Broader lab validation, Windows 10 testing, physical printer/driver alignment, elevated installation/upgrade and actual power-loss scenarios remain pending/NOT TESTED. Process/file failure tests and Chromium compositor PDFs do not prove power-loss durability or native printer compatibility. Clinical rules still require laboratory validation; MIT is not medical certification.

The public website is intentionally unchanged and still contains outdated activation/licence wording and the historical download. No domain, DNS, certificate, Cloudflare account/resource or published earlier release is altered by this task. Historical prerelease notes describe historical behavior only.

See README.md for installation/features, RECOVERY.md for local recovery and PRINTING.md for calibration. Final candidate evidence accompanies the GitHub release as a sanitized verification summary.
