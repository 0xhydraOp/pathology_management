> Current scope update (10 October 2026): Patholy is fully offline. The former licensing milestone is cancelled and superseded by the offline-conversion candidate. Historical T001 planning/results below are retained for context.

# Implementation roadmap

T001 establishes a reproducible baseline and fixes numeric result integrity. No licensing, deployment, branding, billing, or clinical catalogue changes belong to T001.

Remaining milestones, in order:

1. **T002 — Catalogue identity:** Stable parameter/profile identifiers across catalogue updates; protect order-to-test associations; preview and validate migrations before applying them.
2. **T003 — Backend authorization:** Enforce authenticated roles in the main process; replace generic SQL IPC with scoped operations; validate payloads and restrict configuration/export/destructive actions.
3. **T004 — Durable persistence and recovery:** Review sql.js snapshot storage; make all mutations durable, establish crash recovery and safe startup, prevent concurrent writers, and fault-test interrupted writes and upgrades.
4. **T005 — Historical billing:** Preserve ordered prices, discounts, payments, and commissions as historical snapshots; define correction and reconciliation behavior without rewriting old bills.
5. **T006 — Report approval and auditing:** Separate entry, review, approval, amendment, and printing permissions; record actor, time, version, and reason for material changes.
6. **T007 — Validated clinical rules:** Clinician-reviewed formulas, reference intervals, critical thresholds, demographics, rounding, and non-calculable behavior; version and validate rule changes against synthetic cases.
7. **T008 — Backup and restore:** Verified backups, retention, encryption, restore previews, compatibility checks, and practiced recovery with integrity checks.
8. **T009 — Universal lab configuration and pad printing:** Lab-specific identity, staff, report layout, units and workflow settings; calibrated preprinted-pad offsets and printer profiles, tested without changing clinical meaning.
9. **T010 — Licensing:** Only after integrity, authorization, recovery, and configuration are verified, add lab entitlements, activation, renewal, offline behavior, and support procedures.

## T001 operation and boundaries

`db:saveOrderResults(orderId, changes)` handles normal and batch entry. Numeric edits stay text until strict finite-decimal validation; blank deletes the saved result. Zero, negative values, decimals and finite scientific notation are accepted. Reference intervals classify flags and never reject abnormal values. Text blanks are missing. Submitted tests must belong to the order. Derived tests are recalculated from ordered dependencies using the existing expressions, rounding, LDL restriction and albumin/globulin restriction; missing, cyclic, malformed and non-finite calculations remove stale derived values and leave the order incomplete.

Completion uses distinct ordered parameter identities and valid saved results, so unrelated results cannot complete an order. An order with no tests is pending. The existing schema has no separate identity for repeat occurrences of the same parameter; resolving repeat-test identity belongs to T002.

All related result changes and status run synchronously in one SQL transaction. Individual writes do not call the old per-statement `save()`. After commit, the snapshot is written to a unique file beside `lab.db`, flushed with `fsync`, then renamed over `lab.db`. On SQL/write/flush/rename failure, the pre-operation in-memory snapshot is restored and the existing database file is retained. The IPC operation acknowledges success only after replacement. Regression tests verify reopening the temporary database.

This guarantee applies to this specific operation, not the whole application. Generic SQL IPC can bypass it, and other mutations still use direct snapshot overwrites. sql.js WAL is not a durable on-disk WAL here. Directory metadata is not flushed; sudden power loss, filesystem/OneDrive interference, concurrent external writers and full crash recovery are not proven by these tests. A process killed before replacement may leave an orphan temporary snapshot. T004 must address these cases.

Backend formula evaluation allows only substituted numeric arithmetic characters and a bounded expression length before invoking the existing expression evaluation approach. All four shipped formulas fit this restriction; expressions with function calls, strings, properties or remaining identifiers are treated as non-calculable. No catalogue formulas were changed. The renderer's existing formula evaluator and catalogue editing still require authorization and validated rule evaluation in T003/T007. Numeric flags submitted by the renderer retain the existing flow; this milestone does not establish clinical approval or trustworthy auditing.

## Verification and safe baseline

Baseline: upstream `main` at `902cebda110bba7afb4230d4a7d3d5649a36c457`, clean checkout, no applicable AGENTS.md files found. Local branch: `fix/T001-result-integrity`. Large release ZIP is retained as its Git LFS pointer; downloading the release artifact is unnecessary for tests.

`npm test` runs the existing 15 system checks and the numeric-result regressions. Test harnesses redirect APPDATA, USERPROFILE and HOME to temporary directories; all initialized fixtures use explicit temporary directories and disable legacy migration. New `DatabaseManager(directory, { migrateLegacy: false })` prevents even inspecting the legacy path. Production migration behavior is unchanged.

Safety incident during initial regression setup: the pre-change constructor ignored the proposed migration opt-out and copied the legacy database into temporary regression folders. Synthetic writes affected only those temporary copies, which were removed; the original lab database was not modified. Both environment isolation and the implemented opt-out now prevent this. No real patient contents were used for assertions or printed.

Regression coverage includes blank/whitespace, clearing, zero, decimals, abnormal negatives, malformed prefixes, NaN/Infinity/overflow, frontend/backend parser parity, partial/complete/empty orders, unrelated results, text clearing, invalid legacy numeric values, SQL rollback, file replacement failure, derived dependency clearing/division by zero, and reopen verification. `scripts/test-result-ui.cjs` is an optional real Chromium test using a temporary synthetic database and a test-only browser bridge to the backend. Run with Playwright installed or set `T001_PLAYWRIGHT_PATH` to its module path, then `node scripts/test-result-ui.cjs`.

The browser test also verifies the existing Save & Print report URL. With `T001_BASELINE=1`, it loads the original upstream component into the temporary harness: clearing a saved value fails the expected partial-status assertion with actual status `complete`, confirming the original bug. Physical printer output and a packaged Electron installation were not exercised.

Final T001 outcomes: `npm test` passed all 15 existing system checks and all 13 regression tests (28 passed, 0 failed, 0 skipped); `npm run build` succeeded (160 modules); the Chromium regression passed with no page errors, including report navigation and reopened state; `git diff --check` passed. SQL statement failure, status-update failure, snapshot flush failure and file-replacement failure all retain prior state. Browser verification required two small batch fixes: allowing batch mode past the selection-screen return, and keeping the test selector available when the currently selected test has no pending orders.

No claim of full application security or medical rule validation is made. Installation reported 45 dependency audit findings (2 low, 9 moderate, 31 high, 3 critical); dependency remediation requires a separately scoped compatibility/security review.

The preceding audit count is the historical T001 baseline. The supported-runtime review completed on 8 October 2026 is recorded in [DEPENDENCY_SECURITY.md](DEPENDENCY_SECURITY.md), including upgraded versions, audit coverage limits and remaining release checks.
