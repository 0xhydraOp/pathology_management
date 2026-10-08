# 1.1.0-rc.1 — activation-pending evaluation prerelease

**Not for production lab use. Windows binaries are unsigned. No production activation service is configured.** Do not point evaluation builds at real patient data. No development password, licensing bypass, private signing key or synthetic trust configuration is included.

The installer explicitly warns before proceeding; login and the workspace identify the limitation. New registration, result editing and finalization are unavailable. Authenticated existing-record viewing, immutable issued reprinting, backup/export and administrator recovery remain available. This is a reviewed evaluation/recovery build, not a fully activated product.

## Changes

- Strict numeric validation, clearing and atomic completion/issuance.
- Approved demographic reference intervals, uncertainty review and saved report snapshots.
- Separate preview/finalization, full/pad printing, calibration and pagination.
- Main-process roles/sessions, narrowed IPC, mandatory credential setup and salted hashes.
- Authenticated encrypted backups, validated restore, safe snapshot replacement and packaged offline recovery.
- Configurable signed device grants, owner/customer identity separation, invitations, trials and audited licensing administration. Cloudflare deployment remains paused.
- Polished navy/teal workspace and supported Electron/dependency updates.
- Recalculation preserves prices/commissions for completed, paid or issued orders. Pending/partial unpaid repricing remains available. This bounded guard is not a full historical-billing amendment model.

## Compatibility and recovery

Back up with a known passphrase before any future real migration. Parameter IDs, clinical values, issued snapshots and supported encrypted backups are preserved by tested migrations; automatic legacy snapshots are not silently converted/deleted. Historical reports predating snapshots cannot reconstruct data that was never archived. Recovery requires the app closed and OS access to its data directory, uses the packaged launcher, preserves audits and introduces no hidden account. See RECOVERY.md and REFERENCE_INTERVALS.md.

Uninstall retains data. Legacy default credentials must be replaced. Historical shared-key backups remain a weak legacy format; their old key cannot be made secret by deleting current source. Use the documented specialist recovery path, then create a new passphrase-protected backup. OS file authority, OneDrive interference and actual power-loss durability remain limitations.

## Licence and service distinction

Copyright 2026 Robiul Islam Molla. This project's code is released under MIT: recipients receive rights to use, modify, redistribute, sublicense and sell it, subject to preserving the notice. This replaces the former restrictive installer EULA for this release. Dependencies retain their own licences/notices. The separately operated hosted activation service, credentials and account access are not granted by MIT. Recipients may modify the open-source licensing integration; desktop licensing is not completely tamper-proof.

## Remaining release gates

- Live Access/IdP MFA claim contract, complete customer/device pagination and Cloudflare deployment verification are future work. No live licence/trial terms are selected. Offline revocation is bounded by already signed allowances.
- Physical printer alignment, actual PDF-driver output, elevated installation/upgrade and actual power loss are **NOT TESTED**. Compositor PDFs do not certify drivers; process termination does not simulate power loss.
- Legacy historical LFS binary contents were unavailable to local scanning; it is not included in new release assets. Secret scans and zero reported dependency advisories are not proof of absence of vulnerabilities.
- Independently validate clinical rules and reference intervals; no values were invented or changed for release.

Release assets are built from the exact tagged commit. The published verification report and SHA256SUMS identify that commit and the actual tested installer/executable. Transient QA databases, reports, logs, screenshots, test-key configurations and synthetic QA binaries are excluded.
