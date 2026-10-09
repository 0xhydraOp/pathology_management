# Windows readiness evidence

Professional-readiness review, 10 October 2026. All exercises use synthetic patients and isolated temporary data. No real lab database, OS shutdown, domain or remote service was touched. This matrix separates executable testing from installer testing.

## Available environment

Host observed through Windows CIM: Windows 11 Home Single Language, version 10.0.26300, build 26300, x64. Windows 10, a second Windows computer and a separate Windows VM are not available in this review. Results on this host cannot establish support on another Windows version or on modest lab hardware.

| Scenario | Evidence/status |
| --- | --- |
| Released offline rc.2 → Section 1 packaged executable | PASS: `scripts/test-professional-installation.cjs`, actual packaged main/preload and local assets; administrator login, issued JSON equality, zero result, print profile and restart |
| Path with spaces and Bengali characters | PASS in the same isolated binary-replacement rehearsal |
| Integrated professional precommit candidate rc.3 upgrade | PASS from both released offline rc.2 and published licensed-code rc.1; local login, version-1 metadata, exact original issued payload bytes, print profile and restart. Final exact-commit build repeat remains required |
| Fresh setup, interrupted setup, offline operations | Dedicated packaged first-run/offline suites; run on the final candidate and record exact results rather than carrying forward earlier passes |
| Published licensed-code rc.1 → Section 1 offline rc.2 | PASS: actual rc.1 executable logged in/viewed an issued synthetic report, confirmed activation-pending restriction; offline replacement preserved report/profile/credentials after restart, archived opaque activation bytes once. No real activated or expired signed grant was used |
| NSIS fresh installation / reinstall | NOT TESTED in an elevated isolated environment |
| NSIS upgrade / installation cancellation / interrupted installation | NOT TESTED; binary replacement is not installer evidence |
| NSIS uninstall preserving existing lab data | Configuration reviewed (`deleteAppDataOnUninstall:false`); actual uninstall NOT TESTED |
| Windows 10 / second machine / VM | NOT TESTED |
| Native PDF driver / physical pad alignment | NOT TESTED unless a separately recorded driver/printer exercise is supplied; compositor PDFs are not equivalent |
| Actual power loss | NOT TESTED; process termination/file failure exercises cannot prove power-loss durability |
| Screen reader / modest hardware | NOT TESTED |

The two baseline binaries both display version `1.1.0-rc.2`; their source builds differ. The original published release remains unchanged. Do not describe this baseline rehearsal as proof of a new version's installer.

The licensed-code baseline fixture uses the exact published `42db0dc` database implementation materialized into a temporary source directory. It creates only synthetic local records via database methods, never a licence bypass, valid grant or remote activation. The actual rc.1 app views those records under its permitted activation-pending read-only workflow. This does not certify every historical licensed installation or a live activated device.

## Safe final repeat

Run with explicit baseline and final candidate executable paths:

```powershell
node scripts/test-professional-installation.cjs "<released-offline-win-unpacked>\Patholy Management System.exe" "<final-candidate-win-unpacked>\Patholy Management System.exe"
node scripts/test-professional-installation.cjs "<published-rc.1-win-unpacked>\Patholy Management System.exe" "<final-candidate-win-unpacked>\Patholy Management System.exe" --licensed-baseline
```

The test creates a new temporary root, redirects APPDATA/LOCALAPPDATA, passes a synthetic-marked `--isolated-data-dir`, checks the main-process directory before any patient operation, closes apps normally and removes only that verified temporary root. It preserves no real user credentials. It does not replace the installed application or invoke its uninstaller. The test's fixed passwords are synthetic fixtures, not shipped accounts.

For installer testing use a disposable Windows VM with a snapshot and a deliberately separate synthetic data directory. Verify executable identity/hash before launch; inspect UAC/install target, shortcuts, uninstall location, upgrade data path, cancellation and restart. Check lab-data survival before and after uninstall; never choose a real lab directory. Record exact OS/build/version and whether elevation occurred. Keep unsupported/unavailable scenarios marked NOT TESTED.

## Packaging finding

The initial inspected `build/installer.nsh` contained an obsolete activation-pending warning, disabled-operation claims and a historical PRERELEASE.md reference. The integration owner corrected it to offline candidate guidance. Verify the generated installer displays that guidance; source review alone is not native installer evidence.

## Release decision

Unsigned binaries may produce Windows reputation/security warnings. A checksum identifies bytes; it does not establish publisher identity or complete security. Stable-production readiness additionally needs installer/upgrade evidence, qualified laboratory rule approval and appropriate physical printing/recovery validation. See MANUAL_UPDATE.md for safe offline update and rollback boundaries.
