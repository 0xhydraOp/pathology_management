> Historical verification record: applies to the version/date below. Current offline behavior and readiness are documented in README.md and OFFLINE_RELEASE.md; historical activation instructions do not apply.

# Supported runtime and dependency security verification

Verified **8 October 2026** on Windows 11 x64 using synthetic databases only. This report supersedes the dependency blockers in the earlier T001 and Electron 33 QA reports; those documents retain their historical results.

## Selected versions and support evidence

Application version: **1.0.3**. `package.json` is the version source for Vite's generated HTML title, React product labels and Electron's packaged `app.getVersion()`. The login window no longer retains the hard-coded 1.0.2 title. Internal package name and app ID remain unchanged to preserve data-directory and upgrade identity.

| Component | Selected version | Official evidence / rationale |
| --- | --- | --- |
| Electron | **44.7.0**, exact pin | [Stable releases](https://releases.electronjs.org/?channel=stable), released 7 October 2026. [Support schedule](https://releases.electronjs.org/schedule): major 44 reaches EOL **2 March 2027**; former major 33 reached EOL 28 April 2025. |
| Chromium / bundled Node | **152.0.7977.130 / 24.21.0** | Official Electron stable release metadata; confirmed from the actual packaged process. Electron is production runtime even though its npm installer is a dev dependency. |
| React Router DOM / Router | **7.18.4**, exact direct pin | [Upstream release](https://github.com/remix-run/react-router/releases/tag/react-router@7.18.4). Newer advisories require 7.18+, so the interim 6.30.6 update was insufficient. Existing declarative HashRouter, imports and workflows are retained; React 18.3.1 is compatible. |
| SheetJS CE | **0.20.3**, exact official CDN URL | [Official installation guidance](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/): npm's 0.18.5 endpoint is stale; the official CDN is authoritative. |
| Vite | **6.4.4**, exact pin | [Upstream release](https://github.com/vitejs/vite/releases/tag/v6.4.4). Retains the existing Vite major and patches the reviewed dev-server findings. |
| electron-builder | **26.15.3**, exact pin | [Upstream release](https://github.com/electron-userland/electron-builder/releases/tag/electron-builder@26.15.3). Verified production dependency inclusion, resources and unsigned NSIS build. |
| Sharp | **0.35.5**, exact pin | [Upstream release](https://github.com/lovell/sharp/releases/tag/v0.35.5). Build-icon dependency only; regenerated icon had no Git content change. |
| SQL.js | **1.14.2** in lockfile | Compatible refresh within existing ^1.11.0 range. Persistence, old database/backup compatibility and issued content were verified. No storage-engine or database-schema replacement. |
| Other direct dependencies | React/React DOM 18.3.1; JsBarcode 3.12.3; plugin-react 4.7.0; concurrently 9.2.4; cross-env 7.0.3; png-to-ico 3.0.2; wait-on 8.0.5 | Lockfile records exact resolved versions. Compatible transitive refresh, without `npm audit fix --force`. |

Windows requirements remain **Windows 10 or newer, x64**. Electron 44 stops distributing 32-bit Windows binaries; this product already targeted x64. Windows 7/8/8.1 are not supported. This machine establishes Windows 11 compatibility; Windows 10 was not executed here. See [Electron platform requirements](https://github.com/electron/electron/blob/main/README.md) and [breaking changes](https://www.electronjs.org/docs/latest/breaking-changes). The build host now requires Node **22.12+** (declared in `engines`); an installed lab computer needs no separate Node runtime. Continued security patching is required before and after the stated EOL date.

## Advisory applicability and resolution

The initial full audit reported **45 affected package entries** (2 low, 9 moderate, 31 high, 3 critical). Counts include propagated dependencies and are not a count of distinct exploitable application vulnerabilities. After deliberate direct upgrades, compatible updates and two scoped overrides, both final `npm audit` and `npm audit --omit=dev` report **zero findings**, with successful exits. There is no audit suppression.

| Finding / component | Actual applicability | Resolution and verification |
| --- | --- | --- |
| Unsupported Electron 33 | Actual production browser/Node runtime, independent of npm dev classification. | Electron 44.7.0; actual packaged setup, IPC, sandbox, navigation, printing, recovery and persistence checks passed. |
| SheetJS prototype pollution, CVE-2023-30533; ReDoS, CVE-2024-22363 | Runtime dependency, but app paths create/write Excel exports. No XLSX read/readFile ingestion path was found in application source. This limits demonstrated parser exposure; it does not justify shipping the obsolete version. | Official CE 0.20.3 exceeds published fix thresholds 0.19.3 and 0.20.2. Synthetic exported workbook round-trip verified using the upgraded dependency. [Upstream distribution guidance](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/), [prototype-pollution advisory](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6), [ReDoS advisory](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9). |
| Router protocol-relative/backslash redirect and SSR constructor injection | App uses declarative HashRouter, fixed local routes and no SSR hydration/data-loader redirects. SSR advisory explicitly excludes declarative mode. A user-controlled external redirect path was not demonstrated; navigation denial is also enforced in Electron. | Router 7.18.4 resolves reviewed affected version ranges. Login, navigation, registration, reports, permissions and browser regressions passed. [Redirect advisory](https://github.com/remix-run/react-router/security/advisories/GHSA-wrjc-x8rr-h8h6), [SSR advisory](https://github.com/remix-run/react-router/security/advisories/GHSA-337j-9hxr-rhxg). |
| Vite file-access / Windows path and editor findings | Development server/build environment; packaged renderer loads file resources without a dev server. Exposed dev servers and untrusted requests remain a build-environment concern. | Vite 6.4.4, compatible major; production build and browser harnesses passed. [Windows advisory](https://github.com/vitejs/vite/security/advisories/GHSA-fx2h-pf6j-xcff). |
| shell-quote command injection | concurrently build/dev command parsing, absent from packaged runtime. Commands currently come from project scripts rather than patient input. | Scoped `concurrently -> shell-quote 1.12.0` override, beyond the 1.11.0 fix. Quoting smoke checked spaces/newlines/semicolons. [Advisory](https://github.com/advisories/GHSA-pqg4-j6r4-53mv). |
| sprintf-js precision DoS through roarr/global-agent | Optional build downloader proxy/logger chain, absent from packaged runtime. Network/toolchain input still requires care. | Scoped `@electron/get -> global-agent 4.1.3` override removes roarr/sprintf-js while retaining `bootstrap()`. Bootstrap smoke and normal package download/build passed. A proxy network route was not tested. [Upstream changes](https://github.com/gajus/global-agent/releases), [advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c). |
| Sharp/native image library findings | Build-icon tooling, not application image processing. | Sharp 0.35.5; icon build passed. [Upstream advisory](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w). |
| Babel, PostCSS, source-map-js, Axios, tar, tmp, xmldom, archive/build-tool chains | Build/download/dev environment. Not shipped renderer/backend dependencies. Malicious source maps, archives and network inputs may still affect the developer machine. Linux AppImage findings do not apply to this Windows NSIS target. | Compatible transitive refresh plus builder upgrade; affected versions removed or patched, final full audit zero. No force upgrades or unsupported broad overrides. Baseline and final machine-readable audit details retained in the security evidence directory. |

## Outside npm audit coverage

**Zero reported findings is not demonstrated absence of vulnerabilities.** npm audit only reports known advisories for the submitted dependency graph. It is not a source audit, penetration test or a comprehensive scan of native binaries, non-registry distributions or application logic.

SheetJS is a non-registry tarball and cannot be certified by a zero npm audit result. Its version was checked against official vendor documentation and known advisories separately. A fresh download from the official HTTPS CDN matched the committed lockfile SHA-512 integrity exactly:

```
sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==
```

Tarball SHA-256: `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`. This establishes consistency with the lockfile and retrieved distribution, not an independent signature audit or proof that its parser is safe for every hostile spreadsheet. No new spreadsheet-import feature was added.

Electron's bundled Chromium/V8/Node, SQL.js WASM, NSIS, 7-Zip and other downloaded packaging executables require vendor maintenance and separate binary/security review; npm audit does not certify their compiled contents. The supported Electron runtime was verified from official release metadata and executed. A full native-component vulnerability scan and supply-chain attestation were not performed. Direct inspection of `app.asar` confirmed it contains only the production npm packages; Sharp/WASM build artifacts, global-agent and shell-quote were not shipped.

## Packaged recovery and compatibility

The installed **Recover Administrator.cmd** starts the same executable with `--recover-administrator`. No development checkout or external Node installation is required. Follow [RECOVERY.md](RECOVERY.md): close all writers, select an existing directory, choose an existing administrator, enter/repeat a replacement password and type `RESET ADMINISTRATOR`. OS read/write access, supported current schema and exclusive database ownership are required. Selection/cancellation does not migrate or rewrite the database. A verified pre-reset copy precedes the atomic credential/audit update. The audit records the Windows account; no hidden account, new role or remote bypass exists.

Independent review identified close-during-selection cleanup; it was fixed and regression-tested. The previous maintainer CLI now reuses this validation service instead of invoking migration during recovery.

An encrypted synthetic backup created by the previous **Electron 33.4.11** executable was selected using the actual Windows dialog and restored by **Electron 44.7.0**. Summary: **3 patients, 3 orders, 2 users and 2 issued reports**. Every table matched the backup except `audit_log`: all **22 prior entries** were preserved and one authenticated restore event was added. Thus catalogue IDs, patient/order/result rows, interval approvals, users, report snapshots and lab settings were preserved. Restart/login succeeded, with both issued snapshots unchanged. The original synthetic fixture was copied first; no real database was opened.

## Verification and limits

- Final full suite: **15 system + 73 Node checks = 88 passed; zero failures/skips**.
- Existing result, reference, authorization and recovery browser suites passed after upgrades; browser print suite verified nine fixtures/19 pages, including long reference/review text and custom dimensions/calibration.
- Final rebuilt executable smoke passed, including fresh setup/login, v1.0.3 native title, real preload/main, staff denial, zero/qualitative results, issuance, immutable edits and external navigation/new-window denial.
- Expanded packaged workflow passed: draft preview/cancellation, explicit finalization, immutable content, XLSX export, authenticated encryption, wrong passphrase, restore/cancel/stale candidate, restart, second-instance exit and packaged recovery with app closed. File-selector returns are controlled in that repeatable automated test; actual dialogs were separately exercised for the compatibility restore.
- Actual native dialogs: restore cancellation and pending-dialog logout/session revocation rejected safely; encrypted-save cancellation passed. Twelve-hour session expiry uses a controlled clock in authorization and pending-restore-selector regressions; this is not a twelve-hour native-dialog soak test.
- Corrected PDF harness uniquely selects the app window rather than an open PDF viewer and waits for the expected issued/draft report. Five actual Electron compositor fixtures verified **23 pages**: draft/pad-short/full-short one each, pad/full long reports ten each. Text, DRAFT labels, identifiers on every page, numbering and A4 dimensions (approximately **209.89 × 297.01 mm**) passed; rendered first/last pages inspected visually. These are compositor checks, not printer-driver certification.
- Synthetic interrupted-write regression passed: flushed temporary write interrupted before replacement, original retained, stale ownership recovered, restart/login passed. This does not establish power-loss durability.
- Both final executable and installer are **unsigned**. Build succeeded; no signing, publishing or deployment occurred.

Remaining release checks: **PDF-driver output, physical printing/alignment, elevated installation/upgrade and actual power loss — NOT TESTED**. Windows 10 execution, proxy download routing, production-directory ACL assessment and independent native supply-chain/security review remain unverified. Full-snapshot persistence and filesystem/power-loss limitations in RECOVERY.md still apply. This report does not claim the application is fully secured.

## Artifacts and Git preservation

Build directory: `release/supported-runtime-qa`.

- `win-unpacked/Patholy Management System.exe`, v1.0.3, SHA-256 **C6AC6247BD4238843F726500AC650AD5593F86BE06E2DFC4D5466DEAE620DEA5**.
- `Patholy Management System Setup 1.0.3.exe`, SHA-256 **132E7B6A4E30E6EB23D2C529A57F4F3CB226271263E0896FC1829779EBAA28E2**.

Repository evidence: `release/dependency-upgrade-verification/security` (baseline/final audits and CDN tarball), `browser-pdf` (browser PDFs), `packaged` (actual executable PDFs, page renders, runtime metadata and recovery screenshot).

Native compatibility evidence: `C:/Users/iamro/.codex/visualizations/2026/10/07/01a11794-6b1f-7ed1-ae43-aae170b9430c/packaged-windows-qa/supported-runtime/compatibility-verification.json` and `final-restart-dashboard.png`.

Branch remains `feature/editable-reference-intervals`, HEAD `902cebda110bba7afb4230d4a7d3d5649a36c457`. Changes are uncommitted. All **12 original staged paths** and their exact contents remain preserved: index tree **0e163d4b2f1215af54f28e05f2af280c1b4b71d8**. Test processes were closed gracefully and no Patholy/Mondal process remained at the final check.

Current task changes: package/lock and Vite title generation; main recovery dispatch/native title; dedicated recovery service/window/preload/UI; installed recovery launcher and guides; maintainer CLI reuse; targeted recovery and packaged/PDF regression harnesses; this report. Existing clinical values, schema, issued snapshots, design and prior work were preserved.
