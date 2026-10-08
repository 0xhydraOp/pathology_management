# Local reference intervals and issued reports

This extension uses the existing Electron/sql.js database, settings cards, result entry and report table. No catalogue values, parameter IDs, billing rules, formulas or diagnostic cutoffs are replaced. Everything works locally without network services.

## Editing and approval

Settings → Parameter reference intervals selects a parameter by its existing ID. Rules support lower/upper or one-sided numeric limits, inclusive/exclusive result and age boundaries, sex, the catalogue unit, and qualitative reference text. Age is in years, matching the existing patient model. Blank numeric limits are absent, not zero. Qualitative text and numeric limits are mutually exclusive; text is displayed without automatic interpretation as normal or abnormal.

Only existing **admin** users may save drafts or approve them. Staff can view settings and issue reports, but cannot edit or approve intervals. The main process verifies the existing login credentials and binds the session to the sending webContents; client-supplied roles and editor names are not trusted. Logout and window destruction clear that session, and app restart requires login. This adds enforcement for these operations rather than changing the lab's role catalogue. There is no second-reviewer role: an admin may approve their own draft.

Each draft is a new immutable version. It records the editor and timestamp. Approval records its actor and timestamp, supersedes the prior approved version, and checks that the approved version has not changed since drafting. The audit log stores previous/new JSON, actor, time and approval status for drafting, approval and supersession. Prior versions remain available under history. An approved empty rule set explicitly removes configured intervals. A draft never replaces an active approved set until approval.

Reversed/empty limits, invalid/non-finite numbers, ambiguous age/sex overlaps, and incompatible units are rejected in the backend. Overlap validation includes “any sex” intersecting a sex-specific rule and age-boundary inclusivity. Adjacent age groups are valid if only one includes the shared boundary. Units must exactly match the existing catalogue unit; no conversion or synonym inference is performed. Critical-threshold and diagnostic-cutoff fields are rejected by this editor.

## Review and classification

Only one approved matching rule may be used. Missing age is not guessed. Unknown sex matches only a rule for any sex. A missing, ambiguous, unapproved or unit-incompatible interval displays **Reference interval not configured** and produces no N/L/H flag. Critical alerts remain an independent C classification against the unchanged critical rules, even when the reference interval is missing. Numeric flagging is recalculated in the backend for normal and batch saves, and previews use the same boundary semantics. Derived flags retain the unrounded numeric calculation while displaying the existing rounded result.

Registration accepts only whole completed years; fractional input is not truncated into an infant age. Precise neonatal/month/day matching is not implemented. For new review/issuance, age below one year or non-integer age suppresses automatic reference and critical flags and displays **Precise age required for reference interval review; automatic flags withheld**. For older patients, matching must be reliable across the entire possible age band `[completed years, completed years + 1)`. A band crossing a reference boundary is withheld for manual review. No age, birth date or clinical value is inferred. Missing age and unknown sex are not guessed; unknown sex matches only an any-sex rule.

Critical rules retain a source unit, which must match exactly. Conflicting matching threshold pairs produce a manual-review message and no automatic C flag. Identical threshold duplicates may be treated as one only when a rule covers the entire age band. Reference-rule ambiguity is always rejected or withheld. The saved report includes these review messages beside the reference interval.

## Safe migration and compatibility

Before either the initial reference migration or the version-2 hardening upgrade mutates an existing database, startup writes an exclusive `backups/before-reference-intervals-<timestamp>-<uuid>.db` backup. It flushes the backup, verifies exact original bytes, opens it, and requires SQLite `integrity_check` to return `ok`. Backup failure stops initialization before mutation.

All startup/schema/reference migration changes now occur under one outer SQL transaction and one flushed temporary-file replacement. Intermediate `save()` calls are suppressed, and there is no direct overwrite after atomic replacement. SQL/write/replacement failures restore the old in-memory snapshot, leave the original file unchanged, and prevent failed initialization from saving during close. Synthetic tests verify exact file preservation, usable backup contents, successful retry and repeatable migration. Existing local parameter names are no longer overwritten from bundled catalogue names at restart.

Additive tables:

- `reference_interval_sets`: versioned rule JSON, parameter ID, approval state and actors/times.
- `parameter_critical_rules`: existing critical thresholds and demographic scopes, separate from reference rules, with source-unit provenance. Thresholds are not changed or edited here.
- `issued_reports`: one immutable report payload per order, with issuing actor/time and provenance.
- `reference_migrations`: migration version and timestamp.

`order_results.raw_result_value` is an additive nullable column retaining unrounded derived calculations for consistent flags. Migration preserves legacy clinical result values and flags, patient records and order identities; issued metadata is added separately. Existing `parameter_ranges` remain intact. Their numeric reference limits are copied verbatim into **pending**, not automatically approved, interval versions; lab administrators must review and approve them before they affect new review/issuance. The upgrade cannot determine whether a legacy catalogue limit was intended as a diagnostic cutoff: review is deliberately required.

Version 2 adds nullable critical source units and `orders.report_status` (`draft` or `issued`), preserves existing approvals and audit history, and stamps its migration exactly once. Old critical rules without unit provenance are bound to the catalogue unit available at upgrade; original unit changes before that point cannot be reconstructed. No threshold or interval numeric value is altered.

Catalogue reload is disabled in IPC. The backend loader also rejects an existing catalogue, ordered/result dependencies or interval versions before deletion, so direct calls cannot bypass ID protection. Only fresh-catalogue initialization is permitted.

Application-wide IPC authorization now uses credential-bound main-process sessions and an explicit permission matrix. Renderer generic SQL is disabled for reads and writes; scoped backend operations preserve registration, billing, result and reporting workflows. Configuration, users, complete backups and destructive clearing require admin; validated administrator restore now preserves the complete database (see RECOVERY.md). Patient-data clearing preserves reference/configuration/security audits. See [AUTHORIZATION.md](AUTHORIZATION.md) for every operation, session rules and remaining security limitations.

## Issuance, historical records and printing

Preview and printing are read-only and never issue a draft. Save & Preview Report opens Reports; Preview report, Print report and Ctrl+P preserve draft editability and label draft pages DRAFT. Cancelling preview, printing or finalization review cannot issue an order. Explicit Finalize report / Confirm finalization shows existing missing-interval and manual-review messages and is the only issuance path. In one SQL transaction the backend validates every actually ordered catalogue identity and saved result, reconciles flags and completion, sets issued status, and saves the immutable payload. Results, interval/version snapshots, units, flags and status persist together. SQL/persistence failure leaves no partially issued report. Issued results are read-only; amendments are out of scope.

New issued snapshots freeze parameter names, patient/order presentation, lab configuration, report date and authenticated issuing identity. Reprints render those saved fields after results, intervals, units, names or lab settings change. Drafts and previews do not create print-history evidence. Successful native print callbacks for issued reports can log a request; they are not proof of physical output. Current local print geometry/calibration can change layout without altering clinical snapshots. Both full-report and preprinted-pad modes print saved intervals, flags and review text. See [PRINTING.md](PRINTING.md) for millimetre settings, pagination, calibration, archived-content distinctions and device limitations. This is content preservation, not a signed archival PDF; packaged logo assets, fonts and printers can still change appearance.

Version 3 adds only the local lab_print_profile table and its migration stamp. The existing backup-before-mutation and atomic replacement path applies. It preserves IDs, clinical values, approvals and issued snapshots.

For pre-feature orders with recorded print history, migration freezes the legacy results, units and ranges **available at upgrade**, with `legacy-at-upgrade` provenance and an on-screen explanation. The application never stored the original printed interval, so the exact original report cannot be recovered if settings had already changed before upgrade. Orders with no recorded print history cannot reliably be identified as previously issued. Neither case is silently presented as an exact reconstruction.

Version-1 snapshots already preserve their results and intervals, but lacked historical lab presentation. Version 2 preserves those saved results unchanged, adds the lab settings available at upgrade, and explicitly labels `captured-at-upgrade` presentation. Original lab branding, footer, print date or printed-by text that was never archived cannot be recovered. Subsequent settings edits no longer affect these upgraded snapshots. Historical classifications are preserved rather than retroactively reinterpreted by the new age policy.

sql.js persistence still uses full snapshots. These specific operations roll back on tested SQL/write failures, but filesystem power-loss durability, OneDrive interference, external database tampering, and application-wide recovery are not fully solved. Direct OS/browser print APIs outside the supported app flow are not issuance APIs.

## Verification

`npm test` runs the existing system checks, T001 regressions, `scripts/test-reference-intervals.cjs` and targeted `scripts/test-reference-hardening.cjs` plus `scripts/test-print-profile.cjs`. Fixtures are synthetic, use explicit temporary directories and disable legacy migration. Coverage includes direct unauthorized IPC calls, role spoofing, authenticated audit actors, approval after restart, reload rejection, boundaries/one-sided limits, unknown demographics, infant uncertainty, critical-unit conflicts, invalid/orphan ordered results, issuance rollback/reopen, usable backups, migration failure/retry and historical snapshot preservation.

Optional browser checks: set `T001_PLAYWRIGHT_PATH` to an installed Playwright module, then run `node scripts/test-reference-ui.cjs`. Set `REFERENCE_TEST_PYTHON` to Python with pypdf for print-PDF inspection; optional `REFERENCE_TEST_ARTIFACT_DIR` retains synthetic screenshots/PDFs. Checks cover the editor, missing/infant review messages, saved report text after results/intervals/units/names/lab changes, read-only preview/cancellation, explicit finalization failure/retry, local profile saving and calibration keyboard behavior, narrow layout and read-only settings. `scripts/test-result-ui.cjs` verifies normal/batch numeric entry.

Physical printer alignment and a packaged Electron installer require lab-specific device QA. No real database was opened or migrated during this task; only temporary synthetic fixtures were used.

Final hardening verification: **55 passed, 0 failed, 0 skipped** (15 system checks, 13 T001 tests, 13 reference-interval tests and 14 targeted hardening tests). The frontend production build and whitespace checks pass. Both browser scripts pass with no page errors. The synthetic pad PDF is one A4 page and preserves the saved interval and unit. Browser assertions compare the entire issued report text before and after results, intervals, units, names and lab-setting changes, with the browser clock advanced two days; it remains identical. An initial cold-start browser timeout was resolved by avoiding an immediate reload during Vite's first dependency load.

Review used three independent, read-only reviewers for authorization/issuance, migration/history and matching/validation. The lead owns all edits and integration. Prior T001 staging is preserved; this hardening remains uncommitted.

Current print-workflow verification and the calibration guide are documented in [PRINTING.md](PRINTING.md). Prior hardening counts above describe that earlier checkpoint.
