# Authorization verification record

## Findings and fixes

- **P1:** Unrestricted/unauthenticated SELECTs exposed credentials and patient data; broad writes bypassed configuration/audit/issuance boundaries. Removed renderer SQL and replaced it with 39 fixed named reads, 3 validated dynamic reads and scoped commands. Legacy SQL IPC is disabled for all roles.
- **P1:** Most result/registration/billing/export/backup/destructive handlers lacked sessions. Every protected database/application channel now has an enforced permission; complete backups/configuration/users/destructive clearing require admin. Allowed staff workflows remain.
- **P1:** Cached sessions could survive credential/account changes or pending dialogs. Sessions bind to the sender, origin, current account/role/credential and a 12-hour lifetime. Post-await leases reject logout/relogin races and protect PDF preview printing. Revocation closes owned previews.
- **P1:** Restart could recreate a known administrator credential. Bootstrap now occurs only in a genuinely fresh database, not in existing/empty user tables.
- **P2:** Print actor text was renderer-supplied, and clearing patients deleted unrelated audit history. Actors now come from authenticated sessions; new sensitive audits omit credentials/patient payloads. Wipes preserve configuration/reference/security audits.
- **P2:** Some UI errors were console-only. Real preload errors feed the existing toast system; stale sessions return the app to login. Small screenshot-driven fixes remove garbled Reports labels, move actions above paper preview, center the confirmation dialog and align print fields.
- **Compatibility:** Large referral invoices now batch test reads in groups of 1,000; atomic registration replaces separate patient/order/test SQL calls without changing patient-ID format, catalogue identities or billing rules.

Two independent reviewers inventoried IPC/SQL access and inspected authorization bypasses read-only. The lead owns all implementation and integration. Reviewers did not change files or staging.

## Final verification

- `npm test`: **73 passed, 0 failed, 0 skipped**: 15 system checks, 13 T001 regressions, 13 reference tests, 14 hardening tests, 6 profile/dispatch tests and 12 authorization tests.
- Authorization tests cover every database channel, all application policies, actual preload error delivery, unauthenticated calls, staff/admin boundaries, forged roles/actors, generic SQL/credential/schema/audit bypasses, account/session changes, sender/frame/origin binding, expiry, pending backup dialogs, safe user projections, allowed staff/admin operations, audit rollback, destructive rollback/reopen and fresh-only bootstrap. A deliberate revoked-preview fault logs the expected synthetic permission error; it is not a failed test.
- `scripts/test-authorization-ui.cjs`: passed using the actual App and actual preload API against authenticated synthetic IPC. Staff registration/result saving/preview/cancel/finalization/billing/navigation, denied admin configuration, admin print settings, logout and stale-session login all pass; no browser page errors.
- `scripts/test-result-ui.cjs`: passed; normal/batch/clearing/malformed/zero/navigation/reopen checks; no browser page errors.
- `scripts/test-reference-ui.cjs`: passed; approval/review/atomic finalization failure/retry, immutable pad/full reprints, physical settings and calibration keyboard checks; no browser page errors.
- `scripts/test-print-layout.cjs`: passed; nine PDF fixtures/19 pages with both modes, drafts, oversized reference/review text, custom paper/offsets and calibration. Counts, text, dimensions, body bounds, identifiers and 100 mm DOM/PDF ruler pass. Prior visually inspected layouts remain intact.
- Production frontend build: passed, 168 modules transformed. Main-process syntax and staged/unstaged whitespace checks pass.

All fixtures use explicit synthetic temporary database directories and disable legacy migration. No real lab database was opened. Catalogue clinical values, formulas, thresholds, parameter IDs and billing rules were not changed. No storage-engine replacement, licensing, deployment or release.

## Screenshots

Synthetic screenshots were visually inspected after the small UI corrections:

- Reports draft: `C:\Users\iamro\.codex\visualizations\2026\10\07\01a11794-6b1f-7ed1-ae43-aae170b9430c\authorization-review\reports-draft.png`
- Finalization review: same directory, `finalization-review.png`.
- Print settings: same directory, `print-settings.png`.

## Remaining release blockers

Mandatory credential setup/change and the legacy optional/default encrypted-backup key need a dedicated policy before clinical deployment. Existing credentials were not silently replaced. Restore remains unavailable pending validated recovery. OS-level database/backup protection, power-loss/OneDrive durability, packaged Electron/printer QA and wider execution/dependency security remain separate. The app is not claimed fully secured. User-management backend operations are provided; a new account-management UI was intentionally not introduced.

The exhaustive permission matrix and session/audit behavior are in `AUTHORIZATION.md`.

## Changed-file summary

- New backend: `authorization.cjs`, `applicationIpc.cjs`, `applicationOperations.cjs`, `readCatalogue.json`.
- Integrated backend: `main.js`, `preload.js`, `referenceIpc.cjs`, `database.js`, `referenceIntervals.cjs`.
- Scoped-read/command consumers: Dashboard, NewRegistration, ResultEntrySimple, Reports, Billing, Referrals, ReferrerCommission, RateChart and ReferenceIntervalEditor.
- Permission feedback/minor UI polish: App, Layout, ToastProvider, Settings, PrintProfileSettings and print-layout.css.
- Verification: new authorization unit/browser suites; existing result/reference/profile browser/unit bridges updated to authenticated scoped IPC; npm test includes authorization.
- Documentation: this record, exhaustive AUTHORIZATION.md, and corrected security status in REFERENCE_INTERVALS.md/PRINTING.md. Earlier verification records describe their earlier checkpoints.

Branch: `feature/editable-reference-intervals`; HEAD unchanged at `902cebda110bba7afb4230d4a7d3d5649a36c457`.

Prior T001 staging before/after is exactly `0e163d4b2f1215af54f28e05f2af280c1b4b71d8`. No files were staged or committed. Existing MM/AM paths retain their original staged T001 content; current work is unstaged/untracked. Earlier reference/printing work remains present, so whole-tree diffs include previous tasks.

## Final git status

```text
A  docs/IMPLEMENTATION_ROADMAP.md
MM electron/database.js
MM electron/main.js
A  electron/numericResult.json
MM electron/preload.js
A  electron/resultValidation.cjs
MM package.json
AM scripts/test-result-integrity.js
AM scripts/test-result-ui.cjs
M  scripts/test-system.js
 M src/App.jsx
 M src/components/Layout.jsx
 M src/components/ToastProvider.jsx
 M src/index.css
 M src/pages/Billing.jsx
 M src/pages/Dashboard.jsx
 M src/pages/Login.jsx
 M src/pages/NewRegistration.jsx
 M src/pages/RateChart.jsx
 M src/pages/Referrals.jsx
 M src/pages/ReferrerCommission.jsx
 M src/pages/Reports.jsx
MM src/pages/ResultEntrySimple.jsx
 M src/pages/Settings.jsx
A  src/utils/resultValidation.js
?? docs/AUTHORIZATION.md
?? docs/AUTHORIZATION_VERIFICATION.md
?? docs/PRINTING.md
?? docs/PRINT_VERIFICATION.md
?? docs/REFERENCE_INTERVALS.md
?? electron/applicationIpc.cjs
?? electron/applicationOperations.cjs
?? electron/authorization.cjs
?? electron/printOptions.cjs
?? electron/printProfile.cjs
?? electron/printProfileSchema.json
?? electron/readCatalogue.json
?? electron/referenceIntervals.cjs
?? electron/referenceIpc.cjs
?? scripts/test-authorization-ui.cjs
?? scripts/test-authorization.cjs
?? scripts/test-print-layout.cjs
?? scripts/test-print-profile.cjs
?? scripts/test-reference-hardening.cjs
?? scripts/test-reference-intervals.cjs
?? scripts/test-reference-ui.cjs
?? src/components/PrintCalibration.jsx
?? src/components/PrintProfileSettings.jsx
?? src/components/ReferenceIntervalEditor.jsx
?? src/components/ReportPrintLayout.jsx
?? src/print-layout.css
?? src/utils/paginateReport.js
?? src/utils/referenceIntervals.js
```

## Subsequent credential/recovery task

The earlier credential/default-encryption/restore blockers in this historical verification record are addressed by the new implementation. See RECOVERY.md and RECOVERY_VERIFICATION.md for current behaviour, tests and remaining limits.
