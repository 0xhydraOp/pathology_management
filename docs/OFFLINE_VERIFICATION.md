# Offline conversion verification — 10 October 2026

Version 1.1.0-rc.2, Windows 11 x64; synthetic patients and isolated temporary databases only. The GitHub candidate is a prerelease, unsigned and fully offline. Website files, DNS, certificates, Cloudflare resources and historical release artifacts remain unchanged.

## Completed local source and precommit package checks

- Application suite: 15 system checks + 94 targeted tests = **109 passed**, zero failures/skips; includes production Vite build.
- Five browser suites passed: result entry (normal/batch), approved intervals/explicit finalization, authorization/stale sessions, backup/recovery and visual design at 1366×768/1920×1080.
- Packaged executable: interrupted/no-account setup, completed setup→login after restart, formerly expired activation migration, existing users, local registration, zero/numeric/qualitative results, staff/admin denial, atomic issuance and immutable restart/reprints.
- Packaged backup/recovery: encrypted backup, wrong passphrase, cancellation, stale restore candidate, restore/logout/restart, second-instance lock, active-database recovery rejection and closed-app packaged password recovery.
- Compositor PDFs: draft 1 page, pad short 1, full short 1, pad multipage 10, full multipage 10. Text, saved content, page counts and approximately A4 dimensions passed; full/pad renders visually inspected. Browser print tests also cover custom dimensions, offsets and long reference/review text.
- Offline proof: production contains no licensing modules/IPC/renderer controls or provider dependencies; Chromium HTTP(S) requests are blocked before database startup. Exercised packaged workflows reject network access and recorded no application outbound HTTP requests. This is application-level instrumentation/static inspection, not an OS packet capture.
- Migration tests: verified usable recovery database before removing recognized activation files; exact archived bytes, clinical table preservation/reopen, activated/unactivated/expired states, idempotency, interrupted setup and backup/archive failures passed.
- Dependency audit: zero reported findings. This excludes unknown vulnerabilities and does not substitute for review; SheetJS CDN distribution is outside ordinary npm advisory coverage.
- Independent security/migration review found no demonstrated critical/high blocker in the conversion. Source clinical formulae/thresholds/reference values are unchanged. Test processes closed gracefully.

## Limits and release gates

Repeat the three packaged suites on the exact tagged commit's new build before publication; include their result and hashes in the release verification attachment. Do not publish the precommit test package.

Windows 10 is supported by the selected Electron runtime but not tested here. Physical printer/driver output and alignment, elevated installation/upgrade and actual power-loss scenarios are **NOT TESTED**. Dialog responses in automated restore/recovery tests are controlled; they verify application behavior rather than every native shell interaction. Browser/compositor PDF output does not certify native print drivers. Clinical/lab validation remains required.

Local OS users with write access can tamper with executable/data or race path-based activation cleanup; static symlinks are rejected but arbitrary hostile same-user filesystem race immunity is not claimed. Recovery/activation archives inherit filesystem protection and must be protected like the database. WorkOS/D1/Cloudflare owner infrastructure is removed from the current source tree. Automatic approval review rejected recursive removal of ignored local Worker build/dependency caches; those caches are excluded from commits and packaged/release assets. No alternate deletion method was used.

Existing website activation text, Developer-area link and historical downloads were intentionally left intact for a separate website update. No online service or key is required by the new desktop app. MIT and shared dependency notices remain.
