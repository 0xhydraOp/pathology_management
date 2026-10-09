> Historical verification record: applies to the version/date below. Current offline behavior and readiness are documented in README.md and OFFLINE_RELEASE.md; historical activation instructions do not apply.

# Packaged Windows QA — 8 October 2026

This document records the earlier Electron 33/v1.0.2 QA build. The subsequent supported Electron 44/v1.0.3 build and dependency resolutions are recorded in [DEPENDENCY_SECURITY.md](DEPENDENCY_SECURITY.md); historical results below are retained.

Branch: `feature/editable-reference-intervals`; base commit: `902cebda110bba7afb4230d4a7d3d5649a36c457`. Changes remain uncommitted. The 12 previously staged files were preserved; index tree remains `0e163d4b2f1215af54f28e05f2af280c1b4b71d8`.

## Build identity

Patholy Management System 1.0.2, Windows x64, Electron 33.4.11. Production resources load from `app.asar/dist/index.html`, without a development server. Windows product/description/version resources and visible application titles use the generic product name. Internal package name and app ID retain their previous values to preserve upgrade/data-directory identity. Existing lab names and issued report headers remain clinical snapshot content.

- Executable: `release/packaged-qa-final/win-unpacked/Patholy Management System.exe`
- SHA-256: `18E6DF6CAA2213592FA7C69EB36D1C90AFB6427F95DCFDE0E7B9B02649C882CF`
- Installer: `release/packaged-qa-final/Patholy Management System Setup 1.0.2.exe`
- SHA-256: `E3733212BF393440C1E11BA7C373F96BF658E7CE852B4D91834D08E7D6794DEE`
- Unsigned; signing was skipped. Nothing was published or deployed.

The builder's cached winCodeSign archive initially failed extracting macOS symlinks without Windows symlink privileges. Its Windows helpers were extracted without the Darwin subtree; Windows security settings were not changed. Version-resource editing then succeeded.

## Isolation and fixes

Every executable launch used an absolute `--isolated-data-dir` with a matching `synthetic-qa.json` marker. The main process sets user/session storage before instance locking and disables legacy migration for this mode. Native backup/restore default folders also remain inside that directory. No real lab database was opened.

This QA fixed uninstall data deletion, public application branding, packaged development-server fallback, sandbox/navigation/new-window restrictions, and the corrupt-startup recovery window. Creating the recovery window before destroying the splash prevents an unintended application exit. Recovery instructions are shipped beside the executable. Clinical rules, catalogue IDs and billing values were unchanged.

## Results

| Check | Result and evidence |
| --- | --- |
| Production executable | PASS: final packaged smoke uses actual main/preload/renderer; no IPC mocks. Fresh admin setup, login/logout, staff denial, registration, zero/qualitative results, issuance and immutable edit denial passed. |
| Native boundaries | PASS: context isolation and sandbox enabled, Node unavailable in renderer, generic SQL unavailable, external navigation/new windows denied. |
| Restart and second instance | PASS: committed synthetic state and issued snapshots survived restart; second launch exited without a second writer. |
| Credential recovery | PASS: active-database recovery rejected; closed-app recovery created a verified snapshot and authenticated audit; recovered account logged into the installed executable. |
| Backup/restore dialogs | PASS: native encrypted save/open, wrong-passphrase rejection, save cancellation, candidate cancellation, stale-session rejection and confirmed restore followed by login. Issued snapshot preserved. |
| Write failure | PASS: read-only synthetic database caused replacement failure; in-memory state and disk hash stayed unchanged. Attribute restored afterward. |
| Interrupted writes | PASS: child killed after temporary-file flush and before rename preserved original bytes; stale lock recovery reopened the original database. Actual packaged main termination/restart also preserved committed snapshots. These are process-interruption tests, not power-loss tests. |
| Corrupt startup | PASS on final build: zero-byte synthetic database preserved, recovery screen stays visible, sandbox/isolation enabled and Node disabled. |
| Installer | PASS within isolated per-user test variant: install, installed-executable login, same-version reinstall and uninstall. Database hashes and preservation sentinels unchanged; QA registry entry removed. |
| Native PDF driver | PARTIAL: Microsoft Print to PDF dialog and cancellation verified; output filename prompt could not be reliably controlled, so output was cancelled. Driver-produced PDF dimensions/pagination NOT TESTED. |
| Electron compositor PDFs | PASS: six packaged fixtures, 24 pages total. Full/pad short reports one page each; full/pad long reports ten pages each; calibration and custom-paper reports one page each. Text, counts and visual renders inspected. A4 approximately 209.89 × 297.01 mm; custom 180 × 240 mm approximately 179.92 × 239.86 mm. |
| Historical content/calibration | PASS: issued clinical snapshots preserved after settings edits/restart/restore. Custom paper and +1/-1 mm offsets changed physical layout without modifying clinical snapshots; original profile restored. |
| Physical printer | NOT TESTED: unavailable. |
| Production elevated install/upgrade | NOT TESTED: per-machine UAC, real previous installation upgrade and a different-version upgrade. No configured updater was exercised. |
| Actual power loss | NOT TESTED; no computer shutdown performed. |

The installer test variant used a separate app ID, no elevation, no shortcuts and no automatic launch. It did not replace the real product registration. A silent `/D` invocation containing spaces was parsed at its first space; the actual QA installation directory was verified before use/uninstall. Normal GUI custom-path installation is not certified by that invocation. Application/data paths containing spaces and Bengali characters were exercised successfully.

## Automated verification

- Existing suite: 15 system checks plus 67 Node tests, **82 passed, zero failed/skipped**.
- Result, reference, authorization and recovery browser regressions: passed.
- Print-layout regression: nine fixtures, 19 pages, geometry/text/count checks passed.
- Final executable packaged smoke: passed after the recovery lifecycle fix.
- Targeted print-profile suite after final fix: six passed, zero failed.
- Production Vite build: passed, 173 modules. Final NSIS package build passed.
- JavaScript syntax and `git diff --check`: passed.

## Evidence location

Synthetic artifacts are retained at:
`C:/Users/iamro/.codex/visualizations/2026/10/07/01a11794-6b1f-7ed1-ae43-aae170b9430c/packaged-windows-qa`

Current-brand screenshots: `patholy-login.png`, `patholy-dashboard.png`, `patholy-multipage-report.png`, `patholy-installed-recovered-login.png`, `patholy-recovery-screen.png`. PDFs: `electron-full-short.pdf`, `electron-pad-short.pdf`, `electron-full-multipage.pdf`, `electron-pad-multipage.pdf`, `electron-calibration.pdf`, `electron-custom-offset.pdf`. First/last page PNGs and immutable snapshot JSONs are retained. Earlier `packaged-*.png` screenshots predate the branding rebuild.

## Release blockers and limitations

- Electron 33 reached end of support on 28 April 2025: https://releases.electronjs.org/schedule . Upgrade to a supported runtime and repeat native QA before release.
- Runtime dependency audit reports one high (`xlsx`) and three moderate package entries in the router dependency chain. This is an advisory inventory, not proof of exploitability. Current XLSX paths export only; routing uses HashRouter without SSR hydration. Reachability and dependency remediation still require review. Full audit is retained in `release/packaged-qa-final/runtime-audit.json`.
- Driver-produced PDF output, physical alignment, elevated installation and upgrade remain unverified.
- Administrator recovery still requires the compatible repository command and Node runtime; the shipped guide is not a bundled recovery executable. No hidden account exists.
- Windows files inherit directory ACLs: the synthetic root allowed owner/SYSTEM/Administrators full access and an inherited sandbox group read/execute. POSIX mode 0600 does not establish a Windows DACL. Production deployment must assess its own data-folder permissions; no OS security settings were changed.
- Safe temporary replacement cannot establish actual power-loss durability. Full-snapshot storage remains in use; this task did not replace the storage engine.

## Manual physical-print checklist — alignment NOT TESTED

1. Select the exact paper size in both profile and driver. Use 100% scale; disable fit/shrink and browser headers/footers.
2. Print the patient-free calibration page. Measure the 100 mm line with a ruler and verify horizontal/vertical marks against the pad.
3. Adjust current printer offsets, then check reserved header/footer clearance and all four columns. Do not edit clinical snapshots for alignment.
4. Print short and long synthetic full/pad reports. Check wrapped rows, patient identification, page numbering, final-page content and absence of blank/clipped pages.
5. Cancel a draft print and confirm it remains editable. Reprint an issued report and compare its saved clinical content.
6. Record driver/printer/paper/profile details and measured deviations before approving physical use.
