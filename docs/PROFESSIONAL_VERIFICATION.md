# Professional-readiness verification (10 October 2026)

Version 1.1.0; fully offline and unsigned. Publication follows final exact-commit verification. Feature branch only. All patient, account and backup fixtures are synthetic and use isolated temporary directories. No operational lab database, domain, Cloudflare resource or prior published tag/release artifact was changed.

## Ownership and integration

The lead owned schema/migration, database, recovery validation, IPC/preload and package integration. Release reviewed packaging/update evidence; recovery implemented verified backup status/reminders and rehearsal tests; clinical reviewed existing formula/unit/rounding/matching behavior and generated the review pack; report implemented controlled amendments; billing implemented the minor-unit ledger/reconciliation. The independent security reviewer inspected the combined implementation read-only. Shared interfaces and ownership were fixed in PROFESSIONAL_CONTRACTS.md before edits.

## Findings resolved

- Derived formulas continued with changed dependency units. Known shipped formula units now fail closed, with a persisted missing-value/manual-review message; no conversion or clinical replacement value is invented.
- Legacy mark-paid could replay an earlier payment after a refund. Its persistent request now includes the ledger frontier; repeat requests remain idempotent while legitimate later recollection works.
- An extreme safe-integer money amount could lose paise when converted to the retained REAL invoice storage. New totals/rates/commissions now require an exact round trip or fail atomically; old REAL amounts remain unchanged.
- Posted/refunded commissions could be recalculated from current settings. Any initialized billing account freezes its original charge, line prices and commission history.
- SQLite integrity alone accepted inconsistent new histories. Startup/restore now validate original report bytes, version lineage, immutable patient/presentation/interval/unit fields, draft identity/state, complete unique indices, request bindings, eligible refunds and bounded collections. Malicious synthetic restores preserve the active file unchanged.
- Old migration report capture referenced columns before they existed. Legacy capture handles the pre-upgrade layout; verified backup precedes additive schema-2 mutation.
- Installer warning and authorization documentation still described removed activation. Current guidance is offline and unsigned; historical notes remain labelled.

## Source and UI evidence

- `npm test`: 15 system checks plus 140 Node regression tests, all passed; includes seven migration/restore corruption tests and new amendment, billing, clinical and backup-health suites.
- Production Vite build passed. Dependency versions unchanged; package and lockfile are 1.1.0.
- Nine browser suites passed: results, references, authorization, recovery, first-run login, amendments, ledger, backup health and reviewed financial/registration/error workflows. Actual App/preload/scoped IPC were used where provided; browser wrappers are not packaged/native evidence.
- PDF suite: **13 PDFs / 29 pages**, both print modes, custom geometry/calibration, short/multipage/long references/manual-review messages and amended reasons. First/last amended full/pad pages and synthetic browser screenshots were visually inspected.
- Precommit packaged Windows tests passed setup/login, offline operations, preview/cancel/finalization, immutable report output, controlled encrypted-restore dialogs, restart, ownership locking and closed-app recovery. Packaged compositor PDFs: draft/full/pad short and full/pad **10-page** reports; text and page dimensions validated.
- Actual published rc.2 and activation-pending rc.1 executables upgraded to the rc.3 precommit candidate with byte-identical original issued JSON, existing credentials, print settings and restart persistence. This is binary replacement, not NSIS installer evidence; no genuine historical signed activation was used.
- A controlled packaged process termination after flushed temporary-snapshot readback and before rename preserved previous database bytes, reports, configuration and audits. Restart reclaimed the stale ownership lock; subsequent commits persisted. Only the verified synthetic main PID was terminated; this is not power-loss evidence.
- Independent review found no demonstrated unresolved critical/high issue in the reviewed integration. Passing tests and pattern scans are not proof of complete security.

Exact final-commit build/repeat outcomes, SHA-256 hashes and process-cleanup evidence are recorded beside the candidate in `verification-summary.md` and `SHA256SUMS.txt`. Transient PDFs, screenshots, logs, databases and backups are excluded from commits. Source pattern scan reviewed working files and reachable text history, with no findings; binary/LFS/medical correctness require separate evidence.

## Explicit pending checks and limitations

Windows 11 Home Single Language 10.0.26300 x64 was available. Windows 10, another computer/VM, elevated installer/reinstall/upgrade/uninstall, installation interruption, actual native shell dialogs, PDF printer drivers, physical printer/pad alignment, screen readers, modest-hardware performance and real power loss are **NOT TESTED**. Synthetic process interruption is distinct from power loss. Filesystem/directory flush, controller caches and inherited permissions remain platform limitations.

Qualified laboratory approval of formulas, applicability, units, rounding, reference intervals and critical thresholds is pending: see CLINICAL_REVIEW_PACK.md. Infant/uncertain demographic intervals remain manual review. Legacy reports without original provenance cannot reconstruct it; legacy payment baselines remain explicitly incomplete and cannot be automatically refunded. Amendments correct existing result rows only, not demographics/test membership. User-selected backups outside the data folder may still be on the same computer; reminders cannot prove offsite retention. Users with OS-level file access can tamper with an offline installation.

The user subsequently authorized a final unsigned GitHub release and selected Inno Setup. No signing, domain deployment or remote service is enabled. Use MANUAL_UPDATE.md and RESTORE_REHEARSAL.md before lab rollout.

## Broader final-release review

The user requested a full application review after the workstreams. Independent reviews covered every current screen/shared utility, main/preload/window boundaries, hashing/session policy, scoped IPC, registration, finance, recovery, schema, printing, package scripts and current/historical documentation. Demonstrated fixes include serialized stale-lock reclamation (five tests, including four competing processes), persistent actor-bound registration retries, strict text-preserving rate/commission entry, duplicate-submit guards, draft cleanup on logout, local recovery error guidance, complete order exports beyond 5,000 rows, collision-free private preview files and local-day dashboard counts without timestamp rewriting. The app display is Pathology Management System; internal data/app identity remains unchanged. No claim of finding every possible defect is made.

Earlier packaged test connection interruptions were not consistently reproducible; isolated setup/login repetitions passed the real cooldown. The final build must be tested sequentially, with any unresolved failure disclosed rather than counted as a pass. Compiler 7.1.0 was already installed and its Pyrsys B.V. signature verified. An unattended compiler-installation attempt was rejected before execution; no alternate installation was performed.
