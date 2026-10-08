# Credential and recovery verification

## Findings addressed

- High: usable fresh-install bootstrap administrator and fixed-salt password hashes. Replaced with mandatory atomic setup, randomly salted scrypt, upgrade-on-verified-login and restricted legacy-default sessions.
- High: unauthenticated CBC backups and embedded fallback secret. New portable backups use versioned AES-GCM and required user passphrases. Legacy files are retained and refused by the authenticated restore workflow.
- High: direct full-snapshot overwrite and swallowed legacy-copy failures. Saves use flushed, byte-verified sibling replacement; copy failure stops startup. Empty/corrupt/incompatible startup files cannot become fresh databases.
- High: incomplete schema validation and administrator lockout. Independent reviewers demonstrated missing billing tables and invalid/accountless administrators. Full schema contracts, required indexes, valid roles/hash formats and strict restore administrator checks reject these cases. Zero-account first-run startup is separate from restore eligibility.
- High: restore authorization/replacement risk. Main-process candidates, admin leases, explicit confirmation, unchanged-database generation checks, verified original recovery copies and session clearing protect the operation.
- Medium: repeated password KDF work per read and restricted-account switching. Restriction is cached in credential-bound sessions; account switching logs out properly.

Two independent agents reviewed authorization and recovery read-only. The lead owned all implementation. Their demonstrated findings were fixed and covered by synthetic checks. No real lab database was opened.

## Tests and evidence

- Final `npm test`: **82 passed, 0 failed, 0 skipped** (15 system checks plus 67 Node tests). The restore-preservation case was subsequently strengthened to create an approved synthetic interval; its targeted rerun passed.
- Nine new recovery regressions cover setup/no defaults, forced replacement after rename, legitimate legacy migration, unique salts, password/session revocation, wrong/missing passphrases, tampered header/ciphertext/tag, truncated/legacy backups, newer/incomplete schemas, missing indexes, invalid/accountless users, clinical orphans, staff/anonymous bypasses, role revocation during dialogs, cancellation, changed database state, recovery-copy/flush/rename failures, reopening after restoration, original-file preservation, corrupt startup and concurrent ownership.
- Restore tests compare complete issued report payloads, interval rows/approval state, user login and pre-existing audit rows after restoration and reopening. Restore adds an authenticated recovery audit without replacing old rows.
- Offline administrator CLI: exercised in an interactive terminal against a synthetic temporary database; hidden password entry, verified backup, recovered login and OS-actor audit passed after reopening.
- `node scripts/test-recovery-ui.cjs`: passed. Actual App + actual preload + authenticated IPC verify setup, restricted password change/account switching, restore preview/cancellation/confirmation and cleared sessions. No page errors.
- `node scripts/test-result-ui.cjs`: passed. Blank/clearing/malformed/zero/batch and reopened state preserved.
- `node scripts/test-reference-ui.cjs`: passed. Approval, immutable issued content, preview cancellation, explicit finalization and both print modes preserved; synthetic PDF text verified.
- `node scripts/test-authorization-ui.cjs`: passed. Staff operations, admin denial, admin settings and stale-session return to login preserved.
- `node scripts/test-print-layout.cjs`: passed. Nine fixtures, **19 PDF pages**: short/full/pad, multi-page, long reference text, custom paper/offsets, draft and calibration. Text/count/geometry checks passed; generated renderings were visually inspected.
- `node scripts/test-visual-design.cjs`: passed at **1366×768 and 1920×1080**. Existing screen, focus, scrolling, contrast and dialog checks passed. No page errors.
- `npm run build`: passed; **171 modules** transformed.
- Working/index whitespace checks passed. Prior staged index tree remains exactly `0e163d4b2f1215af54f28e05f2af280c1b4b71d8`.

Earlier runs exposed fixture adaptations: explicit synthetic account setup replaces implicit production defaults; legacy migration fixtures mark themselves unversioned; synthetic failure triggers are removed after rollback assertions before strict startup checks; accountless clinical data now correctly fails startup. No production test bypass was added.

## Screenshots

Actual synthetic browser captures:

- `C:\Users\iamro\.codex\visualizations\2026\10\07\01a11794-6b1f-7ed1-ae43-aae170b9430c\recovery\credential-setup.png`
- `C:\Users\iamro\.codex\visualizations\2026\10\07\01a11794-6b1f-7ed1-ae43-aae170b9430c\recovery\credential-replacement.png`
- `C:\Users\iamro\.codex\visualizations\2026\10\07\01a11794-6b1f-7ed1-ae43-aae170b9430c\recovery\restore-summary.png`

All-screen visual regression captures are in `recovery\visual-regression\after` under that artifact directory. Earlier before/after design artifacts were preserved.

## Changed scope and staging

This task adds `electron/credentials.cjs`, `electron/recovery.cjs`, `electron/databaseSchema.json`, the offline administrator recovery command, recovery tests, `RecoverySettings.jsx` and recovery documentation. It updates database persistence/startup, IPC/session permissions, main-process file dialog/recovery startup handling, preload, Login/App gates, Settings and screen-only recovery styling. Existing regression fixtures now explicitly seed synthetic credentials.

Clinical formulas, reference values, critical thresholds, billing rules, parameter identities, report snapshot generation and print layouts were not changed. The existing working tree also includes prior T001, reference-interval, authorization, print and design work; full repository diffs include those changes.

Branch: `feature/editable-reference-intervals`. HEAD unchanged: `902cebda110bba7afb4230d4a7d3d5649a36c457`. No new commit or staging. Existing 12 staged paths and all prior work are preserved; mixed staged/unstaged paths retain their original index entries. No deployment, Cloudflare resources or storage-engine replacement.

## Remaining release work

Packaged Electron/OS dialog and recovery-screen QA, real-device power-loss/filesystem interference tests, physical printer alignment and supported automated legacy-backup conversion remain outstanding. Direct Node invocation of the offline recovery tool requires a compatible runtime; no packaged recovery utility is supplied. Local raw snapshots need OS/storage protection. See RECOVERY.md for complete recovery instructions and accurate OneDrive/power-loss/lock limitations. No claim of complete application security is made.
