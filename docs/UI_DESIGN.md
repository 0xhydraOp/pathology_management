# Medical workspace visual design

The existing application now uses a restrained screen-only theme: off-white canvas, white working surfaces, deep navy navigation and teal actions. Patient identity, report status and clinical tables receive priority. Red and amber accompany explicit error, abnormal-result or review text. Offline system fonts and small SVG line icons require no external assets.

## Implementation

- `src/workspace-theme.css` defines reusable colour, spacing, typography, border, focus and shadow tokens inside `@media screen`. Printed reports retain their separate layout and styles.
- Login, dashboard, registration, patient lists, results, reports, billing, referrals, commissions, rates and settings share compact controls, page hierarchy and table styling.
- Settings groups reference approval, print geometry and support/destructive options in labelled expandable sections.
- Controls have associated labels; keyboard order follows the document. Custom dialogs contain focus, support their existing dismissal behaviour and restore focus. Notifications and permission errors expose appropriate accessible roles.
- Report previews retain explicit draft/issued identity and the existing finalization operation. No backend, database, clinical rules or issued snapshot implementation was changed for this visual task.

Main tokens: canvas `#F5F7FA`, surface `#FFFFFF`, navigation `#14283F`, accent `#087F8C`, text `#18283B`, secondary text `#526174`, borders `#DCE3EB`. Actual theme text/accent contrasts are checked against 4.5:1 in the browser regression. Input borders use `#7C8DA1` for visible control boundaries. Keyboard focus uses a 3px outline.

## Independent review

Two read-only reviewers examined everyday screen hierarchy and visual consistency/accessibility. The lead owned all implementation. Review findings corrected garbled Results labels, low-contrast helper text, a stale reference-editor location instruction and stretched Settings panels. Invoice footer reachability and modal focus were verified in the browser.

## Verification

All fixtures are synthetic. Database-backed browser runs use isolated temporary directories and disable legacy migration.

- `npm test`: 73 passed, 0 failed, 0 skipped.
- `node scripts/test-result-ui.cjs`: passed.
- `node scripts/test-reference-ui.cjs`: passed, including immutable report text and both print modes.
- `node scripts/test-authorization-ui.cjs`: passed, including allowed workflows, denied staff operations and stale sessions.
- `node scripts/test-print-layout.cjs`: passed; nine PDF fixtures, 19 total pages. Short, multi-page, long reference text, custom paper/offsets, draft and calibration cases passed. Generated PDFs were visually inspected in addition to text, page-count and geometry checks.
- `node scripts/test-visual-design.cjs`: passed at 1366×768 and 1920×1080. Checks include horizontal overflow, focus visibility, dialog focus containment, reachable invoice footer, collapsed advanced settings, permission feedback, contrast and cancellation without issuance. No browser page errors.
- `npm run build`: passed, 170 modules transformed.
- `git diff --check` and cached whitespace check: passed.

The screenshot set contains 28 actual before and 30 actual after captures. Before images were captured before the theme changes; they are not reconstructed mockups. An offline gallery compares all screens at both sizes:

`C:\Users\iamro\.codex\visualizations\2026\10\07\01a11794-6b1f-7ed1-ae43-aae170b9430c\workspace-design\gallery.html`

Images are in that directory's `before` and `after` subdirectories. No physical printer alignment was verified; printer calibration remains an onsite check. Browser verification does not substitute for packaged Electron testing or assistive-technology testing.

## Git preservation

Branch: `feature/editable-reference-intervals`.

HEAD: `902cebda110bba7afb4230d4a7d3d5649a36c457`.

The existing index tree remains exactly `0e163d4b2f1215af54f28e05f2af280c1b4b71d8`. No changes from this task were staged or committed. The working tree also contains the earlier T001, reference-interval, printing and authorization implementation; its complete diff must not be mistaken for this visual task alone. No deployment or Cloudflare resources were created.
