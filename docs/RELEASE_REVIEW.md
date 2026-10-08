# Release review — 1.1.0-rc.1

Reviewed 8 October 2026 with independent security/repository, clinical/recovery and packaging/licensing reviewers. Target branch is `feature/editable-reference-intervals`; repository is public. GitHub authentication is available; rulesets are empty and main protection returns "not protected". Publication targets the feature commit, without merging main, force-pushing or deploying Cloudflare.

## Findings and resolutions

1. **High — historical repricing:** current rates and commission percentages could overwrite completed/paid/issued bills during Recalc. Added backend guards preserving existing values for these states or an issued snapshot. Five regression tests pass, including reopened state and transaction failure. Pending/partial unpaid recalculation remains unchanged. This is a bounded integrity fix; a durable historical billing/amendment model remains future work.
2. **High — stale release publication:** scripts/CI could publish latest, select arbitrary old artifacts, overwrite assets and advertise legacy default credentials. Replaced instructions and added exact manifest/hash/commit prerelease publication; removed automatic tag publication. CI verifies/builds only with read-only repository permission. New packages have no default credentials or test trust bypass.
3. **High — licensing readiness:** no production activation exists. Publish only an explicitly named activation-pending prerelease, with installer/login/workspace warnings, no automatic post-install launch, empty production trust configuration and retained read/reprint/backup/recovery workflows.
4. **Licensing rights:** holder Robiul Islam Molla was explicitly confirmed by the user. Added standard MIT, author/package metadata and upstream notices; replaced restrictive installer EULA. Hosted service operation remains separate from MIT source reuse rights.
5. **Secret exclusion:** expanded ignore rules for private keys, environment variants, databases and backups. Only reviewed source/configuration/examples and upstream notices are included. Account IDs are not authentication secrets.

## Verification before packaging

- Clean lockfile install; production/full npm audits: zero reported findings. SheetJS CDN 0.20.3 lies outside ordinary npm-advisory coverage; zero findings are not proof of absence.
- App/system: 15 system + 95 Node checks = **110 passed**, zero failed/skipped.
- Worker/D1: **15 passed**, zero failed/skipped; local deploy dry-run 54.12 KiB / gzip 15.26 KiB, no remote resources.
- Result/reference/authorization/recovery browser suites, owner console UI and actual Worker/D1 browser integration passed. Parallel browser harnesses initially conflicted on shared Vite port 5173; sequential reruns all passed. This was test-runner contention, not a demonstrated application failure.
- Browser/PDF: nine fixtures, 19 pages, saved interval/unit, full/pad/custom calibration, long text/review, draft labels and geometry checks passed.
- Security reviewer scanned 13 reachable commits and source paths, finding no recognized private-key/API-token patterns or tracked database/backup/environment paths. Lead repeat pattern scan: 181 intended source files / 513 text objects, no findings. Synthetic fixture passwords and legacy migration constants are intentional; no discovered values were printed.

Final exact-commit Windows packaging, synthetic smoke/restore/recovery/PDF checks, artifact scan and checksums are recorded in the sanitized verification asset published with the release. Prior 1.0.4 QA hashes in historical documentation do not identify this candidate.

## Explicit limits

Old LFS binary payload is unavailable locally and was not certified; it is not a new release asset. Historical default credentials/shared backup encryption were already public: legacy credentials must be replaced, and legacy backups retain their documented weak-format treatment. Deleting present files cannot erase historical exposure. No newly discovered production secret requires rotation.

Live Cloudflare authentication, real MFA claims, complete owner list pagination and remote load remain release gates for production activation. Signing-kid defaults can be recommended later; no commercial terms are selected. Local file authority can tamper with the app/data. Physical printer alignment/driver output, elevated installation/upgrade and actual power loss are NOT TESTED. Process interruption is distinct from power loss. Independent clinical validation remains required.
