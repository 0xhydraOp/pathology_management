# Preview and pad-printing verification

## Findings and fixes

1. **P1 — preview issued/locked drafts before the dialog.** Preview/print now only reads the report. Explicit confirmation invokes existing atomic issuance. Draft printing is labelled DRAFT. Preview/print/finalization cancellation leaves the draft editable.
2. **P1 — draft preview print logs could later imply historical issuance.** Drafts and previews no longer create print-history evidence. Issued native requests may log only after successful callback.
3. **P1 — fixed paper gaps and unmeasured section pagination risked clipping/blank pages.** Explicit measured pages now validate body geometry, keep ordinary rows together, split oversized rows with measured repeated test identity and repeat patient/order/page identification.
4. **P2 — multiple PDF previews shared global print settings/routing.** Per-window options now print the focused PDF with its own copies/paper, including after an older preview closes.
5. **P2 — calibration overlay keyboard access.** Dialog semantics, focus containment, Escape and trigger-focus restoration are implemented and browser-tested.

Three independent read-only reviewers inspected workflow/issuance, layout/calibration and regressions. The lead owns all implementation/integration. Reviewers made no edits.

## Final outcomes

- `npm test`: **61 passed, 0 failed, 0 skipped**: 15 system checks, 13 T001 regressions, 13 reference tests, 14 hardening tests and 6 profile/native-dispatch tests.
- `node scripts/test-result-ui.cjs`: passed; normal/batch entry, clearing, malformed text, zero, navigation and reopen; no page errors.
- `node scripts/test-reference-ui.cjs`: passed; draft preview/print cancellation, finalization cancellation, editable draft, explicit finalization failure/retry, immutable reprints in both modes after result/interval/unit/name/lab edits and two-day clock advance, profile UI, calibration focus and read-only settings; no page errors.
- `node scripts/test-print-layout.cjs`: passed; nine PDF fixtures, 19 pages total. Page count equals browser's measured plan; all clinical rows fit body bounds; identities/page numbers/text/media sizes verified. No page errors.
- `npm run build`: passed, 168 modules transformed.
- `node --check electron/main.js`: passed.
- Staged/unstaged whitespace checks: passed. Git emits existing LF→CRLF notices, not errors.

| Synthetic PDF fixture | Pages |
| --- | ---: |
| Preprinted pad, short | 1 |
| Full report, short | 1 |
| Preprinted pad, 80 results | 3 |
| Full report, 80 results | 3 |
| Oversized reference/review text | 5 |
| Custom 180 × 240 mm with offsets | 3 |
| Draft | 1 |
| A4 calibration | 1 |
| Custom calibration with offsets | 1 |

Generated PDFs were rendered to PNG and visually inspected, including first/last multi-page sheets, continuation identity, draft marks, full-report branding/footer and both calibration pages. No clipping, overlaps or unnecessary blank pages appeared. The 100 mm ruler is checked in DOM geometry and PDF vector-line length (within Chromium rounding). Artifact directory for this run:

`C:\Users\iamro\.codex\visualizations\2026\10\07\01a11794-6b1f-7ed1-ae43-aae170b9430c\pad-verification`

Only synthetic explicit temporary database directories were used; legacy migration was disabled. Version-2→3 backup/failure/retry and restart were exercised. No real lab database was opened.

## Remaining blockers and limitations

Physical letterhead alignment, hardware margins, driver scaling/custom stock and packaged Electron print behavior require printer/device QA. Native callbacks and fake-Electron routing tests cannot establish physical delivery. Issued clinical snapshots are preserved; current geometry, packaged logo assets, fonts and future renderer changes may alter appearance. Older historical reconstruction limits remain documented in REFERENCE_INTERVALS.md. No amendments or byte-identical archival PDFs are introduced. Broader authorization, generic SQL IPC, power-loss durability and OneDrive recovery remain separate work.

## Changed-file summary

- Workflow: Reports.jsx, ResultEntrySimple.jsx; native print dispatch/options in main.js and preload.js.
- Local configuration: printProfile.cjs, printProfileSchema.json, referenceIpc.cjs, database.js, referenceIntervals.cjs; Settings.jsx and PrintProfileSettings.jsx.
- Layout/calibration: ReportPrintLayout.jsx, paginateReport.js, print-layout.css and PrintCalibration.jsx.
- Verification: new test-print-profile.cjs/test-print-layout.cjs; updated test-reference-ui.cjs, test-reference-intervals.cjs, test-result-ui.cjs and npm test entry.
- Documentation: PRINTING.md, this verification record and corrected issuance wording in REFERENCE_INTERVALS.md.

Existing App/Login/NewRegistration/index.css and other prior reference/T001 work remain present. Whole-working-tree diffs include earlier work, not solely this task.

Branch: `feature/editable-reference-intervals`. HEAD unchanged: `902cebda110bba7afb4230d4a7d3d5649a36c457`. No commit, push, merge, release or deployment.

Prior T001 index tree before/after: `0e163d4b2f1215af54f28e05f2af280c1b4b71d8`. No staging was changed. New work is unstaged/untracked; existing `MM`/`AM` paths retain their original staged T001 content.

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
 M src/index.css
 M src/pages/Login.jsx
 M src/pages/NewRegistration.jsx
 M src/pages/Reports.jsx
MM src/pages/ResultEntrySimple.jsx
 M src/pages/Settings.jsx
A  src/utils/resultValidation.js
?? docs/PRINTING.md
?? docs/PRINT_VERIFICATION.md
?? docs/REFERENCE_INTERVALS.md
?? electron/printOptions.cjs
?? electron/printProfile.cjs
?? electron/printProfileSchema.json
?? electron/referenceIntervals.cjs
?? electron/referenceIpc.cjs
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
